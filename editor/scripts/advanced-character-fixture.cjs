// One copied real card. Source pixels and Masks remain immutable. Adjacent
// registered surfaces share a weight/depth field at their cut boundaries.
const C=require('../renderer/character-animation-model.js'),S=require('../renderer/spatial-model.js');
const smooth=(a,b,v)=>{const x=Math.max(0,Math.min(1,(v-a)/(b-a)));return x*x*(3-2*x);};
const frames=values=>values.map((value,i)=>({at:i/(values.length-1),value,ease:'smooth'}));
function prepare(source){
 const doc=structuredClone(source);doc.id='quantumslinger-native-advanced';doc.name='量子枪客 · 自有蒙皮 IK 表情验证副本';doc.characterRig={schema:C.schema,bones:[],bindings:[],constraints:[],meshes:[],expressions:[]};
 const body=doc.layers.find(l=>l.id==='hero-body'),reg=([x,y])=>[512+(x-512)*body.scale+body.x,768+(y-768)*body.scale+body.y];
 const bone=(id,name,parentId,p)=>{const [x,y]=reg(p);C.addBone(doc,{id,name,parentId,x,y});};
 bone('root','人物整体',null,[550,620]);bone('shoulder','近侧右肩','root',[430,342]);bone('forearm','近侧右前臂与枪','shoulder',[386,380]);bone('far-arm','远侧左手与枪','root',[561,365]);bone('near-leg','近侧右腿','root',[603,679]);bone('far-leg','远侧左腿','root',[566,794]);bone('cloth','衣摆末端','root',[480,574]);
 const wrist=reg([278,352]),elbow=reg([386,380]);
 doc.characterRig.constraints.push({id:'aim',name:'右手抬枪瞄准',rootId:'shoulder',tipId:'forearm',end:[wrist[0]-elbow[0],wrist[1]-elbow[1]],target:wrist,bend:1,mix:1});
 const expressionNames={blinkL:'左眼闭合',blinkR:'右眼闭合',browRaise:'眉部抬起',browAnger:'眉间收紧',mouthClose:'闭口 / 口型',mouthRound:'圆口 / O 音',smile:'嘴角上扬',jaw:'下颌张开'};
 doc.characterRig.expressions=Object.entries(expressionNames).map(([id,name])=>({id,name,value:0}));
 const xs=[...new Set([0,128,256,320,384,416,...Array.from({length:27},(_,i)=>432+i*8),710,800,896,1024])].sort((a,b)=>a-b);
 const ys=[...new Set([0,96,160,...Array.from({length:32},(_,i)=>176+i*6),416,512,600,680,768,856,944,1032,1120,1216,1344,1440,1536])].sort((a,b)=>a-b);
 function influence(x,y){
  if(x<=390&&y<=300||x<=340&&y<=455)return [{boneId:'forearm',weight:1}];
  const near=(1-smooth(370,445,x))*(1-smooth(435,485,y)),lower=1-smooth(335,410,x)*smooth(280,345,y);
  const raw=[['forearm',near*lower],['shoulder',near*(1-lower)],['far-arm',smooth(565,710,x)*(1-smooth(430,500,y))],['near-leg',smooth(575,820,y)*(1-smooth(1120,1250,y))*smooth(360,510,x)],['far-leg',smooth(1010,1220,y)],['cloth',smooth(560,980,y)*(1-smooth(340,510,x))]];
  const dominant=raw.filter(([,w])=>w>.000001).sort((a,b)=>b[1]-a[1]);
  // Hand / gun regions remain a single transform. A common field elsewhere
  // makes extracted material edges meet under combined skin and camera motion.
  if(dominant[0]?.[1]>.999999&&['forearm','far-arm'].includes(dominant[0][0]))return [{boneId:dominant[0][0],weight:1}];
  const sum=dominant.reduce((s,[,w])=>s+w,0),root=Math.max(0,1-Math.min(1,sum));const values=[['root',root],...dominant].filter(([,w])=>w>.000001).sort((a,b)=>b[1]-a[1]).slice(0,4),total=values.reduce((s,[,w])=>s+w,0);return values.map(([boneId,w])=>({boneId,weight:w/total}));
 }
 const pixels=require('./character-source-coverage.cjs'),characterLayers=doc.layers.filter(l=>l.src&&S.character(l)),occupied=pixels.occupied(characterLayers),coverage=pixels.imageData(doc.masks.coverage);
 for(const layer of characterLayers){
  C.bind(doc,layer.id,layer.id==='near-grip'?'forearm':layer.id==='far-grip'?'far-arm':layer.id==='near-leg'?'near-leg':layer.id==='far-leg'?'far-leg':'root');
  const mesh={layerId:layer.id,vertices:[],uv:[],triangles:[],weights:[],morphs:[],depths:[]},plane=S.resolve(doc,layer).z;
  for(const y of ys)for(const x of xs){mesh.vertices.push(x,y);mesh.uv.push(x/1024,y/1536);mesh.weights.push(influence(x,y));}
  // Pin actual internal cut boundaries to their parent depth; preserve each
  // independent limb/cloth plane away from the seam, including hidden support.
  const joins=layer.ownershipMask?S.attachmentWeights(mesh.uv,pixels.imageData(layer.ownershipMask),coverage,72,undefined,'cloth'):new Float32Array(mesh.weights.length).fill(1);
  mesh.depths=Array.from(joins,weight=>.12+(plane-.12)*weight-plane);
  for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){if(!occupied(xs[x],ys[y],xs[x+1],ys[y+1]))continue;const a=y*xs.length+x;mesh.triangles.push(a,a+xs.length,a+1,a+1,a+xs.length,a+xs.length+1);}
  if(layer.id==='hero-body'){
   const gaussian=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
   const shapes={
    blinkL:(x,y)=>[0,-(y-249)*.94*gaussian(x,y,549,249,20,12)],
    blinkR:(x,y)=>[0,-(y-238)*.94*gaussian(x,y,490,238,23,12)],
    browRaise:(x,y)=>[0,-8*(gaussian(x,y,490,225,27,13)+gaussian(x,y,550,236,23,13))],
    browAnger:(x,y)=>[(x<520?2:-2)*gaussian(x,y,520,235,35,15),5*gaussian(x,y,520,235,35,15)],
    mouthClose:(x,y)=>[0,-(y-299)*.90*gaussian(x,y,509,299,29,30)],
    mouthRound:(x,y)=>[-(x-509)*.25*gaussian(x,y,509,299,32,30),2*gaussian(x,y,509,299,25,28)],
    smile:(x,y)=>[(x<509?-2:2)*gaussian(x,y,509,297,35,22),-7*(gaussian(x,y,484,292,12,20)+gaussian(x,y,533,301,12,20))],
    jaw:(x,y)=>[0,5*gaussian(x,y,510,321,37,20)]
   };
   for(const [expressionId,shape] of Object.entries(shapes)){const deltas=[];for(let i=0;i<mesh.vertices.length/2;i++){const [dx,dy]=shape(mesh.vertices[i*2],mesh.vertices[i*2+1]);if(Math.abs(dx)+Math.abs(dy)>.001)deltas.push(i,dx,dy);}mesh.morphs.push({expressionId,deltas});}
  }
  doc.characterRig.meshes.push(mesh);
 }
 const make=(id,name,event='trigger',duration=2,loop=false)=>({id,name,event,duration,loop,motion:1,emission:1,bend:0});
 const motion=(gain=1)=>({root:{y:frames([0,-5*gain,0,5*gain,0]),rotation:frames([0,.7*gain,0,-.7*gain,0])},'far-arm':{rotation:frames([0,-3*gain,0,3*gain,0])},'near-leg':{rotation:frames([0,2*gain,0,-2*gain,0])},'far-leg':{rotation:frames([0,-2*gain,0,2*gain,0])},cloth:{rotation:frames([0,3*gain,0,-3*gain,0])}});
 const aim=(gain=1)=>({aim:{x:frames([wrist[0],wrist[0]-6*gain,wrist[0],wrist[0]+6*gain,wrist[0]]),y:frames([wrist[1],wrist[1]-10*gain,wrist[1],wrist[1]+10*gain,wrist[1]])}});
 doc.actions=[{...make('idle','待机 · 呼吸与眨眼','idle',4,true),boneTracks:motion(.35),ikTracks:aim(.35),expressionTracks:{blinkL:{value:frames([0,0,0,1,0])},blinkR:{value:frames([0,0,0,1,0])}}},{...make('trigger','抬枪 · IK 与衣摆'),boneTracks:motion(),ikTracks:aim(),expressionTracks:{browAnger:{value:frames([0,.7,.2,.7,0])},mouthClose:{value:frames([0,.5,.2,.5,0])}}},{...make('blink','表情 · 左右眼独立','hover'),expressionTracks:{blinkL:{value:frames([0,1,0,0,0])},blinkR:{value:frames([0,0,0,1,0])}}},{...make('talk','表情 · 连续口型'),expressionTracks:{mouthClose:{value:frames([0,.9,.15,.85,0])},mouthRound:{value:frames([0,.2,1,.3,0])},jaw:{value:frames([0,.3,1,.2,0])}}},{...make('emotion','表情 · 眉眼嘴角组合'),expressionTracks:{browRaise:{value:frames([0,1,.3,0,0])},smile:{value:frames([0,.8,1,.2,0])},mouthClose:{value:frames([0,.8,.7,.2,0])},browAnger:{value:frames([0,0,.2,1,0])}}},{...make('flip','翻转','flip',1.2)}];
 C.validate(doc);return doc;
}
module.exports={prepare};
