const fs=require('node:fs/promises'),path=require('node:path');
const runtimeModel=require('../renderer/runtime-model.js'),frameModel=require('../renderer/frame-model.js');
const {exportRuntime}=require('./runtime-export.cjs');
function framePreviewBytes(preview,pngBytes){
 if(!preview)return null;const b=preview.bounds,pad=Number.isInteger(b?.x)?-b.x:null;
 if(pad===null||pad<0||pad>512||b.y!==-pad||b.width!==1024+pad*2||b.height!==1536+pad*2||preview.time!==0)throw Error('边框预览范围无效');
 const bytes=pngBytes(preview.src);if(bytes.length<24||bytes.readUInt32BE(16)!==b.width||bytes.readUInt32BE(20)!==b.height)throw Error('边框预览尺寸不匹配');return bytes;
}
async function exportCard(dir,doc,args,worker,{atomicWrite,pngBytes}){
 await fs.mkdir(dir,{recursive:true});
          const framePreview=framePreviewBytes(args.framePreview,pngBytes);if(framePreview){await fs.mkdir(path.join(dir,'previews'),{recursive:true});await fs.writeFile(path.join(dir,'previews/frame.png'),framePreview);}
          await atomicWrite(path.join(dir,'card.cardproj'),JSON.stringify(doc));
          await fs.writeFile(path.join(dir,'front.png'),pngBytes(args.front));
          const backAsset=doc.back?'back.'+doc.back.slice(11,doc.back.indexOf(';')):null;if(doc.back)await fs.writeFile(path.join(dir,backAsset),Buffer.from(doc.back.split(',')[1],'base64'));
          let backScene;if(doc.backScene){await fs.mkdir(path.join(dir,'backs'));backScene={...doc.backScene,src:backAsset,layers:[]};for(const layer of doc.backScene.layers){const ext=layer.src.slice(11,layer.src.indexOf(';')),file='backs/'+layer.id+'.'+ext;await fs.writeFile(path.join(dir,file),Buffer.from(layer.src.split(',')[1],'base64'));backScene.layers.push({...layer,src:file});}}
          await fs.mkdir(path.join(dir,'masks'));
          await fs.mkdir(path.join(dir,'layers'));
          await fs.mkdir(path.join(dir,'fonts'));await fs.mkdir(path.join(dir,'titles')); 
          for(const font of doc.fonts||[]){const ext=font.src.slice(10,font.src.indexOf(';'));await fs.writeFile(path.join(dir,'fonts',font.family+'.'+ext),Buffer.from(font.src.split(',')[1],'base64'));}
          for(const [id,png] of Object.entries(doc.masks)){
            if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('无效 Mask ID');
            await fs.writeFile(path.join(dir,'masks',id+'.png'),pngBytes(png));
          }
          let particles=doc.particles;if(particles?.sprite){await fs.mkdir(path.join(dir,'particles'),{recursive:true});await fs.writeFile(path.join(dir,'particles/sprite.png'),pngBytes(particles.sprite));particles={...particles,sprite:'particles/sprite.png'};}
          const layers=[];for(const layer of doc.layers){const {src,master,cutoutMask,...metadata}=layer;if(cutoutMask){const maskFile='masks/'+layer.id+'-cutout.png';await fs.writeFile(path.join(dir,maskFile),pngBytes(cutoutMask));metadata.cutoutMaskAsset=maskFile;}if(layer.titleArt){metadata.titleArt={...layer.titleArt,variants:[]};for(const v of layer.titleArt.variants){const {src:variantSource,...variant}=v,file='titles/'+layer.id+'-'+v.locale+'.png',raster=args.titleRasters?.[layer.id]?.[v.locale]||variantSource;if(!raster)throw Error('缺少语言字标栅格：'+layer.name+' / '+v.locale);await fs.writeFile(path.join(dir,file),pngBytes(raster));metadata.titleArt.variants.push({...variant,rasterAsset:file,...(args.titleBounds?.[layer.id]?.[v.locale]?{bounds:args.titleBounds[layer.id][v.locale]}:{})});}}const png=src||args.layerRasters?.[layer.id];if(png){const ext=png.slice(11,png.indexOf(';')),file='layers/'+layer.id+'.'+ext;await fs.writeFile(path.join(dir,file),ext==='png'?pngBytes(png):Buffer.from(png.split(',')[1],'base64'));metadata.asset=file;}layers.push(metadata);}
          if(doc.foregroundMesh)await fs.writeFile(path.join(dir,'foreground-mesh.json'),JSON.stringify(doc.foregroundMesh));
          await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({schema:'card-atelier-assets/1',layerTree:doc.layerTree,characterRig:doc.characterRig,componentScenes:doc.componentScenes,backAsset,backScene,backAdjustments:doc.backAdjustments,name:doc.name,width:doc.width,height:doc.height,uvOrigin:'top-left',...(framePreview?{framePreview:{asset:'previews/frame.png',bounds:args.framePreview.bounds,time:0}}:{}),previewMode:doc.previewMode||'sample',effects:doc.effects,cosmetics:doc.cosmetics,material:doc.material,particles,emissionRegions:doc.emissionRegions,spatial:doc.spatial,locale:doc.locale||'zh-CN',composition:{...runtimeModel.compositionDefaults,...doc.composition},armor:{...runtimeModel.armorDefaults,...doc.armor},masks:Object.keys(doc.masks),maskSemantics:{motion:'0=fixed, 1=moving; effective weight = motion * (1 - rigid)',inset:'0=eligible to pop over allowed frame edges, 1=occluded outside projected aperture; inside pass is complete alpha; shared continuous mesh' ,emission:'local emission coverage',phase:'flow order 0..1',coverage:'grayscale visibility, separate from PNG alpha',rigid:'0=free, 1=protected',foil:'0=protected skin/cloth, 1=armor periodic highlight'},meshGuides:doc.meshGuides||[],foregroundMesh:doc.foregroundMesh?'foreground-mesh.json':null,layers,fontDependencies:doc.layers.filter(l=>l.kind==='text').flatMap(l=>(l.titleArt?.variants||[{locale:null}]).map(v=>{const family=v.style?.fontFamily||l.textStyle?.fontFamily||'STKaiti',font=(doc.fonts||[]).find(f=>f.family===family);return {layerId:l.id,locale:v.locale,family,portableRaster:v.locale?'titles/'+l.id+'-'+v.locale+'.png':'layers/'+l.id+'.png',embedded:font?'fonts/'+family+'.'+font.src.slice(10,font.src.indexOf(';')):null};})),cardStats:require('../renderer/card-stats.js').resolve(doc),frameStyle:frameModel.resolve(doc),frameStyles:(doc.frameStyles||[]).map(s=>({...frameModel.resolve({frameStyle:s}),id:s.id})),deformation:doc.deformation||runtimeModel.defaults.deformation,actions:doc.actions||runtimeModel.defaults.actions,slots:doc.slots||[],shader:doc.shader||runtimeModel.defaults.shader,runtime:'GLSL ES 1.00 reference player; Godot SDK uses separately adapted spatial shaders'},null,2));
          await fs.writeFile(path.join(dir,'README.txt'),'PNG 与 Mask 可导入 Godot。front.png 是当前 2D 合成；card.cardproj 保留源图、参数与可编辑 Mask。区域网格为编辑引导，未新增独立护腕表面。当前不包含完整 Godot 动态材质与场景适配。\n');
          await exportRuntime(dir,doc,worker);

}
module.exports={exportCard,framePreviewBytes};
