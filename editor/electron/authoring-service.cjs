/* AI receives a bounded production vocabulary, never filesystem or live-document access.
 * Every operation builds an isolated candidate. The renderer commits only after decode,
 * GLSL compilation and revision checks, so failures leave no partial edits. */
const commands=require('../renderer/editor-commands.js'),runtime=require('../renderer/runtime-model.js'),frames=require('../renderer/frame-model.js'),stats=require('../renderer/card-stats.js');
const titles=require('../renderer/title-model.js');
const maskNames=['motion','inset','emission','phase','rigid','coverage','foil'];
const textDefaults={fontFamily:'sans-serif',fontSize:90,fontWeight:700,color:'#ffffff',stroke:'#102632',strokeWidth:3,align:'center'};
function dimensions(src){if(typeof src!=='string'||!src.startsWith('data:image/png;base64,'))throw Error('制作素材必须为 PNG');const b=Buffer.from(src.split(',')[1],'base64');if(b.length<24||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('素材 PNG 无效');return [b.readUInt32BE(16),b.readUInt32BE(20)];}
async function prepareAuthoring(args,tools){
 const original=tools.validate(args.document);commands.validate(args.commands);if(args.commands.some(c=>['imageTask','shared','publish','workshop'].includes(c.op)))throw Error('图片任务需要 Agent 任务入口');if(args.documentToken!==original.id)throw Error('制作操作工程绑定无效');
 let next=structuredClone(original),selected=args.selected||next.layers[0].id;const preview={},reports=[],usedJobs=[];
 if(!next.layers.some(l=>l.id===selected))throw Error('选中的图层已不存在');
 const layer=id=>{const l=next.layers.find(l=>l.id===id);if(!l)throw Error('图层已不存在：'+id);if(l.locked)throw Error('图层已锁定：'+l.name);return l;};
 const source=async l=>{if(!l.src)throw Error('请选择图片图层');const image=l.master||l.src;const [w,h]=dimensions(image);if(l.sourceWindow)throw Error('请在注册为人物的图层上制作 Mask');return w===1024&&h===1536?image:(await tools.process('resize',{image,width:1024,height:1536})).image;};
 const refreshCoverage=async l=>{next.masks.coverage=(await tools.process('image_channel',{image:l.src,channel:'alpha'})).image;};
 const gate=async(name,image)=>name==='coverage'?image:(await tools.process('mask_combine',{image,selection:image,coverage:next.masks.coverage,mode:'add',value:1})).image;
 for(const c of args.commands){
  if(!commands.isAuthoring(c)){const p=commands.plan(next,[c],selected);next=p.document;selected=p.selected;Object.assign(preview,p.preview);continue;}
  if(c.op==='composition'){next.composition={...runtime.compositionDefaults,...next.composition};for(const k of ['top','right','bottom','left'])if(c[k]!==undefined)next.composition[k]=c[k];next.previewMode='authored';reports.push('人物框内外遮挡方向已更新');
  }else if(c.op==='locale'){next.locale=c.code;reports.push('显示语言：'+c.code);
  }else if(c.op==='armor'){next.armor={...runtime.armorDefaults,...next.armor};for(const k of ['enabled','strength','duration','period','width','color'])if(c[k]!==undefined)next.armor[k]=c[k];next.previewMode='authored';reports.push('盔甲局部周期反光已更新');
  }else if(c.op==='titleVariant'){const l=layer(c.layerId);if(l.kind!=='text'||stats.isStat(l))throw Error('请选择普通文字层');const v={locale:c.locale,text:c.text,...(c.style?{style:{...textDefaults,...c.style}}:{})};if(c.jobId){const {job,image}=await tools.asset(c.jobId);if(job.documentToken!==args.documentToken&&!c.reuse)throw Error('字标素材属于其他工程，复用需要 reuse:true');if(['inpaint','edit','outpaint'].includes(job.mode)&&job.layerId===l.id&&job.revision!==original.revision)throw Error('语言字标已变化，请重新提交图片编辑');const [w,h]=dimensions(image);v.src=w===1024&&h===1536?image:(await tools.process('title_raster',{image})).image;usedJobs.push(c.jobId);}else v.src=undefined;titles.upsert(l,v);next.previewMode='authored';reports.push(c.locale+' 英雄字标已更新');
  }else if(c.op==='titleSweep'){const l=layer(c.layerId);if(!l.titleArt)throw Error('先使用 titleVariant 建立语言字标');l.titleArt={...l.titleArt,sweep:{...titles.sweep,...l.titleArt.sweep}};for(const k of ['enabled','strength','duration','period','width','color'])if(c[k]!==undefined)l.titleArt.sweep[k]=c[k];reports.push('所有语言共用字标扫光');
  }else if(c.op==='frame'){
   const l=next.layers.find(l=>l.kind==='frame');if(!l||l.locked)throw Error('边框层不存在或已锁定，请先使用 lock 解锁');next.frameStyle={...frames.resolve(next)};for(const k of ['width','corner','depth','bevel','color','accent','finish'])if(c[k]!==undefined)next.frameStyle[k]=c[k];next.previewMode='authored';reports.push('Snap 平直切角框已更新');
  }else if(c.op==='cardStats'){stats.apply(next,c);next.previewMode='authored';reports.push('顶部费用 / 战力已更新');
  }else if(c.op==='asset'){
   const {job,image}=await tools.asset(c.jobId);if(job.documentToken!==args.documentToken&&!c.reuse)throw Error('图片任务属于另一个工程；显式 reuse:true 可复用为素材');
   const [w,h]=dimensions(image);let l;
   if(c.kind==='back'){next.back=(w===1024&&h===1536?image:(await tools.process('resize',{image,width:1024,height:1536})).image);}
   else{
    l=c.layerId?next.layers.find(l=>l.id===c.layerId):['foreground','background'].includes(c.kind)?next.layers.find(l=>l.kind===c.kind):null;
    if(l&&(l.locked||l.kind!==c.kind))throw Error('目标图层被锁定或类型不匹配');
    if(!l){if(next.layers.length>=64)throw Error('图层数量超限');if(c.kind==='foreground'&&next.layers.some(l=>l.kind==='foreground'))throw Error('连续人物只能有一个表面');l={id:c.layerId||'asset-'+c.jobId,kind:c.kind,name:c.name||job.layerName||'AI 素材',x:0,y:0,scale:1,opacity:1,visible:true,locked:false};next.layers.splice(c.kind==='background'?next.layers.length:0,0,l);}
    const refining=c.kind==='foreground'&&job.mode==='inpaint'&&job.layerId===l.id&&job.documentToken===args.documentToken;
    if(refining&&job.revision!==original.revision)throw Error('工程已变化，局部重绘不能替换人物；请重新提交或作为叠加图层查看');
    l.name=c.name||l.name;l.visible=true;if(!refining){l.x=0;l.y=0;l.scale=1;}delete l.sourceWindow;delete l.master;
    if(c.kind==='background'&&w>=1024&&h>=1536){l.src=image;const r=job.sourceWindow||{x:0,y:0,width:job.width,height:job.height};l.sourceWindow=job.mode==='outpaint'?{...r,x:r.x+job.padding[0],y:r.y+job.padding[1]}:{x:Math.floor((w-1024)/2),y:Math.floor((h-1536)/2),width:1024,height:1536};}
    else l.src=w===1024&&h===1536?image:(await tools.process('resize',{image,width:1024,height:1536})).image;
    if(c.kind==='foreground'){l.master=l.src;if(refining){l.src=(await tools.process('alpha',{image:l.master,mode:'coverage',mask:next.masks.coverage})).image;}else{for(const name of maskNames)next.masks[name]=(await tools.process('image_channel',{image:l.src,channel:name==='coverage'?'alpha':'black'})).image;next.foregroundMesh=runtime.grid(40);}}
    selected=l.id;
   }
   next.previewMode='authored';usedJobs.push(c.jobId);reports.push('已导入真实候选素材：'+(c.name||c.kind));
  }else if(c.op==='cutout'){
   const l=layer(c.layerId);if(l.kind!=='foreground')throw Error('AI 自动抠图请作用于连续人物层；用 asset(kind foreground) 先注册人物');
   const image=await source(l),result=await tools.process('remove_background',{image,model:c.model||'isnet-general-use'});l.master=image;l.src=result.image;delete l.sourceWindow;await refreshCoverage(l);
   // Never re-use old cape or emission masks outside the refined silhouette.
   for(const name of maskNames.filter(n=>n!=='coverage'&&next.masks[n]))next.masks[name]=await gate(name,next.masks[name]);
   reports.push('本地 '+result.engine+' 抠图完成，保留人物母版');selected=l.id;
  }else if(c.op==='mask'){
   const l=layer(c.layerId);if(l.kind!=='foreground')throw Error('效果 Mask 仅作用于连续人物层');const image=await source(l);if(!next.masks[c.name])next.masks[c.name]=(await tools.process('image_channel',{image,channel:'black'})).image;
   let result=c.polygon?await tools.process('selection',{image,points:c.polygon,magnetic:false,feather:0}):await tools.process('smart_selection',{image,points:c.points||[],labels:c.labels||[],box:c.box,engine:c.engine||'sam'});
   let selection=result.image;if(c.feather??2)selection=(await tools.process('feather',{image:selection,radius:Math.round(c.feather??2)})).image;
   const stats=await tools.process('mask_stats',{image:selection});if(!stats.active_pixels)throw Error('选区没有识别到区域，请调整提示点');
   next.masks[c.name]=(await tools.process('mask_combine',{image:next.masks[c.name],selection,mode:c.mode||'replace',gradient:c.gradient||'solid',value:c.value??1,...(c.name!=='coverage'?{coverage:next.masks.coverage}:{}),...(c.name==='motion'&&c.protectRigid!==false?{guard:next.masks.rigid}:{})})).image;
   if(c.name==='coverage'){l.src=(await tools.process('alpha',{image,mode:'coverage',mask:next.masks.coverage})).image;await refreshCoverage(l);for(const name of maskNames.filter(n=>n!=='coverage'&&next.masks[n]))next.masks[name]=await gate(name,next.masks[name]);}
   reports.push(c.name+' Mask · '+(result.engine||result.algorithm)+' · '+stats.active_pixels+' 选区像素');selected=l.id;
  }else if(c.op==='refineMask'){
   const l=next.layers.find(l=>l.kind==='foreground');if(!l||l.locked)throw Error('人物层不存在或已锁定');const refined=await tools.process('refine_selection',{image:next.masks[c.name],operation:c.operation,radius:c.radius});next.masks[c.name]=await gate(c.name,refined.image);
   if(c.name==='coverage'){l.src=(await tools.process('alpha',{image:await source(l),mode:'coverage',mask:next.masks.coverage})).image;await refreshCoverage(l);for(const name of maskNames.filter(n=>n!=='coverage'&&next.masks[n]))next.masks[name]=await gate(name,next.masks[name]);}
   reports.push('已修整 '+c.name+' Mask');
  }else if(c.op==='createText'){
   if(next.layers.some(l=>l.id===c.layerId)||next.layers.length>=64)throw Error('文字图层 ID 重复或数量超限');next.layers.unshift({id:c.layerId,name:c.name,text:c.text,kind:'text',x:c.x,y:c.y,scale:1,opacity:1,visible:true,locked:false,textStyle:{...textDefaults,...c.style}});selected=c.layerId;
  }else if(c.op==='textStyle'){
   const l=layer(c.layerId);if(l.kind!=='text')throw Error('此图层不是可编辑文字');if(l.titleArt)titles.upsert(l,{locale:next.locale||'zh-CN',text:titles.resolve(l,next.locale).text,style:{...textDefaults,...titles.resolve(l,next.locale).style,...c.style},src:undefined});else l.textStyle={...textDefaults,...l.textStyle,...c.style};
  }else if(c.op==='adjust'){
   const l=layer(c.layerId);l.adjustments={brightness:0,contrast:0,saturation:100,gamma:1,...l.adjustments};for(const k of ['brightness','contrast','saturation','gamma'])if(c[k]!==undefined)l.adjustments[k]=c[k];
  }else if(c.op==='shader'){
   for(const k of ['geometryBody','fragmentBody','fragmentTarget','fragmentMask','fragmentStrength'])if(c[k]!==undefined)next.shader[k]=c[k];next.previewMode='authored';reports.push('GLSL 待 GPU 编译验证');
  }else if(c.op==='entry'){
   const a=runtime.entryPreset(c.direction,c.actionId);const old=next.actions.findIndex(a=>a.id===c.actionId);if(old>=0)next.actions[old]=a;else next.actions.push(a);next.previewMode='authored';reports.push('整卡进场 · '+c.direction);
  }else if(c.op==='slot'){
   const old=next.slots.findIndex(s=>s.id===c.slot.id);if(old>=0)next.slots[old]=structuredClone(c.slot);else next.slots.push(structuredClone(c.slot));if(c.layerId){const l=layer(c.layerId);if(!['image','text'].includes(l.kind))throw Error('Slot 仅挂载图片或文字');l.slotId=c.slot.id;}
  }
  tools.validate(next);
 }
 return {document:next,selected,preview,reports,usedJobs};
}
module.exports={prepareAuthoring};
