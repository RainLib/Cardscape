/* Editor-only pose drafts. Previewing never mutates the saved rig or action. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./character-animation-model.js'));else root.CardCharacterPoseTools=factory(root.CardCharacterAnimation);})(typeof window==='object'?window:globalThis,C=>{
'use strict';
const degrees=r=>r*180/Math.PI;
function fk(doc,action,seconds,boneId){
 const rig=doc.characterRig,byId=new Map(rig.bones.map(b=>[b.id,b]));
 const descends=id=>{for(let b=byId.get(id);b;b=byId.get(b.parentId))if(b.id===boneId)return true;return false;};
 const affected=(rig.constraints||[]).filter(c=>(descends(c.rootId)||c.tipId===boneId)&&C.control(doc,action,'ik',c.id,seconds/action.duration).mix>0);
 if(!affected.length)return structuredClone(action);
 const pose=C.sample(doc,action,seconds,{seek:true}),bones=new Set(affected.flatMap(c=>[c.rootId,c.tipId]));let next=structuredClone(action);
 for(const id of bones){const b=byId.get(id),world=pose.bones.get(id).world,parent=b.parentId?pose.bones.get(b.parentId).world:C.matrix(0,0),local=C.multiply(C.inverse(parent),world),old=C.local(action,id,seconds/action.duration).rotation,raw=degrees(Math.atan2(local[1],local[0]))-b.rotation,angle=old+degrees(Math.atan2(Math.sin((raw-old)*Math.PI/180),Math.cos((raw-old)*Math.PI/180)));next=C.keyframe(next,id,'rotation',seconds,angle);}
 for(const c of affected)next=C.controlKeyframe(doc,next,'ik',c.id,'mix',seconds,0);
 return next;
}
function drag(doc,action,seconds,boneId,kind,start,pose=C.sample(doc,action,seconds,{seek:true})){
 const original=fk(doc,action,seconds,boneId),b=doc.characterRig.bones.find(b=>b.id===boneId),values=C.local(original,boneId,seconds/original.duration),world=pose.bones.get(boneId).world,pivot={x:world[4],y:world[5]},parent=b.parentId?pose.bones.get(b.parentId).world:C.matrix(0,0),inv=C.inverse(parent),from=C.point(inv,start.x,start.y),theta=Math.atan2(start.y-pivot.y,start.x-pivot.x);
 return q=>{if(kind==='rotate'){const angle=Math.atan2(q.y-pivot.y,q.x-pivot.x)-theta,delta=degrees(Math.atan2(Math.sin(angle),Math.cos(angle)));return C.keyframe(original,boneId,'rotation',seconds,Math.max(-720,Math.min(720,values.rotation+delta)));}const to=C.point(inv,q.x,q.y);let next=C.keyframe(original,boneId,'x',seconds,Math.max(-4096,Math.min(4096,values.x+to.x-from.x)));return C.keyframe(next,boneId,'y',seconds,Math.max(-4096,Math.min(4096,values.y+to.y-from.y)));};
}
function createSession(){
 let draft=null;
 const key=(doc,a,seconds,token)=>JSON.stringify([token,a,seconds,doc.characterRig?.bones,doc.characterRig?.constraints,doc.characterRig?.expressions]);
 function get(doc,a,seconds,token){if(draft&&draft.key!==key(doc,a,seconds,token))draft=null;return draft?.action||null;}
 return {get,set(doc,a,seconds,token,action){draft=JSON.stringify(a)===JSON.stringify(action)?null:{key:key(doc,a,seconds,token),action};},clear(){draft=null;},snapshot:()=>draft,restore(value){draft=value;}};
}
return {fk,drag,createSession};
});
