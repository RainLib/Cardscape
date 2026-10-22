// Prepare isolated, reproducible real-art QA copies. Never overwrite a workshop.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const C=require('../dist/renderer/character-animation-model.js'),R=require('../dist/renderer/runtime-model.js'),cases=require('./real-character-cases.cjs');
const {createServices}=require('../dist/electron/services.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const frames=values=>values.map((value,i)=>({at:i/(values.length-1),value,ease:'smooth'}));
function prepare(source,spec){
 const doc=structuredClone(source);doc.id='real-animation-'+spec.id;doc.name=spec.name+' · 自有动画验证副本';
 const body=doc.layers.find(l=>l.id==='hero-body');
 const registered=([x,y])=>[512+(x-512)*body.scale+body.x,768+(y-768)*body.scale+body.y];
 const add=(id,name,parentId,p)=>{const [x,y]=registered(p);C.addBone(doc,{id,name,parentId,x,y});};
 add('root','人物整体',null,spec.root);C.bind(doc,'hero-body','root');
 for(const p of spec.parts){add(p.bone,p.connection,'root',p.pivot);C.bind(doc,p.layer,p.bone);}
 if(spec.static?.length){add('world','独立环境碎片',null,[512,768]);for(const id of spec.static)C.bind(doc,id,'world');}
 const idle=doc.actions.find(a=>a.id==='idle'),trigger=doc.actions.find(a=>a.id==='trigger');
 idle.boneTracks={root:{y:frames([0,-5,0,5,0]),rotation:frames([0,.7,0,-.7,0])}};
 trigger.boneTracks={root:{y:frames([0,-8,0,8,0]),rotation:frames([0,1,0,-1,0])}};
 for(const p of spec.parts){idle.boneTracks[p.bone]={rotation:frames([0,p.angle*.3,0,-p.angle*.3,0])};trigger.boneTracks[p.bone]={rotation:frames([0,p.angle,0,-p.angle,0])};}
 C.validate(doc);return doc;
}
async function main(){
 const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.argv[2]||path.join(root,'outputs/real-character-animation'));
 const sourceRoot=path.resolve(process.argv[3]||path.join(root,'outputs/heroes-30-2026-10-13/players'));
 await fs.mkdir(directory,{recursive:true});
 // This is a part plan, not an acceptance result. Write it before rigging copies.
 await fs.writeFile(path.join(directory,'part-plan.json'),JSON.stringify({schema:'real-character-part-plan/1',canvas:[1024,1536],angles:[[0,0],[-20,0],[20,0],[0,-12],[0,12],[-20,-12],[-20,12],[20,-12],[20,12]],cases,status:'pending visual acceptance',artworkEdits:false},null,2));
 const svc=createServices({runtimeDir:path.join(directory,'runtime')}),results=[];
 try{for(const spec of cases){
  const sourceFile=path.join(sourceRoot,spec.source,'card.cardproj'),bytes=await fs.readFile(sourceFile),source=JSON.parse(bytes),doc=prepare(source,spec);
  const saved=await svc.invoke('save',{document:doc,saveAs:true}),opened=await svc.invoke('open',{});
  assert.deepEqual(opened.document.characterRig,doc.characterRig);assert.deepEqual(opened.document.actions,doc.actions);
  assert.deepEqual(doc.layers,source.layers);assert.deepEqual(doc.masks,source.masks);
  const exported=await svc.invoke('export',{document:opened.document,front:source.layers.find(l=>l.id==='hero-body').src});
  const manifest=JSON.parse(await fs.readFile(path.join(exported.directory,'manifest.json')));assert.deepEqual(manifest.characterRig,doc.characterRig);
  const samples=[];for(const action of doc.actions.filter(a=>['idle','trigger'].includes(a.id)))for(const seconds of [0,action.duration*.25,action.duration*.5,action.duration*.75,action.duration]){
   const pose=C.sample(doc,action,seconds,{seek:true});samples.push({action:action.id,seconds,bones:Object.fromEntries([...pose.bones].map(([id,p])=>[id,{matrix:p.matrix,opacity:p.opacity}])),placements:Object.fromEntries(doc.layers.map(l=>[l.id,R.placement(doc,l,pose)]))});
  }
  const reference={samples,hidden:spec.hidden,grips:spec.parts.filter(p=>p.probes).map(p=>({layer:p.layer,bone:p.bone,points:p.probes})),angles:[[0,0],[-20,0],[20,0],[0,-12],[0,12],[-20,-12],[-20,12],[20,-12],[20,12]]};
  await fs.writeFile(path.join(exported.directory,'godot/tests/real-character-reference.json'),JSON.stringify(reference,null,2));
  await fs.copyFile(path.join(__dirname,'real-character-review.js'),path.join(exported.directory,'real-character-review.js'));
  await fs.copyFile(path.join(__dirname,'real-character-review.css'),path.join(exported.directory,'real-character-review.css'));
  const html=await fs.readFile(path.join(exported.directory,'index.html'),'utf8');
  await fs.writeFile(path.join(exported.directory,'review.html'),html.replace('</head>','<link rel="stylesheet" href="real-character-review.css"><script defer src="real-character-review.js"></script></head>'));
  await fs.writeFile(path.join(exported.directory,'review-reference.json'),JSON.stringify(reference));
  assert.equal(hash(await fs.readFile(sourceFile)),hash(bytes));
  results.push({id:spec.id,name:spec.name,source:sourceFile,sourceSha256:hash(bytes),project:saved.file,export:exported.directory,godot:path.join(exported.directory,'godot'),savedReopened:true,assetsUnchanged:true,samples:samples.length,visualAcceptance:'pending',staticFront:'body-only placeholder; verify complete static card using the editor Export button'});
  console.log(JSON.stringify(results.at(-1)));
 }}finally{svc.close();}
 await fs.writeFile(path.join(directory,'verification-paths.json'),JSON.stringify({directory,cards:results},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={prepare};
