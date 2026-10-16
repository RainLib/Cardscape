/* Public Spine JSON data -> self-owned native rig. No Spine runtime is used.
 * Attachments map explicitly to existing registered images and UV rectangles. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./character-animation-model.js'):root.CardCharacterAnimation);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardSpineImport=api;})(typeof window==='object'?window:globalThis,C=>{
'use strict';
const schema='card-character-animation-import/1',num=(v,f=0)=>v===undefined?f:v;
function inspect(source,{document:doc,layerMap={},scale=1,origin=[512,768],skin='default',loop=false}={}){
 const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const errors=[],warnings=[],fail=message=>{if(!errors.includes(message))errors.push(message);};
 if(!source||!Array.isArray(source.bones)||!source.bones.length||source.bones.length>64||!source.skeleton||typeof source.skeleton.spine!=='string'||!/^((3\.8)|(4\.[012]))(\.|$)/.test(source.skeleton.spine||''))throw Error('请选择 Spine 3.8 / 4.0–4.2 的 JSON 导出（最多 64 骨骼）；不支持 .spine / .skel 二进制');
 if(!Number.isFinite(scale)||scale<=0||scale>100||!Array.isArray(origin)||origin.length!==2||origin.some(v=>!Number.isFinite(v)||Math.abs(v)>4096))throw Error('导入缩放或原点无效');
 for(const key of ['ik','transform','path','physics','slots'])if(source[key]!==undefined&&!Array.isArray(source[key]))throw Error('Spine '+key+' 必须是数组');if(source.animations!==undefined&&!record(source.animations))throw Error('Spine animations 必须是对象');
 const slots=source.slots||[];if(!Array.isArray(slots)||slots.length>32)throw Error('Spine Slot 数量超过 32');
 for(const key of ['transform','path','physics'])if(source[key]?.length)fail(key+' 约束尚不支持');
 const boneNames=new Map(),bones=source.bones.map((b,i)=>{if(!b||typeof b.name!=='string'||!b.name||boneNames.has(b.name))throw Error('Spine 骨骼名称缺失或重复');boneNames.set(b.name,'sp-b'+i);return {id:'sp-b'+i,name:b.name.slice(0,100),parentId:null,x:0,y:0,rotation:0,scale:1};});
 source.bones.forEach((b,i)=>{for(const key of ['x','y','rotation','scaleX','scaleY','shearX','shearY','length'])if(b[key]!==undefined&&!Number.isFinite(b[key]))throw Error('Spine 骨骼数值无效：'+b.name);const sx=num(b.scaleX,1),sy=num(b.scaleY,1);if(sx!==sy||sx<=0||num(b.shearX)||num(b.shearY)||(b.transform&&String(b.transform).toLowerCase()!=='normal')||(b.inherit&&String(b.inherit).toLowerCase()!=='normal')||b.skin)fail('骨骼 '+b.name+' 的非均匀缩放、反射、剪切或特殊继承尚不支持');if(b.parent&&!boneNames.has(b.parent))throw Error('Spine 父骨骼不存在：'+b.parent);Object.assign(bones[i],{parentId:b.parent?boneNames.get(b.parent):null,x:(b.parent?0:origin[0])+num(b.x)*scale,y:(b.parent?0:origin[1])-num(b.y)*scale,rotation:-num(b.rotation),scale:sx,tip:[num(b.length)*scale,0]});});
 const rig={schema:C.schema,bones,bindings:[],constraints:[],meshes:[],expressions:[]};let compiled;try{compiled=C.compile(rig);}catch(e){throw Error('Spine 骨架无效：'+e.message);}
 if(source.skins!==undefined&&(!source.skins||typeof source.skins!=='object'||Object.keys(source.skins).length>128))throw Error('Spine Skin 格式无效或超过 128 个');
 const skins=Array.isArray(source.skins)?source.skins.map(s=>({name:s.name,attachments:s.attachments||{}})):Object.entries(source.skins||{}).map(([name,attachments])=>({name,attachments}));
 const chosen=skins.find(s=>s.name===skin)||(!skins.length?{name:skin,attachments:{}}:null);if(!chosen)throw Error('Spine Skin 不存在：'+skin);const fallback=skins.find(s=>s.name==='default')?.attachments||{};
 const mapping=[],used=new Set(),slotNames=new Set();
 const worldPoint=(boneId,x,y)=>C.point(compiled.rest.get(boneId),x*scale,-y*scale);
 for(const slot of slots){
  if(!slot||typeof slot.name!=='string'||slotNames.has(slot.name)||!boneNames.has(slot.bone))throw Error('Spine Slot 无效或重复');slotNames.add(slot.name);if(!slot.attachment)continue;
  if(slot.visible===false)fail('隐藏 Slot 尚不支持：'+slot.name);if(slot.color&&slot.color.toLowerCase()!=='ffffffff'||slot.dark||slot.blend&&slot.blend!=='normal')fail('Slot '+slot.name+' 的颜色或混合模式尚不支持');
  const rawMap=layerMap[slot.name],m=typeof rawMap==='string'?{layerId:rawMap}:rawMap,layer=doc?.layers?.find(l=>l.id===m?.layerId),attachment=chosen.attachments[slot.name]?.[slot.attachment]||fallback[slot.name]?.[slot.attachment];
  mapping.push({slot:slot.name,attachment:slot.attachment,layerId:layer?.id||'',type:attachment?.type||'region'});
  if(!layer){fail('请映射图片：'+slot.name);continue;}if(used.has(layer.id)||!['image','foreground'].includes(layer.kind)||layer.locked||layer.previewReference){fail('图片映射重复、锁定或不可编辑：'+slot.name);continue;}used.add(layer.id);
  if(!attachment){fail('找不到附件：'+slot.name+'/'+slot.attachment);continue;}
  if(attachment.sequence||attachment.parent){fail('序列或链接 Mesh 附件尚不支持：'+slot.name);continue;}for(const key of ['x','y','rotation','scaleX','scaleY'])if(attachment[key]!==undefined&&!Number.isFinite(attachment[key]))throw Error('附件数值无效：'+slot.name);
  const type=attachment.type||'region';if(!['region','mesh'].includes(type)){fail('附件类型尚不支持：'+slot.name+' / '+type);continue;}
  if(attachment.color&&attachment.color.toLowerCase()!=='ffffffff')fail('附件颜色尚不支持：'+slot.name);
  const boneId=boneNames.get(slot.bone),uvRect=m.uvRect||[0,0,1024,1536];if(!Array.isArray(uvRect)||uvRect.length!==4||uvRect.some(v=>!Number.isFinite(v))||uvRect[0]<0||uvRect[1]<0||uvRect[2]<=0||uvRect[3]<=0||uvRect[0]+uvRect[2]>1024||uvRect[1]+uvRect[3]>1536)throw Error('图片 UV 矩形无效：'+slot.name);
  const mesh={layerId:layer.id,vertices:[],uv:[],triangles:[],weights:[],morphs:[]},pl=windowPlacement(doc,layer),inv=C.inverse(C.matrix(512+pl.x,768+pl.y,pl.rotation*180/Math.PI,pl.scale));
  const add=(p,uv,weights)=>{const q=C.point(inv,p.x,p.y);mesh.vertices.push(q.x+512,q.y+768);mesh.uv.push((uvRect[0]+uv[0]*uvRect[2])/1024,(uvRect[1]+uv[1]*uvRect[3])/1536);mesh.weights.push(weights);};
  if(type==='region'){
   const w=attachment.width,h=attachment.height;if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Region 需要有效宽高：'+slot.name);
   const a=C.matrix(num(attachment.x)*scale,-num(attachment.y)*scale,-num(attachment.rotation),1),sx=num(attachment.scaleX,1),sy=num(attachment.scaleY,1);if(sx<=0||sy<=0)fail('Region 反射尚不支持：'+slot.name);
   for(const [x,y,u,v]of [[-w/2,h/2,0,0],[w/2,h/2,1,0],[w/2,-h/2,1,1],[-w/2,-h/2,0,1]]){const q=C.point(a,x*sx*scale,-y*sy*scale),p=C.point(compiled.rest.get(boneId),q.x,q.y);add(p,[u,v],[{boneId,weight:1}]);}mesh.triangles=[0,2,1,0,3,2];
  }else{
   const uv=attachment.uvs,v=attachment.vertices;if(!Array.isArray(uv)||uv.length<6||uv.length%2||uv.length>8192||uv.some(v=>!Number.isFinite(v)||v<0||v>1)||!Array.isArray(v)||v.length>81920||v.some(v=>!Number.isFinite(v))||!Array.isArray(attachment.triangles))throw Error('Spine Mesh 数据无效或超限：'+slot.name);
   let cursor=0;for(let i=0;i<uv.length/2;i++){
    if(v.length===uv.length){add(worldPoint(boneId,v[cursor++],v[cursor++]),uv.slice(i*2,i*2+2),[{boneId,weight:1}]);continue;}
    const count=v[cursor++];if(!Number.isInteger(count)||count<1||count>4)throw Error('每顶点最多支持 4 根 Spine 骨骼：'+slot.name);const influences=[],points=[];let total=0,px=0,py=0;
    for(let j=0;j<count;j++){const index=v[cursor++],x=v[cursor++],y=v[cursor++],weight=v[cursor++];if(!Number.isInteger(index)||!bones[index]||![x,y,weight].every(Number.isFinite)||weight<0||weight>1)throw Error('Spine 顶点权重无效：'+slot.name);const p=worldPoint(bones[index].id,x,y);px+=p.x*weight;py+=p.y*weight;total+=weight;points.push({p,weight});influences.push({boneId:bones[index].id,weight});}
    if(Math.abs(total-1)>1e-5||new Set(influences.map(w=>w.boneId)).size!==count)throw Error('Spine 顶点权重未归一化或重复：'+slot.name);
    if(points.some(({p,weight})=>weight>1e-8&&Math.hypot(p.x-px,p.y-py)>.05))fail('Mesh '+slot.name+' 含不同绑定位置，无法无损转为自有 LBS');add({x:px,y:py},uv.slice(i*2,i*2+2),influences);
   }if(cursor!==v.length)throw Error('Spine Mesh 顶点长度不一致：'+slot.name);mesh.triangles=[...attachment.triangles];
  }
  const old=doc.characterRig?.meshes?.find(m=>m.layerId===layer.id);if(old?.depths){mesh.depths=transferDepth(old,mesh.uv);warnings.push('已按 UV 保留已有图片的顶点深度：'+slot.name);}
  rig.bindings.push({layerId:layer.id,boneId});rig.meshes.push(mesh);
 }
 const constraintNames=new Map();for(const [i,c] of (source.ik||[]).entries()){
  if(!c||typeof c.name!=='string'||constraintNames.has(c.name)||!Array.isArray(c.bones)||!c.bones.length||c.bones.length>2||!c.bones.every(n=>boneNames.has(n))||!boneNames.has(c.target))throw Error('Spine IK 无效');if(c.stretch||c.compress||num(c.softness)||c.skin)fail('IK '+c.name+' 的伸缩、软化或 Skin 约束尚不支持');
  const last=bones.find(b=>b.id===boneNames.get(c.bones.at(-1)));constraintNames.set(c.name,'sp-ik'+i);rig.constraints.push({id:'sp-ik'+i,name:c.name.slice(0,100),rootId:boneNames.get(c.bones[0]),tipId:last.id,end:last.tip,target:[0,0],targetBoneId:boneNames.get(c.target),bend:c.bendPositive===false?1:-1,mix:num(c.mix,1),order:num(c.order,i),solver:c.bones.length===1?'ccd':'analytic'});
 }
 const actions=[],animationEntries=Object.entries(source.animations||{});if(animationEntries.length>24)throw Error('Spine 动作超过 24 个');
 for(const [index,[name,animation]]of animationEntries.entries()){if(!record(animation)||animation.bones!==undefined&&!record(animation.bones)||animation.ik!==undefined&&!record(animation.ik))throw Error('Spine 动画格式无效');
  for(const key of Object.keys(animation))if(!['bones','ik'].includes(key)&&Object.keys(animation[key]||{}).length)fail('动画 '+name+' / '+key+' 尚不支持');
  let duration=0;function scan(v){if(Array.isArray(v))for(const f of v){if(f&&typeof f==='object'&&!Array.isArray(f)&&'time'in f){if(!Number.isFinite(f.time)||f.time<0)throw Error('Spine 关键帧时间无效');duration=Math.max(duration,f.time);}else scan(f);}else if(v&&typeof v==='object')for(const a of Object.values(v))scan(a);}scan(animation);duration=duration||1;if(duration>30)throw Error('Spine 动作最长 30 秒');
  const action={id:'sp-action'+index,name:name.slice(0,100)||'Spine 动作',event:'trigger',duration,loop:!!loop,motion:1,emission:1,bend:0,boneTracks:{},ikTracks:{}};
  for(const [name,tracks]of Object.entries(animation.bones||{})){if(!record(tracks))throw Error('Spine 骨骼轨道格式无效');
   if(!boneNames.has(name))throw Error('Spine 动画引用不存在的骨骼');const id=boneNames.get(name),out={};
   for(const [type,frames]of Object.entries(tracks)){
    if(!['rotate','translate','scale'].includes(type)){fail('骨骼轨道 '+type+' 尚不支持');continue;}
    if(!Array.isArray(frames)||!frames.length||frames.length>256)throw Error('Spine 关键帧数量无效');
    if(type==='rotate')out.rotation=timeline(frames,duration,f=>-num(f.angle,num(f.value)),source.skeleton.spine,0,-1,0);
    if(type==='translate'){out.x=timeline(frames,duration,f=>num(f.x)*scale,source.skeleton.spine,0,scale,0);out.y=timeline(frames,duration,f=>-num(f.y)*scale,source.skeleton.spine,1,-scale,0);}
    if(type==='scale'){if(source.skeleton.spine.startsWith('4.')&&frames.some(f=>Array.isArray(f.curve)&&(f.curve.length!==8||f.curve.slice(0,4).some((v,i)=>Math.abs(v-f.curve[i+4])>1e-9))))fail('缩放贝塞尔的 X/Y 通道不一致或缺失：'+name);if(frames.some(f=>num(f.x,1)!==num(f.y,1)))fail('非均匀缩放动画尚不支持：'+name);out.scale=timeline(frames,duration,f=>num(f.x,1),source.skeleton.spine,0,1,1);}
   }action.boneTracks[id]=out;
  }
  for(const [name,frames]of Object.entries(animation.ik||{})){if(!constraintNames.has(name))throw Error('Spine IK 动画引用不存在的约束');const c=rig.constraints.find(c=>c.id===constraintNames.get(name));if(!Array.isArray(frames))throw Error('Spine IK 轨道格式无效');if(frames.some(f=>num(f.softness)||f.bendPositive!==undefined&&(f.bendPositive===false?1:-1)!==c.bend||f.stretch||f.compress))fail('IK 弯曲侧、伸缩或软化动画尚不支持：'+name);action.ikTracks[c.id]={mix:timeline(frames,duration,f=>num(f.mix,1),source.skeleton.spine,0,1,1)};}
  actions.push(action);
 }
 if(!actions.length)actions.push({id:'sp-action0',name:'Spine 初始姿势',event:'trigger',duration:1,loop:false,motion:1,emission:1,bend:0});
 if(!errors.length)try{C.validate({...doc,characterRig:rig,actions});}catch(e){fail(e.message);}
 warnings.push('按 Slot 绘制顺序调整映射图层的遮挡，未映射图层保留位置。');warnings.push('仅导入所选 Skin 的初始附件；图片来自显式映射的已有图层，UV 矩形使用注册画布坐标。');warnings.push('贝塞尔轨道自适应转为线性关键帧（转换空间插值检查容差 0.02，每轨最多 64 帧）。');
 return {version:source.skeleton.spine,skin:chosen.name,skins:skins.map(s=>s.name),mapping,counts:{bones:bones.length,meshes:rig.meshes.length,constraints:rig.constraints.length,actions:actions.length},unsupported:errors,warnings,plan:{schema,characterRig:rig,actions,layerOrder:mapping.filter(m=>m.layerId).map(m=>m.layerId).reverse()}};
}
function transferDepth(old,uv){
 const known=new Map(old.depths.map((z,i)=>[old.uv[i*2].toFixed(7)+':'+old.uv[i*2+1].toFixed(7),z]));const output=[];
 for(let i=0;i<uv.length;i+=2){const x=uv[i],y=uv[i+1],exact=known.get(x.toFixed(7)+':'+y.toFixed(7));if(exact!==undefined){output.push(exact);continue;}let value=null;
  for(let j=0;j<old.triangles.length;j+=3){const [a,b,c]=old.triangles.slice(j,j+3),ax=old.uv[a*2],ay=old.uv[a*2+1],bx=old.uv[b*2],by=old.uv[b*2+1],cx=old.uv[c*2],cy=old.uv[c*2+1],det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(det)<1e-12)continue;const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det,w=1-u-v;if(Math.min(u,v,w)>=-1e-7){value=old.depths[a]*u+old.depths[b]*v+old.depths[c]*w;break;}}
  if(value===null){let nearest=0,best=Infinity;for(let j=0;j<old.depths.length;j++){const d=(x-old.uv[j*2])**2+(y-old.uv[j*2+1])**2;if(d<best){best=d;nearest=j;}}value=old.depths[nearest];}output.push(Math.max(-.25,Math.min(.25,value)));
 }return output;
}
function windowPlacement(doc,layer){return typeof module==='object'&&module.exports?require('./runtime-model.js').placement(doc,layer):window.CardRuntime.placement(doc,layer);}
function timeline(frames,duration,value,version,channel,factor,fallback){
 if(!Array.isArray(frames)||!frames.length)throw Error('Spine 轨道为空');const result=[];let previous=-1;
 for(const f of frames){if(!f||typeof f!=='object'||Array.isArray(f)||['time','x','y','angle','value','mix'].some(k=>f[k]!==undefined&&!Number.isFinite(f[k])))throw Error('Spine 关键帧格式无效');if(!Number.isFinite(num(f.time))||num(f.time)<0||num(f.time)<=previous||!Number.isFinite(value(f)))throw Error('Spine 时间或轨道数值无效');previous=num(f.time);}
 const push=(time,v,ease='linear')=>{const at=time/duration;if(result.length&&Math.abs(result.at(-1).at-at)<1e-12)result.pop();result.push({at,value:v,ease});if(result.length>64)throw Error('贝塞尔转换超过每轨 64 帧，请简化源轨道');};
 if(num(frames[0].time)>0)push(0,fallback,'hold');
 for(let i=0;i<frames.length;i++){
  const a=frames[i],b=frames[i+1],start=num(a.time),av=value(a);push(start,av,a.curve==='stepped'?'hold':'linear');if(!b||a.curve===undefined||a.curve==='linear'||a.curve==='stepped')continue;
  if(!Array.isArray(a.curve)||a.curve.length<4||a.curve.some(v=>!Number.isFinite(v)))throw Error('Spine 贝塞尔格式无效');
  const end=num(b.time),bv=value(b),v4=version.startsWith('4.'),offset=v4?channel*4:0,curve=a.curve.slice(offset,offset+4);if(curve.length!==4)throw Error('Spine 贝塞尔缺少通道控制点');
  const cx=v4?[(curve[0]-start)/(end-start),(curve[2]-start)/(end-start)]:[curve[0],curve[2]],cy=v4?[curve[1]*factor,curve[3]*factor]:[av+(bv-av)*curve[1],av+(bv-av)*curve[3]];if(cx.some(x=>x<0||x>1)||cx[0]>cx[1])throw Error('Spine 贝塞尔时间控制点无效');
  if(Math.abs(cx[0]-1/3)<1e-7&&Math.abs(cx[1]-2/3)<1e-7&&Math.abs(cy[0]-av)<1e-7&&Math.abs(cy[1]-bv)<1e-7){push(start,av,'smooth');continue;}
  const bezier=(p0,p1,p2,p3,t)=>(1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3;
  const evaluate=x=>{let lo=0,hi=1;for(let j=0;j<40;j++){const mid=(lo+hi)/2;if(bezier(0,cx[0],cx[1],1,mid)<x)lo=mid;else hi=mid;}return bezier(av,cy[0],cy[1],bv,(lo+hi)/2);};
  function subdivide(x0,y0,x1,y1,depth){const bad=[.25,.5,.75].some(t=>Math.abs(evaluate(x0+(x1-x0)*t)-(y0+(y1-y0)*t))>.02);if(bad){if(depth>=16)throw Error('Spine 贝塞尔曲线过于复杂');const mid=(x0+x1)/2,y=evaluate(mid);subdivide(x0,y0,mid,y,depth+1);push(start+(end-start)*mid,y);subdivide(mid,y,x1,y1,depth+1);}}subdivide(0,av,1,bv,0);
 }return result;
}
function convert(source,options){const report=inspect(source,options);if(report.unsupported.length)throw Error('Spine 导入检查未通过：'+report.unsupported.join('；'));return report.plan;}
return {inspect,convert,timeline,adapter:{id:'spine-json',convert}};
});
