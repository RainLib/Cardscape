/* AI receives a bounded production vocabulary, never filesystem or live-document access.
 * Every operation builds an isolated candidate. The renderer commits only after decode,
 * GLSL compilation and revision checks, so failures leave no partial edits. */
const commands=require('../renderer/editor-commands.js'),runtime=require('../renderer/runtime-model.js'),frames=require('../renderer/frame-model.js'),stats=require('../renderer/card-stats.js');
const spatial=require('../renderer/spatial-model.js');
const titles=require('../renderer/title-model.js');
const maskNames=['motion','inset','emission','phase','rigid','coverage','foil'];
const textDefaults={fontFamily:'sans-serif',fontSize:90,fontWeight:700,color:'#ffffff',stroke:'#102632',strokeWidth:3,align:'center'};
function dimensions(src){if(typeof src!=='string'||!src.startsWith('data:image/png;base64,'))throw Error('制作素材必须为 PNG');const b=Buffer.from(src.split(',')[1],'base64');if(b.length<24||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('素材 PNG 无效');return [b.readUInt32BE(16),b.readUInt32BE(20)];}
async function prepareAuthoring(args,tools){
 const original=tools.validate(args.document);commands.validate(args.commands);if(args.commands.some(c=>['imageTask','recoverImage','shared','publish','workshop'].includes(c.op)))throw Error('图片任务需要 Agent 任务入口');if(args.documentToken!==original.id)throw Error('制作操作工程绑定无效');
 let next=structuredClone(original),selected=args.selected||next.layers[0].id;const preview={},reports=[],usedJobs=[];
 if(!next.layers.some(l=>l.id===selected))throw Error('选中的图层已不存在');
 const layer=id=>{const l=next.layers.find(l=>l.id===id);if(!l)throw Error('图层已不存在：'+id);if(l.locked)throw Error('图层已锁定：'+l.name);return l;};
 const source=async l=>{if(!l.src)throw Error('请选择图片图层');const image=l.master||l.src;const [w,h]=dimensions(image);if(l.sourceWindow)throw Error('请在注册为人物的图层上制作 Mask');return w===1024&&h===1536?image:(await tools.process('resize',{image,width:1024,height:1536})).image;};
 const owned=async(l,image)=>l.ownershipMask?(await tools.process('alpha',{image,mode:'multiply',mask:l.ownershipMask})).image:image;
 const refreshCoverage=async l=>{next.masks.coverage=(await tools.process('image_channel',{image:l.src,channel:'alpha'})).image;};
 const region=async(c,image)=>{if(c.selectionMask){if(dimensions(c.selectionMask).join('x')!=='1024x1536')throw Error('选区与母版尺寸不一致');const stats=await tools.process('mask_stats',{image:c.selectionMask});if(!stats.active_pixels)throw Error('选区没有像素');return c.selectionMask;}return (await tools.process('selection',{image,points:c.polygon,magnetic:false,feather:0})).image;};
 const gate=async(name,image)=>name==='coverage'?image:(await tools.process('mask_combine',{image,selection:image,coverage:next.masks.coverage,mode:'add',value:1})).image;
 for(const c of args.commands){
  if(!commands.isAuthoring(c)){const p=commands.plan(next,[c],selected);next=p.document;selected=p.selected;Object.assign(preview,p.preview);continue;}
  if(c.op==='characterPart'){spatial.classify(next,layer(c.layerId),c);selected=c.layerId;reports.push('人物部件：'+spatial.parts[c.part].name+' / '+(spatial.rigid(layer(c.layerId))?'刚性':'柔性'));
  }else if(c.op==='pivot'){const l=layer(c.layerId);if(!['image','foreground','text'].includes(l.kind))throw Error('此图层不支持旋转中心');l.pivot={u:c.u??l.pivot?.u??.5,v:c.v??l.pivot?.v??.5};if(c.rotation!==undefined)l.rotation=c.rotation;selected=l.id;reports.push('旋转中心已设置');
  }else if(c.op==='motionAnchor'){const l=layer(c.layerId);if(!spatial.character(l)||spatial.rigid(l))throw Error('运动锚点仅用于柔性衣料；刚性部件请设置旋转中心');l.motionAnchor={root:c.root,tip:c.tip};if(l.splitSourceId)l.attachment={maxOffset:.025,blendWidth:64,motion:.35,...l.attachment,anchor:{edge:'segment',root:c.root,tip:c.tip}};selected=l.id;reports.push('固定点与自由端已设置');
  }else if(c.op==='repairLayer'){
   const l=layer(c.layerId),{job,image}=await tools.asset(c.jobId);if(!l.src||job.documentToken!==args.documentToken||job.layerId!==l.id||!['edit','inpaint'].includes(job.mode)||job.revision!==original.revision)throw Error('补全候选与当前图层或版本不匹配');
   if(dimensions(image).join('x')!=='1024x1536')throw Error('补全素材需要统一1024×1536 UV');
   let mask=await region(c,l.src);if(c.feather??2)mask=(await tools.process('feather',{image:mask,radius:Math.round(c.feather??2)})).image;
   const result=await tools.process('underpaint',{image:l.src,candidate:image,mask});if(!result.filled_pixels)throw Error('补全区域没有新增可见像素');
   l.underpaint={jobId:c.jobId,original:l.underpaint?.original||l.src,originalMaster:l.underpaint?.originalMaster||l.master||l.src,addedMask:result.addedMask,supportMask:mask,filledPixels:result.filled_pixels};l.src=result.image;l.master=result.image;delete l.ownershipMask;
   if(l.kind==='foreground'){
    next.masks.coverage=(await tools.process('mask_combine',{image:next.masks.coverage,selection:result.addedMask,mode:'add',value:1})).image;
    if(c.protectRigid!==false){next.masks.rigid=(await tools.process('mask_combine',{image:next.masks.rigid,selection:result.addedMask,mode:'add',value:1})).image;next.masks.motion=(await tools.process('mask_combine',{image:next.masks.motion,selection:result.addedMask,mode:'subtract',value:1})).image;}
   }
   usedJobs.push(c.jobId);reports.push('后层及底部真实补全：'+result.filled_pixels+' 像素，原有可见主体保留');selected=l.id;
  }else if(c.op==='repairSplitEdges'){
   const l=layer(c.layerId),parent=layer(l.splitSourceId);if(!l.ownershipMask||!l.master||l.kind!=='image'||parent.kind!=='foreground')throw Error('请选择已有拆分衣料');if(l.ownershipEncoding==='selection'||l.splitAlphaCorrected&&(c.radius??0)<=(l.splitEdgeRadius??0)){reports.push('拆层 Alpha 已校正，无需重复处理');continue;}
   const base=parent.underpaint?.original||parent.src,result=await tools.process('repair_split',{parent:base,child:l.src,master:l.master,mask:l.ownershipMask,radius:Math.round(c.radius??0),legacy:!l.splitAlphaCorrected});
   l.splitEdgeOriginal=l.splitEdgeOriginal||l.src;l.src=result.image;l.ownershipMask=result.mask;l.splitAlphaCorrected=true;l.splitEdgeRadius=Math.round(c.radius??0);
   if(parent.underpaint){const old=parent.underpaint,candidate=old.candidate||parent.src,filled=await tools.process('underpaint',{image:result.parent,candidate,mask:old.supportMask||old.addedMask});parent.underpaint={...old,preSplitEdges:old.preSplitEdges||old.original,original:result.parent,candidate,addedMask:filled.addedMask,filledPixels:filled.filled_pixels};parent.src=filled.image;parent.master=filled.image;}
   else{parent.splitEdgeOriginal=parent.splitEdgeOriginal||parent.src;parent.src=result.parent;}
   reports.push('拆层半透明残边已校正：'+result.changed_pixels+' 像素');selected=l.id;
  }else if(c.op==='repairRegion'){
   const l=layer(c.layerId),old=l.underpaint;if(!old?.original||!old.addedMask)throw Error('此图层没有可调整的真实补绘');
   let mask=await region(c,l.src);
   if(c.feather??2)mask=(await tools.process('feather',{image:mask,radius:Math.round(c.feather??2)})).image;
   const candidate=old.candidate||l.src,result=await tools.process('underpaint',{image:old.original,candidate,mask});
   l.underpaint={...old,candidate,addedMask:result.addedMask,supportMask:mask,filledPixels:result.filled_pixels};l.src=result.image;l.master=result.image;
   if(l.kind==='foreground'){
    for(const name of ['rigid'])if(next.masks[name]){next.masks[name]=(await tools.process('mask_combine',{image:next.masks[name],selection:old.addedMask,mode:'subtract',value:1})).image;next.masks[name]=(await tools.process('mask_combine',{image:next.masks[name],selection:result.addedMask,mode:'add',value:1})).image;}
   }
   reports.push('补绘覆盖范围已调整，原有像素和完整补绘候选保留');selected=l.id;
  }else if(c.op==='attachment'){
   const l=layer(c.layerId);if(!l.splitSourceId||!next.layers.some(p=>p.id===l.splitSourceId&&p.kind==='foreground'))throw Error('连接设置需要已拆出的人物部件');l.attachment={...l.attachment,maxOffset:c.maxOffset??l.attachment?.maxOffset??.025,blendWidth:c.blendWidth??l.attachment?.blendWidth??64,...(c.anchor?{anchor:structuredClone(c.anchor)}:{}),...(c.motion!==undefined?{motion:c.motion}:{}),...(c.mode?{mode:c.mode}:{})};reports.push('人物连接根部固定，末端深度受限');
  }else if(c.op==='camera'){next.spatial={...spatial.defaults,...next.spatial,enabled:true,cameraDistance:c.distance};reports.push('统一相机距离已更新');
  }else if(c.op==='spatial'){spatial.set(next,layer(c.layerId),c);reports.push('空间角色：'+spatial.roles[c.role].name);
  }else if(c.op==='splitLayer'){
   const l=layer(c.layerId);if(l.kind!=='foreground'||next.layers.some(x=>x.id===c.newLayerId)||next.layers.length>=64)throw Error('拆层需要连续人物和唯一图层 ID');
   const image=l.src;l.master=l.master||image;let selection=await region(c,image);
   if(c.feather??2)selection=(await tools.process('feather',{image:selection,radius:Math.round(c.feather??2)})).image;
   const localCoverage=(await tools.process('image_channel',{image,channel:'alpha'})).image,partMask=(await tools.process('mask_combine',{image:selection,selection,coverage:localCoverage,mode:'replace',value:1})).image;
   const white=(await tools.process('image_channel',{image,channel:'white'})).image;const inverse=(await tools.process('mask_combine',{image:white,selection,mode:'subtract',value:1})).image;
   const piece=(await tools.process('alpha',{image,mode:'coverage',mask:partMask})).image;const remainder=(await tools.process('alpha',{image,mode:'multiply',mask:inverse})).image;
   const child={id:c.newLayerId,name:c.name,kind:'image',src:piece,master:image,rotation:l.rotation,pivot:l.pivot?{...l.pivot}:undefined,ownershipMask:selection,ownershipEncoding:'selection',x:l.x,y:l.y,scale:l.scale,opacity:l.opacity,visible:true,locked:false,splitSourceId:l.id,splitAlphaCorrected:true};if(c.part){child.anatomy={schema:'card-character-part/1',part:c.part,side:c.side||'center'};child.attachment={mode:spatial.parts[c.part].mode,maxOffset:.025,blendWidth:64,...(spatial.parts[c.part].mode==='rigid'?{motion:0}:{})};}spatial.set(next,child,{...c,z:c.z??Math.max(-.4,Math.min(.4,(l.spatial?.z??spatial.roles.body.z)+(c.role==='rear'?-.025:.025)))});next.layers.splice(next.layers.indexOf(l)+(c.role==='rear'?1:0),0,child);l.src=remainder;l.ownershipMask=l.ownershipMask?(await tools.process('mask_combine',{image:l.ownershipMask,selection:l.ownershipMask,coverage:inverse,mode:'replace',value:1})).image:inverse;reports.push('互补人物拆层：'+c.name+'，母版及 Mask 保留');selected=child.id;
  }else if(c.op==='composition'){next.composition={...runtime.compositionDefaults,...next.composition};for(const k of ['top','right','bottom','left'])if(c[k]!==undefined)next.composition[k]=c[k];next.previewMode='authored';reports.push('人物框内外遮挡方向已更新');
  }else if(c.op==='emissionRegion'){const C=require('../renderer/component-model.js');next.emissionRegions=next.emissionRegions||[];if(c.remove)next.emissionRegions=next.emissionRegions.filter(r=>r.id!==c.id);else{if(c.layerId&&!next.layers.some(l=>l.id===c.layerId))throw Error('发射源图层不存在');const value={...C.regionDefaults,...(next.emissionRegions.find(r=>r.id===c.id)||{})};for(const k of ['id','name','shape','u','v','width','height','direction','angle','layerId'])if(c[k]!==undefined)value[k]=c[k];const index=next.emissionRegions.findIndex(r=>r.id===c.id);if(index<0)next.emissionRegions.push(value);else next.emissionRegions[index]=value;}reports.push('组件发射区域已更新');
  }else if(c.op==='cosmetics'){const M=require('../renderer/cosmetics-model.js');next.cosmetics=M.config(next.cosmetics);for(const [k,v] of Object.entries(c))if(k!=='op')next.cosmetics[k]=v;if(M.presets[next.cosmetics.flare])next.particles=M.particlePreset(next.cosmetics.flare,next.particles);reports.push('卡片默认等级与外观已更新');
  }else if(c.op==='particleSprite'){const {job,image}=await tools.asset(c.jobId);if(job.documentToken!==args.documentToken&&!c.reuse)throw Error('粒子素材属于其他工程，复用需要 reuse:true');const [w,h]=dimensions(image),scale=Math.min(1,512/Math.max(w,h)),sprite=scale<1?(await tools.process('resize',{image,width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale))})).image:image;const C=require('../renderer/component-model.js');next.particles=C.particles({...next.particles,enabled:true,visual:'sprite',sprite,blend:'normal',palette:'solid',spriteTint:!!c.tint,stretch:1});C.validateParticles(next.particles);if(next.cosmetics)next.cosmetics={...next.cosmetics,flare:'authored'};if(next.componentScenes?.particles)next.componentScenes={...next.componentScenes,particles:{...next.componentScenes.particles,...next.particles}};usedJobs.push(c.jobId);reports.push('自定义粒子 PNG 已注册');
  }else if(c.op==='material'||c.op==='particles'){if(c.op==='material'&&next.cosmetics)next.cosmetics={...next.cosmetics,finish:'original'};if(c.op==='particles'&&next.cosmetics)next.cosmetics={...next.cosmetics,flare:'authored'};const C=require('../renderer/component-model.js');next[c.op]=c.op==='material'?C.material(next.material):C.particles(next.particles);for(const [k,v] of Object.entries(c))if(k!=='op')next[c.op][k]=v;next.previewMode='authored';reports.push('独立组件 '+c.op+' 已更新');
  }else if(c.op==='locale'){next.locale=c.code;reports.push('显示语言：'+c.code);
  }else if(c.op==='armor'){next.armor={...runtime.armorDefaults,...next.armor};for(const k of ['enabled','strength','duration','period','width','color'])if(c[k]!==undefined)next.armor[k]=c[k];next.previewMode='authored';reports.push('盔甲局部周期反光已更新');
  }else if(c.op==='titleVariant'){const l=layer(c.layerId);if(l.kind!=='text'||stats.isStat(l))throw Error('请选择普通文字层');const v={locale:c.locale,text:c.text,...(c.style?{style:{...textDefaults,...c.style}}:{})};if(c.jobId){const {job,image}=await tools.asset(c.jobId);if(job.documentToken!==args.documentToken&&!c.reuse)throw Error('字标素材属于其他工程，复用需要 reuse:true');if(['inpaint','edit','outpaint'].includes(job.mode)&&job.layerId===l.id&&job.revision!==original.revision)throw Error('语言字标已变化，请重新提交图片编辑');const [w,h]=dimensions(image);v.src=w===1024&&h===1536?image:(await tools.process('title_raster',{image})).image;usedJobs.push(c.jobId);}else v.src=undefined;titles.upsert(l,v);next.previewMode='authored';reports.push(c.locale+' 英雄字标已更新');
  }else if(c.op==='titleSweep'){const l=layer(c.layerId);if(!l.titleArt)throw Error('先使用 titleVariant 建立语言字标');l.titleArt={...l.titleArt,sweep:{...titles.sweep,...l.titleArt.sweep}};for(const k of ['enabled','strength','duration','period','width','color'])if(c[k]!==undefined)l.titleArt.sweep[k]=c[k];reports.push('所有语言共用字标扫光');
  }else if(c.op==='frame'){
   const l=next.layers.find(l=>l.kind==='frame');if(!l||l.locked)throw Error('边框层不存在或已锁定，请先使用 lock 解锁');next.frameStyle={...frames.resolve(next)};for(const k of ['width','corner','depth','bevel','color','accent','finish','animation','animationSpeed'])if(c[k]!==undefined)next.frameStyle[k]=c[k];if(next.cosmetics)next.cosmetics={...next.cosmetics,border:'custom'};next.previewMode='authored';reports.push('Snap 平直切角框已更新');
  }else if(c.op==='cardStats'){stats.apply(next,c);next.previewMode='authored';reports.push('顶部费用 / 战力已更新');
  }else if(c.op==='asset'){
   const {job,image}=await tools.asset(c.jobId);if(job.documentToken!==args.documentToken&&!c.reuse)throw Error('图片任务属于另一个工程；显式 reuse:true 可复用为素材');
   const [w,h]=dimensions(image);let l;
   if(c.kind==='back'){delete next.backScene;next.back=(w===1024&&h===1536?image:(await tools.process('resize',{image,width:1024,height:1536})).image);}
   else{
    l=c.layerId?next.layers.find(l=>l.id===c.layerId):['foreground','background'].includes(c.kind)?next.layers.find(l=>l.kind===c.kind):null;
    if(l&&(l.locked||l.kind!==c.kind))throw Error('目标图层被锁定或类型不匹配');
    if(!l){if(next.layers.length>=64)throw Error('图层数量超限');if(c.kind==='foreground'&&next.layers.some(l=>l.kind==='foreground'))throw Error('连续人物只能有一个表面');l={id:c.layerId||'asset-'+c.jobId,kind:c.kind,name:c.name||job.layerName||'AI 素材',x:0,y:0,scale:1,opacity:1,visible:true,locked:false};next.layers.splice(c.kind==='background'?next.layers.length:0,0,l);}
    const refining=c.kind==='foreground'&&job.mode==='inpaint'&&job.layerId===l.id&&job.documentToken===args.documentToken;
    if(refining&&job.revision!==original.revision)throw Error('工程已变化，局部重绘不能替换人物；请重新提交或作为叠加图层查看');
    l.name=c.name||l.name;l.visible=true;if(!refining){l.x=0;l.y=0;l.scale=1;}delete l.sourceWindow;delete l.master;
    if(c.kind==='background'&&w>=1024&&h>=1536){l.src=image;const r=job.sourceWindow||{x:0,y:0,width:job.width,height:job.height};l.sourceWindow=job.mode==='outpaint'?{...r,x:r.x+job.padding[0],y:r.y+job.padding[1]}:{x:Math.floor((w-1024)/2),y:Math.floor((h-1536)/2),width:1024,height:1536};}
    else l.src=w===1024&&h===1536?image:(await tools.process('resize',{image,width:1024,height:1536})).image;
    if(c.kind==='foreground'){l.master=l.src;if(refining){l.src=await owned(l,(await tools.process('alpha',{image:l.master,mode:'coverage',mask:next.masks.coverage})).image);}else{for(const name of maskNames)next.masks[name]=(await tools.process('image_channel',{image:l.src,channel:name==='coverage'?'alpha':'black'})).image;next.foregroundMesh=runtime.grid(40);}}
    selected=l.id;
   }
   next.previewMode='authored';usedJobs.push(c.jobId);reports.push('已导入真实候选素材：'+(c.name||c.kind));
  }else if(c.op==='cutout'){
   const l=layer(c.layerId);if(!['foreground','image'].includes(l.kind))throw Error('自动抠图需要人物或图片层');
   const image=await source(l),result=await tools.process('remove_background',{image,model:c.model||'isnet-general-use'});l.master=image;l.src=await owned(l,result.image);delete l.sourceWindow;if(l.kind==='foreground')await refreshCoverage(l);else l.cutoutMask=result.mask;
   // Never re-use old cape or emission masks outside the refined silhouette.
   if(l.kind==='foreground')for(const name of maskNames.filter(n=>n!=='coverage'&&next.masks[n]))next.masks[name]=await gate(name,next.masks[name]);
   reports.push('本地 '+result.engine+' 抠图完成，保留人物母版');selected=l.id;
  }else if(c.op==='mask'){
   const l=layer(c.layerId);if(l.kind!=='foreground')throw Error('效果 Mask 仅作用于连续人物层');const image=await source(l);if(!next.masks[c.name])next.masks[c.name]=(await tools.process('image_channel',{image,channel:'black'})).image;
   let result=c.polygon?await tools.process('selection',{image,points:c.polygon,magnetic:false,feather:0}):await tools.process('smart_selection',{image,points:c.points||[],labels:c.labels||[],box:c.box,engine:c.engine||'sam'});
   let selection=result.image;if(c.feather??2)selection=(await tools.process('feather',{image:selection,radius:Math.round(c.feather??2)})).image;
   const stats=await tools.process('mask_stats',{image:selection});if(!stats.active_pixels)throw Error('选区没有识别到区域，请调整提示点');
   next.masks[c.name]=(await tools.process('mask_combine',{image:next.masks[c.name],selection,mode:c.mode||'replace',gradient:c.gradient||'solid',value:c.value??1,startValue:c.startValue??0,start:c.start,end:c.end,...(c.name!=='coverage'?{coverage:next.masks.coverage}:{}),...(c.name==='motion'&&c.protectRigid!==false?{guard:next.masks.rigid}:{})})).image;
   if(c.name==='coverage'){l.src=await owned(l,(await tools.process('alpha',{image,mode:'coverage',mask:next.masks.coverage})).image);await refreshCoverage(l);for(const name of maskNames.filter(n=>n!=='coverage'&&next.masks[n]))next.masks[name]=await gate(name,next.masks[name]);}
   reports.push(c.name+' Mask · '+(result.engine||result.algorithm)+' · '+stats.active_pixels+' 选区像素');selected=l.id;
  }else if(c.op==='refineMask'){
   const l=next.layers.find(l=>l.kind==='foreground');if(!l||l.locked)throw Error('人物层不存在或已锁定');const refined=await tools.process('refine_selection',{image:next.masks[c.name],operation:c.operation,radius:c.radius});next.masks[c.name]=await gate(c.name,refined.image);
   if(c.name==='coverage'){l.src=await owned(l,(await tools.process('alpha',{image:await source(l),mode:'coverage',mask:next.masks.coverage})).image);await refreshCoverage(l);for(const name of maskNames.filter(n=>n!=='coverage'&&next.masks[n]))next.masks[name]=await gate(name,next.masks[name]);}
   reports.push('已修整 '+c.name+' Mask');
  }else if(c.op==='createText'){
   if(next.layers.some(l=>l.id===c.layerId)||next.layers.length>=64)throw Error('文字图层 ID 重复或数量超限');next.layers.unshift({id:c.layerId,name:c.name,text:c.text,kind:'text',x:c.x,y:c.y,scale:1,opacity:1,visible:true,locked:false,textStyle:{...textDefaults,...c.style}});selected=c.layerId;
  }else if(c.op==='textStyle'){
   const l=layer(c.layerId);if(l.kind!=='text')throw Error('此图层不是可编辑文字');if(l.titleArt)titles.upsert(l,{locale:next.locale||'zh-CN',text:titles.resolve(l,next.locale).text,style:{...textDefaults,...titles.resolve(l,next.locale).style,...c.style},src:undefined});else l.textStyle={...textDefaults,...l.textStyle,...c.style};
  }else if(c.op==='adjust'){
   const l=layer(c.layerId);l.adjustments={brightness:0,contrast:0,saturation:100,gamma:1,...l.adjustments};for(const k of ['brightness','contrast','saturation','gamma'])if(c[k]!==undefined)l.adjustments[k]=c[k];
  }else if(c.op==='shader'){
   for(const k of ['geometryBody','fragmentBody','fragmentTarget','fragmentMask','fragmentStrength'])if(c[k]!==undefined)next.shader[k]=c[k];next.previewMode='authored';reports.push('GLSL 待 GPU 编译验证');
  }else if(c.op==='actionSettings'){
   const action=next.actions.find(a=>a.id===c.actionId);if(!action)throw Error('动作已不存在');for(const k of ['name','event','duration','loop','motion','emission','bend','tracks'])if(c[k]!==undefined)action[k]=structuredClone(c[k]);next.previewMode='authored';reports.push('动作属性已更新：'+action.name);
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
