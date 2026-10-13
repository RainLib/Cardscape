const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const model=require('../renderer/workshop-model.js'),storage=require('./workshop-storage.cjs'),{exportCard}=require('./card-export.cjs');
async function exportWorkshop(directory,w,outputs,worker,io){
 for(const c of w.cards){if(!outputs?.[c.id])throw Error('缺少卡片导出图：'+c.name);io.pngBytes(outputs[c.id].front);}
 await fs.mkdir(path.join(directory,'shared'),{recursive:true});const written=new Set();
 async function shared(bytes,ext){const hash=createHash('sha256').update(bytes).digest('hex'),name=hash+'.'+ext;if(!written.has(name)){await fs.writeFile(path.join(directory,'shared',name),bytes);written.add(name);}return 'shared/'+name;}
 async function uri(value){if(typeof value==='string'&&value.startsWith('data:')){const match=/^data:([^;]+);base64,(.+)$/.exec(value);if(!match)throw Error('导出素材编码无效');return shared(Buffer.from(match[2],'base64'),match[1].split('/')[1]);}if(Array.isArray(value))return Promise.all(value.map(uri));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,x])=>[k,await uri(x)])));return value;}
 const cards=[],manifests=new Map();
 for(const c of w.cards){const doc=model.resolve(w,c.id),dir=path.join(directory,'cards',c.id);await exportCard(dir,doc,outputs[c.id],worker,io);const m=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
  async function move(file){const full=path.join(dir,file),target=await shared(await fs.readFile(full),path.extname(file).slice(1));await fs.rm(full);return '../../'+target;}
  if(m.framePreview)m.framePreview.asset=await move(m.framePreview.asset);m.frontAsset=await move('front.png');m.backAsset=doc.back?await move(m.backAsset||'back.png'):null;if(m.backScene){m.backScene.src=m.backAsset;for(const l of m.backScene.layers)l.src=await move(l.src);}
  m.maskAssets={};for(const id of m.masks)m.maskAssets[id]=await move('masks/'+id+'.png');
  if(m.particles?.sprite)m.particles.sprite=await move(m.particles.sprite);
  for(const l of m.layers){if(l.asset)l.asset=await move(l.asset);if(l.cutoutMaskAsset)l.cutoutMaskAsset=await move(l.cutoutMaskAsset);for(const v of l.titleArt?.variants||[])if(v.rasterAsset)v.rasterAsset=await move(v.rasterAsset);}
  m.shaderAssets={vertex:await move('shaders/card.vert.glsl'),fragment:await move('shaders/card.frag.glsl')};if(m.foregroundMesh)m.foregroundMesh=await move(m.foregroundMesh);
  for(const f of doc.fonts||[]){const file='fonts/'+f.family+'.'+f.src.slice(10,f.src.indexOf(';')),ref=await move(file);for(const d of m.fontDependencies)if(d.family===f.family)d.embedded=ref;}
  for(const d of m.fontDependencies){const l=m.layers.find(l=>l.id===d.layerId);d.portableRaster=(d.locale?l?.titleArt?.variants.find(v=>v.locale===d.locale)?.rasterAsset:l?.asset)||null;}
  try{m.bakedAssets={};for(const file of await fs.readdir(path.join(dir,'baked-layers')))m.bakedAssets[file]=await move('baked-layers/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.rm(path.join(dir,'card.cardproj'));await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m,null,2));
  await fs.writeFile(path.join(dir,'README.txt'),'此卡的纹理、Mask、几何和 GLSL 路径见 manifest.json，指向工坊根目录 shared/。源工程为 ../../project.cardworkshop。启动根目录静态 HTTP 服务后打开 ../../index.html。PNG 可导入 Godot；完整godot/ 内包含可运行的动态 SDK、Resource 库和预览场景。\n');
  manifests.set(c.id,m);cards.push({id:c.id,name:c.name,player:'cards/'+c.id+'/index.html',thumbnail:m.frontAsset.slice(6),bindings:c.bindings});
 }
 const runtimeWorkshop={...w};delete runtimeWorkshop.backgroundArchive;const graph=await uri(runtimeWorkshop);await fs.writeFile(path.join(directory,'workshop.json'),JSON.stringify({schema:'card-workshop-assets/1',name:w.name,cards,resources:graph.resources,previewDefaults:graph.previewDefaults||{},recipes:graph.cards,sharedFileCount:written.size},null,2));
 await io.atomicWrite(path.join(directory,'project.cardworkshop'),storage.serialized(w,io.validateProject));
 for(const name of ['workshop-player.js','workshop-player.css'])await fs.copyFile(path.join(__dirname,'../renderer',name),path.join(directory,name));await fs.copyFile(path.join(__dirname,'../renderer/workshop-player.html'),path.join(directory,'index.html'));
 await fs.writeFile(path.join(directory,'README.txt'),'启动静态 HTTP 服务后打开 index.html，选择卡片与动作。shared/ 按内容摘要去重图像、Mask、几何与 GLSL；workshop.json 保留卡片引用与资源版本。project.cardworkshop 是可重新打开的源工程。每张卡的播放器读取共享文件；godot/ 内包含可运行的动态 SDK、Resource 库和预览场景。\n');
 const godot=await require('./godot-export.cjs').exportGodot(directory,w,manifests);
 return {directory,godot,cards:cards.length,resources:w.resources.length,sharedFiles:written.size};
}
module.exports={exportWorkshop};
