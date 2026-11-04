const {fixture,png}=require('./character-animation.cjs');
const F=require('../../dist/renderer/frame-model.js');
function irregular(){
 const doc=fixture();doc.id='irregular-card';doc.name='双窗异形卡 · 层序与过渡';
 doc.frameStyle={...F.defaults,finish:'flat',color:'#44aa44',accent:'#44aa44',contour:{
  outline:[[128,0],[896,0],[1024,160],[930,700],[1024,1200],[512,1536],[0,1200],[94,700],[0,160]],
  windows:[[[160,160],[864,160],[800,650],[224,650]],[[224,800],[800,800],[850,1100],[512,1360],[174,1100]]]
 }};
 doc.layers=doc.layers.filter(l=>['body','forearm','frame','background'].includes(l.id));
 const body=doc.layers.find(l=>l.id==='body'),arm=doc.layers.find(l=>l.id==='forearm');
 body.src=png([42,30,44,135],[240,40,30,255]);arm.src=png([42,30,44,135],[30,80,245,255]);
 for(const layer of [body,arm])layer.spatial={role:'body',z:.075,clip:false};
 doc.characterRig.bindings=[{layerId:'body',boneId:'root'},{layerId:'forearm',boneId:'elbow'}];
 doc.effects={...doc.effects,cape:false,flow:false,depth:0,paused:true};
 doc.actions=[
  {id:'idle',name:'遮挡切换',event:'idle',duration:2,loop:true,motion:1,emission:1,bend:0,transitionDuration:.4,drawOrder:[{at:0,layers:['body','forearm']},{at:.5,layers:['forearm','body']}]},
  {id:'raise',name:'抬臂过渡',event:'trigger',duration:1,loop:false,motion:1,emission:1,bend:0,transitionDuration:.4,boneTracks:{elbow:{rotation:[{at:0,value:-30},{at:1,value:-60}]}},tracks:{x:[{at:0,value:80},{at:1,value:120}]}}
 ];
 return doc;
}
module.exports={irregular};
