/* Runtime variants use the registered UV canvas. Source pixels, masks, rig and
 * FFD remain in the editable project; only colour textures are resampled. */
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),P=require('../renderer/export-profile.js');
async function exportTextures(directory,doc,worker){
 if(!doc.exportSettings)return;
 const settings=P.validate(doc.exportSettings),preset=P.presets[settings.preset],file=path.join(directory,'manifest.json'),m=JSON.parse(await fs.readFile(file)),variants={},requests=new Map();
 await fs.mkdir(path.join(directory,'variants'),{recursive:true});
 async function convert(asset){if(!asset)return asset;if(requests.has(asset))return requests.get(asset);const task=(async()=>{
  const source=await fs.readFile(path.join(directory,asset)),ext=path.extname(asset).slice(1),uri='data:image/'+(ext==='jpg'?'jpeg':ext)+';base64,'+source.toString('base64');
  const high=settings.preset==='source'?null:await worker.call('texture_variant',{image:uri,scale:1});
  const small=preset.small<1?await worker.call('texture_variant',{image:uri,scale:preset.small}):high;
  async function write(result){if(!result)return {asset};const bytes=Buffer.from(result.image.split(',')[1],'base64'),name='variants/'+createHash('sha256').update(bytes).digest('hex')+'.webp';await fs.writeFile(path.join(directory,name),bytes);return {asset:name,width:result.width,height:result.height};}
  const large=await write(high),low=await write(small),size=high?[high.sourceWidth,high.sourceHeight]:ext==='png'?[source.readUInt32BE(16),source.readUInt32BE(20)]:null;
  if(size){if(!large.width)Object.assign(large,{width:size[0],height:size[1]});if(!low.width)Object.assign(low,{width:size[0],height:size[1]});}
  variants[large.asset]={large,small:low,...(size?{sourceSize:size}:{})};return large.asset;
 })();requests.set(asset,task);return task;}
 const front=await convert('front.png');m.frontAsset=front;m.frontVariants=variants[front];
 for(const layer of m.layers){if(layer.asset)layer.asset=await convert(layer.asset);for(const v of layer.titleArt?.variants||[])if(v.rasterAsset)v.rasterAsset=await convert(v.rasterAsset);}
 if(m.backAsset)m.backAsset=await convert(m.backAsset);if(m.backScene){m.backScene.src=m.backAsset;for(const l of m.backScene.layers||[])if(l.src)l.src=await convert(l.src);}
 if(m.particles?.sprite)m.particles.sprite=await convert(m.particles.sprite);
 for(const dependency of m.fontDependencies||[]){const l=m.layers.find(l=>l.id===dependency.layerId);dependency.portableRaster=(dependency.locale?l?.titleArt?.variants.find(v=>v.locale===dependency.locale)?.rasterAsset:l?.asset)||null;}
 m.exportProfile={schema:'card-export-profile/1',settings,textures:variants};
 // Unreferenced original runtime files would defeat the smaller package. The
 // editable source is independent and remains byte-for-byte lossless.
 for(const [asset,task]of requests)if(await task!==asset)await fs.rm(path.join(directory,asset));
 if(!settings.includeSource){await fs.rm(path.join(directory,'card.cardproj'));await fs.rm(path.join(directory,'baked-layers'),{recursive:true,force:true});}
 await fs.writeFile(file,JSON.stringify(m,null,2));
 await fs.writeFile(path.join(directory,'README.txt'),'启动静态 HTTP 服务并打开 index.html。图片和清晰度变体见 manifest.json 的 asset / exportProfile，封面见 frontAsset。\nWebGL 与 godot/ SDK 保留同一骨架、权重、绑定、UV 和 FFD；缩放切档不重新播放动画。Mask 保持原始无损数据。\n'+(settings.includeSource?'附带 card.cardproj，可继续编辑。':'此运行时预设未附可编辑工程；请在编辑器中另行保存原工程。')+'\n');
 const levels={small:0,large:0};for(const v of Object.values(variants))for(const k of Object.keys(levels))levels[k]+=v[k].width*v[k].height*4||0;
 await fs.writeFile(path.join(directory,'export-report.json'),JSON.stringify({preset:settings.preset,settings,colourTextures:Object.keys(variants).length,estimatedRGBABytes:levels,textureCompression:settings.preset==='source'?'original':'lossless WebP; premultiplied-alpha Lanczos resizing',masks:'original lossless; not resized',animation:'rig, weights, binds, UV and FFD unchanged'},null,2));
}
module.exports={exportTextures};
