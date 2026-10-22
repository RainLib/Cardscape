const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {prepare}=require('./advanced-character-fixture.cjs'),C=require('../dist/renderer/character-animation-model.js'),R=require('../dist/renderer/runtime-model.js'),S=require('../dist/renderer/spatial-model.js'),{createServices}=require('../dist/electron/services.cjs');
async function main(){
 const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.argv[2]||path.join(root,'outputs/native-character-advanced'));
 const sourceFile=path.resolve(process.argv[3]||path.join(root,'outputs/heroes-30-2026-10-13/players/27-quantumslinger-v2/card.cardproj')),sourceBytes=await fs.readFile(sourceFile),source=JSON.parse(sourceBytes),doc=prepare(source);
 await fs.mkdir(directory,{recursive:true});
 await fs.writeFile(path.join(directory,'deformation-audit.json'),JSON.stringify(require('./character-deformation-audit.cjs').audit(doc),null,2));
 await fs.writeFile(path.join(directory,'part-plan.json'),JSON.stringify({card:'量子枪客（仅此一张验证副本）',source:sourceFile,sourceSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),sourceArtEdited:false,grips:'近侧右手 / 枪 / 握点为 forearm 单骨骼；远侧左手 / 枪为 far-arm 单骨骼；袖臂及肩根过渡蒙皮',seams:'相邻表面使用同一注册拓扑及边界权重/深度，衣摆末端骨骼保留局部运动',ik:'右肩 → 右前臂 → 腕握点；目标位移、权重可记录关键帧',expressions:doc.characterRig.expressions.map(e=>e.name),acceptance:'pending actual render and visual review'},null,2));
 // Reuse a previously inspected complete rest composite for service packaging;
 // the new rig's static/dynamic acceptance is performed in the actual editor.
 const previous=JSON.parse(await fs.readFile(path.join(root,'outputs/real-character-animation/verification-results.json'))),old=previous.cards.find(c=>c.id==='quantumslinger');
 const back=JSON.parse(await fs.readFile(path.join(old.editorExport,'card.cardproj'))).back;doc.back=back;
 const svc=createServices({runtimeDir:path.join(directory,'runtime')});
 try{
  const saved=await svc.invoke('save',{document:doc,saveAs:true}),opened=await svc.invoke('open',{});assert.deepEqual(opened.document.characterRig,doc.characterRig);
  const front='data:image/png;base64,'+(await fs.readFile(path.join(old.editorExport,'front.png'))).toString('base64'),result=await svc.invoke('export',{document:opened.document,front});
  const samples=[],angles=[[0,0],[-20,0],[20,0],[0,-12],[0,12],[-20,-12],[-20,12],[20,-12],[20,12]];
  for(const action of doc.actions.filter(a=>a.id!=='flip'))for(const progress of (action.id==='idle'?[0,.25,.75]:[0,.25,.5,.75,1])){
   const seconds=progress*action.duration,pose=C.sample(doc,action,seconds,{seek:true}),geometry={};
   for(const layer of doc.layers){const mesh=C.geometry(doc,layer,pose,R.placement(doc,layer));if(mesh)geometry[layer.id]={positions:Array.from(mesh.positions),checksum:C.advanced.checksum(mesh.positions)};}
   samples.push({action:action.id,seconds,angles:['idle','trigger'].includes(action.id)?angles:[[0,0]],bones:Object.fromEntries([...pose.bones].map(([id,p])=>[id,{matrix:p.matrix,opacity:p.opacity}])),placements:Object.fromEntries(doc.layers.map(l=>[l.id,R.placement(doc,l)])),geometry,ik:Object.fromEntries(pose.ik),expressions:Object.fromEntries(pose.expressions)});
  }
  const reference={samples,angles,hidden:['near-grip','near-leg','hero-body'],grips:[{layer:'near-grip',bone:'forearm',points:[[258,329],[212,177]]},{layer:'far-grip',bone:'far-arm',points:[[742,353],[838,311]]}],camera:S.camera(doc)};
  await fs.writeFile(path.join(result.directory,'review-reference.json'),JSON.stringify(reference));
  await fs.writeFile(path.join(result.directory,'godot/tests/advanced-character-reference.json'),JSON.stringify(reference));
  for(const name of ['real-character-review.js','real-character-review.css'])await fs.copyFile(path.join(__dirname,name),path.join(result.directory,name));
  const html=await fs.readFile(path.join(result.directory,'index.html'),'utf8');await fs.writeFile(path.join(result.directory,'review.html'),html.replace('</head>','<link rel="stylesheet" href="real-character-review.css"><script defer src="real-character-review.js"></script></head>'));
  const card={id:'quantumslinger',name:doc.name,source:sourceFile,sourceSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),project:saved.file,export:result.directory,godot:path.join(result.directory,'godot'),meshCount:doc.characterRig.meshes.length,vertices:doc.characterRig.meshes.reduce((n,m)=>n+m.vertices.length/2,0),expressions:doc.characterRig.expressions.length};
  await fs.writeFile(path.join(directory,'verification-paths.json'),JSON.stringify({directory,cards:[card]},null,2));console.log(JSON.stringify(card));
  assert.deepEqual(source.layers,doc.layers);assert.deepEqual(source.masks,doc.masks);assert.deepEqual(await fs.readFile(sourceFile),sourceBytes);
 }finally{svc.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
