/* Editor-only frame navigation and temporary values. Drafts never change a card. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./runtime-model.js'):root.CardRuntime);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardAnimationAuthoring=api;})(typeof window==='object'?window:this,runtime=>{
'use strict';
const effects=['motion','emission','bend'],whole=['yaw','pitch','x','y','z','scale','opacity'];
function group(track){return effects.includes(track)?'effects':'whole';}
function step(seconds,direction,duration,fps=30){const frame=Math.round(seconds*fps)+direction;return Math.max(0,Math.min(duration,frame/fps));}
function adjacent(action,track,seconds,direction){const times=(action.tracks?.[track]||[]).map(f=>f.at*action.duration);return direction<0?[...times].reverse().find(t=>t<seconds-.00001)??0:times.find(t=>t>seconds+.00001)??action.duration;}
function removeFrame(action,track,seconds){const at=seconds/action.duration,frames=action.tracks?.[track];if(!frames?.some(f=>Math.abs(f.at-at)<.0001))return null;const next=structuredClone(action);next.tracks[track]=frames.filter(f=>Math.abs(f.at-at)>=.0001);if(!next.tracks[track].length)delete next.tracks[track];return next;}
function clearTrack(action,track){if(!action.tracks?.[track]?.length)return null;const next=structuredClone(action);delete next.tracks[track];return next;}
function draft(action,track,seconds,value,ease='linear'){
 const spec=runtime.animationTracks[track];if(!spec||!Number.isFinite(value)||value<spec.min||value>spec.max)throw Error('关键帧值超出范围');
 const next=structuredClone(action),at=+Math.max(0,Math.min(1,seconds/action.duration)).toFixed(6);
 next.tracks||={};if(!next.tracks[track])next.tracks[track]=[0,1].map(at=>{const v=runtime.action({actions:[action]},action.id,at*action.duration,{seek:true});return {at,value:track==='yaw'?v.rotation*180/Math.PI:track==='pitch'?v.pitch*180/Math.PI:v[track],ease:'linear'};});
 next.tracks[track]=next.tracks[track].filter(f=>Math.abs(f.at-at)>=.0001);next.tracks[track].push({at,value,ease});next.tracks[track].sort((a,b)=>a.at-b.at);return next;
}
function target(doc,layer,track){if(group(track)==='whole')return {scope:'whole',name:'整张卡片'};const owner=layer?.kind==='foreground'?layer:doc.layers.find(l=>l.id===layer?.splitSourceId)||doc.layers.find(l=>l.kind==='foreground');return {scope:'region',layerId:owner?.id,name:owner?.name||'人物',maskId:track==='emission'?'emission':'motion'};}
function guide(a,d=2.7){return [[0,0],[1024,0],[1024,1536],[0,1536]].map(([x,y])=>{x=(x/1024-.5)*a.scale;y=(.75-y/1024)*a.scale;const c=Math.cos(a.rotation),s=Math.sin(a.rotation),p=Math.cos(a.pitch),q=Math.sin(a.pitch),rx=c*x,rz=-s*x,ry=p*y-q*rz,z=q*y+p*rz+a.z,den=Math.max(.1,d-z);return {x:512+(rx+a.x/1024)*d/den*1024,y:768-(ry-a.y/1024)*d/den*1024};});}
return {effects,whole,group,step,adjacent,removeFrame,clearTrack,draft,target,guide};
});
