const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,bytes){const name=Buffer.from(type),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);name.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,bytes])),bytes.length+8);return out;}
function png(w,h,pixels){const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=6;const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)Buffer.from(pixels.slice(y*w*4,(y+1)*w*4)).copy(raw,y*(w*4+1)+1);return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');}
function decode(src){const b=Buffer.from(src.split(',')[1],'base64');let offset=8,idat=[],w,h,channels;while(offset<b.length){const n=b.readUInt32BE(offset),t=b.toString('ascii',offset+4,offset+8),d=b.subarray(offset+8,offset+8+n);if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);channels={0:1,2:3,6:4}[d[9]];}if(t==='IDAT')idat.push(d);offset+=n+12;}const raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*channels,out=Buffer.alloc(w*h*channels);const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};for(let y=0;y<h;y++){const f=raw[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,left=x>=channels?out[i-channels]:0,up=y?out[i-stride]:0,corner=y&&x>=channels?out[i-stride-channels]:0;out[i]=(raw[y*(stride+1)+x+1]+([0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][f]))&255;}}return {w,h,channels,pixels:out};}

const S=require('../dist/renderer/spatial-model.js'),R=require('../dist/renderer/runtime-model.js'),Space=require('../dist/renderer/space-model.js'),E=require('../dist/renderer/editor-commands.js');
test('legacy coverage multiplication is repaired without cutting opaque parent detail',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createServices}=require('../dist/electron/services.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'split-edge-')),svc=createServices({runtimeDir:dir});
 try{const master=png(3,1,[20,40,60,128,30,50,70,255,40,60,80,255]),child=png(3,1,[20,40,60,64,30,50,70,0,40,60,80,128]),parent=png(3,1,[20,40,60,64,30,50,70,255,40,60,80,127]),mask=png(3,1,[128,128,128,255,0,0,0,255,128,128,128,255]),r=await svc.invoke('process',{op:'repair_split',args:{parent,child,master,mask}});
 assert.deepEqual([...decode(r.image).pixels.filter((_,i)=>i%4===3)],[128,0,128]);assert.deepEqual([...decode(r.parent).pixels],[20,40,60,0,30,50,70,255,40,60,80,127]);assert.equal(r.changed_pixels,1);
 await assert.rejects(svc.invoke('process',{op:'repair_split',args:{parent,child:png(1,1,[0,0,0,0]),master,mask}}),/dimensions/);
 }finally{svc.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('explicit cloth roots release the hem and trailing cape despite opaque backing',()=>{
 const uv=[.5,870/1536,.5,1000/1536,.5,1320/1536],weights=S.attachmentWeights(uv,null,null,96,{edge:'top',pin:870,release:1130});
 assert.equal(weights[0],0);assert.equal(weights[1],.5);assert.equal(weights[2],1);
 const cape=S.attachmentWeights([.5,.6,.4,.6,.1,.6],null,null,80,{edge:'right',pin:600,release:850});assert.equal(cape[0],0);assert.ok(cape[1]>0&&cape[1]<.1);assert.equal(cape[2],1);
 const doc={spatial:{...S.defaults},layers:[{id:'body',kind:'foreground',spatial:{role:'body',z:.07,clip:false}},{id:'cloth',kind:'image',splitSourceId:'body',spatial:{role:'front',z:.17,clip:false},attachment:{maxOffset:.1,blendWidth:96,anchor:{edge:'top',pin:870,release:1130},motion:.4}}]};S.validate(doc);
 const link=S.connection(doc,doc.layers[1]);assert.ok(Math.abs(link.z-link.parentZ-.1)<1e-9);
 const shape=Space.clothGeometry(doc,{...doc.layers[1],x:0,y:0,scale:1});assert.ok(shape.positions.includes(link.parentZ));assert.ok(shape.positions.some((v,i)=>i%3===2&&Math.abs(v-link.z)<1e-10));
 for(const [yaw,pitch] of [[.49,0],[-.49,0],[0,.31],[0,-.31]]){const source=[.05,-.45],point=z=>S.project([source[0]*(2.7-z)/2.655,source[1]*(2.7-z)/2.655,z],yaw,pitch),front=point(link.z),back=point(link.parentZ);assert.ok(Math.hypot(front[0]-back[0],front[1]-back[1])>.008);}
 E.validate([{op:'attachment',layerId:'cloth',maxOffset:.1,anchor:{edge:'top',pin:870,release:1130},motion:.4}]);assert.throws(()=>E.validate([{op:'attachment',layerId:'cloth',anchor:{edge:'right',pin:700,release:690}}]),/根部/);assert.throws(()=>S.validateAttachment({maxOffset:.2,blendWidth:64}),/连接/);
});
test('corrected split edge expansion transfers alpha without opening gaps or cutting distant detail',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createServices}=require('../dist/electron/services.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'split-radius-')),svc=createServices({runtimeDir:dir});
 try{const image=a=>png(5,1,a.map(v=>[20,40,60,v]).flat()),master=image([255,255,255,255,255]),child=image([0,80,0,0,0]),parent=image([255,175,255,255,255]),mask=png(5,1,[0,80,0,0,0].map(v=>[v,v,v,255]).flat()),r=await svc.invoke('process',{op:'repair_split',args:{parent,child,master,mask,radius:1,legacy:false}}),front=[...decode(r.image).pixels.filter((_,i)=>i%4===3)],back=[...decode(r.parent).pixels.filter((_,i)=>i%4===3)];
 assert.deepEqual(front,[80,80,80,0,0]);assert.deepEqual(back,[175,175,175,255,255]);assert.deepEqual(front.map((v,i)=>v+back[i]),[255,255,255,255,255]);
 }finally{svc.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('underpaint support can be narrowed and re-expanded without overwriting original visible pixels',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createServices}=require('../dist/electron/services.cjs'),{prepareAuthoring}=require('../dist/electron/authoring-service.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'cloth-support-')),svc=createServices({runtimeDir:dir});
 try{const original=png(4,2,Array.from({length:8},(_,i)=>[80,90,100,i%4===0?255:0]).flat()),candidate=png(4,2,Array.from({length:8},()=>[15,35,55,255]).flat()),white=png(4,2,Array.from({length:8},()=>[255,255,255,255]).flat()),initial=await svc.invoke('process',{op:'underpaint',args:{image:original,candidate,mask:white}}),doc=R.ensure({id:'test',layers:[{id:'body',kind:'foreground',src:initial.image,master:initial.image,visible:true,locked:false,underpaint:{original,addedMask:initial.addedMask,filledPixels:initial.filled_pixels,jobId:'real-job'}}],masks:{rigid:initial.addedMask},effects:{}});
 const tools={validate:v=>v,process:(op,args)=>svc.invoke('process',{op,args})};
 const narrow=await prepareAuthoring({document:doc,documentToken:'test',commands:[{op:'repairRegion',layerId:'body',polygon:[[0,0],[1,0],[1,1],[0,1]],feather:0}]},tools),body=narrow.document.layers[0];assert.ok(body.underpaint.filledPixels<initial.filled_pixels);assert.equal(body.underpaint.candidate,initial.image);assert.equal(body.underpaint.original,original);assert.deepEqual([...decode(body.src).pixels.slice(0,4)],[80,90,100,255]);
 const expanded=await prepareAuthoring({document:narrow.document,documentToken:'test',commands:[{op:'repairRegion',layerId:'body',polygon:[[0,0],[3,0],[3,1],[0,1]],feather:0}]},tools);assert.ok(expanded.document.layers[0].underpaint.filledPixels>body.underpaint.filledPixels);assert.equal(doc.layers[0].src,initial.image);
 }finally{svc.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('attached cloth keeps its internal cut seam at the parent and limits tip separation',()=>{
 const parent={id:'body',kind:'foreground',spatial:{role:'body',z:.07,clip:false}},child={id:'skirt',kind:'image',splitSourceId:'body',spatial:{role:'front',z:.30,clip:false}},doc={spatial:{...S.defaults},layers:[parent,child]};
 const link=S.connection(doc,child);assert.ok(Math.abs(S.resolve(doc,child).z-link.parentZ-.025)<1e-10);
 const w=128,h=192,full={width:w,height:h,data:new Uint8ClampedArray(w*h*4)},owned={width:w,height:h,data:new Uint8ClampedArray(w*h*4)};
 for(let i=0;i<w*h;i++){full.data[i*4]=255;owned.data[i*4]=i%w>=40&&i%w<=85?255:0;}
 const weights=S.attachmentWeights([40/127,.5,62/127,.5],owned,full,64);assert.equal(weights[0],0);assert.equal(weights[1],1);
 for(const [yaw,pitch] of [[-.61,-.44],[.61,.44],[.61,-.44]]){const seamZ=link.parentZ+(link.z-link.parentZ)*weights[0];assert.deepEqual(S.project([.1,.2,seamZ],yaw,pitch),S.project([.1,.2,link.parentZ],yaw,pitch));}
 child.attachment={maxOffset:.015,blendWidth:96};assert.ok(Math.abs(S.connection(doc,child).z-link.parentZ-.015)<1e-10);child.attachment.maxOffset=1;assert.throws(()=>S.validate(doc),/连接/);
});
test('real underpaint fills selected missing pixels without replacing visible artwork',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createServices}=require('../dist/electron/services.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-underpaint-')),svc=createServices({runtimeDir:dir});
 try{const image=png(3,1,[200,40,20,255,10,20,30,0,70,80,90,0]),candidate=png(3,1,[0,150,250,255,0,150,250,255,0,150,250,255]),mask=png(3,1,[255,255,255,255,0,0,0,255,255,255,255,255]);const r=await svc.invoke('process',{op:'underpaint',args:{image,candidate,mask}});assert.equal(r.filled_pixels,1);assert.deepEqual([...decode(r.image).pixels],[200,40,20,255,10,20,30,0,0,150,250,255]);assert.deepEqual([...decode(r.addedMask).pixels],[0,0,255]);
 await assert.rejects(svc.invoke('process',{op:'underpaint',args:{image,candidate:png(1,1,[0,0,0,255]),mask}}),/dimensions/);
 }finally{svc.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('badges and character artwork obey the same editable painter order',()=>{
 const Stats=require('../dist/renderer/card-stats.js'),doc=R.ensure({id:'card',layers:[{id:'art',kind:'foreground',x:0,y:0,scale:1,visible:true},{id:'title',kind:'text',text:'hero',x:0,y:0,scale:1,visible:true}],effects:{}});Stats.apply(doc,{cost:4,power:7});
 const moved=E.plan(doc,[{op:'reorder',layerId:'stat-cost',index:3}],'stat-cost').document;
 assert.deepEqual(Stats.paintOrder(moved.layers).map(l=>l.id),['stat-cost','title','art','stat-power']);
 const raised=E.plan(moved,[{op:'reorder',layerId:'stat-cost',index:0}],'stat-cost').document;
 assert.deepEqual(Stats.paintOrder(raised.layers).map(l=>l.id),['title','art','stat-power','stat-cost']);assert.equal(Stats.resolve(raised).cost,4);
 const front=E.plan(raised,[{op:'reorder',layerId:'art',index:0}],'art').document;
 assert.equal(Stats.paintOrder(front.layers).at(-1).id,'art');
 const order=Space.scene(front).filter(n=>n.layerId==='art'||n.layerId==='stat-power');assert.equal(order.at(-1).layerId,'art');
});
test('AI edits existing action parameters atomically and can enter the spatial inspector',async()=>{
 const {prepareAuthoring}=require('../dist/electron/authoring-service.cjs'),doc=R.ensure({id:'card',layers:[{id:'title',kind:'text',text:'test',x:0,y:0,scale:1,opacity:1,visible:true}],effects:{}}),original=structuredClone(doc.actions),validate=v=>{R.validate(v);return v;};
 const result=await prepareAuthoring({document:doc,documentToken:'card',commands:[{op:'actionSettings',actionId:'flip',bend:0},{op:'view',mode:'space'}]},{validate});
 assert.equal(result.document.actions.find(a=>a.id==='flip').bend,0);assert.equal(result.document.actions.find(a=>a.id==='flip').duration,1.2);assert.equal(result.preview.mode,'space');assert.deepEqual(doc.actions,original);
 await assert.rejects(prepareAuthoring({document:doc,documentToken:'card',commands:[{op:'actionSettings',actionId:'flip',bend:0},{op:'actionSettings',actionId:'missing',bend:0}]},{validate}),/不存在/);assert.deepEqual(doc.actions,original);
 assert.throws(()=>E.validate([{op:'actionSettings',actionId:'flip',tracks:{yaw:[{at:.5,value:90},{at:.4,value:180}]}}]),/关键帧/);
});
test('depth registration aligns the front view while preserving camera parallax',()=>{
 const doc={spatial:{...S.defaults}},layers=['far','mid','near','rear','body','front','title'].map(role=>({kind:role==='body'?'foreground':'image',spatial:{role,z:S.roles[role].z,clip:S.roles[role].clip}}));
 const front=layers.map(l=>{const p=S.resolve(doc,l);return S.project([.3*p.registration,.2*p.registration,p.z],0,0);});
 for(const p of front)assert.ok(Math.abs(p[0]-front[0][0])<1e-12&&Math.abs(p[1]-front[0][1])<1e-12);
 const side=layers.map(l=>{const p=S.resolve(doc,l);return S.project([0,0,p.z],.35,.2);});
 for(let i=1;i<side.length;i++)assert.ok(side[i][0]>side[i-1][0]);
 assert.notDeepEqual(S.project([.2,0,.15],.35,0,2.4),S.project([.2,0,.15],.35,0,3.2));
 for(const distance of [2.2,4]){doc.spatial.cameraDistance=distance;const p=layers.map(l=>{const sp=S.resolve(doc,l);return S.project([.3*sp.registration,.2*sp.registration,sp.z],0,0,distance);});for(const point of p)assert.ok(Math.abs(point[0]-p[0][0])<1e-12&&Math.abs(point[1]-p[0][1])<1e-12);}
 assert.equal(S.enabled({}),false);assert.equal(S.resolve({},layers[0]).registration,1);
});
test('the entire overscan image expands the background plane instead of using a fixed margin',()=>{
 const layer={kind:'background',sourceWindow:{x:384,y:576,width:1024,height:1536}};
 assert.deepEqual(S.extent(layer,[1792,2688]),[1.75,1.75]);
 const scene=Space.scene({spatial:{...S.defaults},layers:[{...layer,id:'far',visible:true,x:0,y:0,scale:1}],effects:{}},{mode:'actual'});
 assert.deepEqual(scene.find(n=>n.layerId==='far').extent,[1.75,1.75]);
 assert.deepEqual(S.extent({kind:'image'}),[1,1]);
});
test('spatial roles are bounded, editable and agree with the actual layer scene',()=>{
 const d=R.ensure({layers:[{id:'body',kind:'foreground',x:0,y:0,scale:1,visible:true},{id:'title',kind:'text',x:0,y:0,scale:1,visible:true}],effects:{depth:1,background:1}});
 S.set(d,d.layers[0],{role:'body'});S.set(d,d.layers[1],{role:'title',z:.22});
 const nodes=Space.scene(d,{mode:'actual'});assert.equal(nodes.find(n=>n.layerId==='title').z,.265);assert.ok(nodes.find(n=>n.layerId==='title').z>nodes.find(n=>n.part==='outside').z);
 Space.setProperty(d,'title','depth',.25);assert.equal(d.layers[1].spatial.z,.25);
 assert.throws(()=>S.set(d,d.layers[0],{role:'front'}));assert.throws(()=>E.validate([{op:'camera',distance:1}]));assert.throws(()=>E.validate([{op:'spatial',layerId:'body',role:'body',z:2}]));
 require('../dist/renderer/card-stats.js').apply(d,{cost:4,power:7});for(const l of d.layers.filter(require('../dist/renderer/card-stats.js').isStat)){assert.equal(S.resolve(d,l).role,'stat');assert.ok(Math.abs(S.resolve(d,l).relativeZ-.015)<1e-12);}
});
test('native alpha cleanup and failed-candidate recovery preserve the original and reject cross-card access',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto'),{createServices}=require('../dist/electron/services.cjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'alpha-recovery-')),svc=createServices({runtimeDir:dir}),id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 try{const source=png(4,1,[21,42,63,0,31,52,73,1,41,62,83,4,51,72,93,5]),raw=Buffer.from(source.split(',')[1],'base64'),jobDir=path.join(dir,'agent-jobs',id);await fs.mkdir(path.join(jobDir,'output'),{recursive:true});await fs.mkdir(path.join(dir,'agent-snapshots'),{recursive:true});
 await fs.writeFile(path.join(jobDir,'output/result.png'),raw);await fs.writeFile(path.join(jobDir,'result.json'),JSON.stringify({status:'unavailable',image:'output/result.png',message:'weak alpha residue'}));await fs.writeFile(path.join(dir,'agent-snapshots',id+'.json'),JSON.stringify({source,mask:null}));await fs.writeFile(path.join(jobDir,'job.json'),JSON.stringify({id,state:'failed',mode:'generate',documentToken:'card-a',sourceHash:createHash('sha256').update(raw).digest('hex'),padding:[0,0,0,0],events:[],message:'weak alpha residue',width:4,height:1,outputWidth:4,outputHeight:1}));
 await assert.rejects(svc.invoke('agent-recover-candidate',{id,documentToken:'card-b',threshold:4}),/其他卡片/);await assert.rejects(svc.invoke('agent-recover-candidate',{id,documentToken:'card-a',threshold:17}),/阈值/);
 const recovered=await svc.invoke('agent-recover-candidate',{id,documentToken:'card-a',threshold:4});assert.equal(recovered.state,'ready',recovered.message);assert.equal(recovered.alphaCleanup.clearedPixels,2);assert.equal(recovered.alphaCleanup.originalStatus,'unavailable');assert.deepEqual(await fs.readFile(path.join(jobDir,'output/result.png')),raw);
 const output=decode((await svc.invoke('agent-result',{id})).image);assert.deepEqual([...output.pixels],[21,42,63,0,31,52,73,0,41,62,83,0,51,72,93,5]);await assert.rejects(svc.invoke('agent-recover-candidate',{id,documentToken:'card-a',threshold:4}),/已结束/);
 }finally{svc.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('native complementary extraction preserves the master, geometry and global masks',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createServices}=require('../dist/electron/services.cjs'),{prepareAuthoring}=require('../dist/electron/authoring-service.cjs');
 const input=png(1,1,[80,160,220,255]);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-spatial-')),svc=createServices({runtimeDir:dir});
 try{const process=(op,args)=>svc.invoke('process',{op,args}),image=(await process('resize',{image:input,width:1024,height:1536})).image,white=(await process('image_channel',{image,channel:'white'})).image;
 const d=R.ensure({id:'test',schema:'card-atelier/1',name:'test',width:1024,height:1536,previewMode:'authored',layers:[{id:'body',kind:'foreground',name:'body',src:image,master:image,x:0,y:0,scale:1,opacity:1,visible:true,locked:false}],masks:{coverage:white},effects:{depth:1,cape:false,flow:false,background:1}});
 const result=await prepareAuthoring({document:d,documentToken:'test',commands:[{op:'splitLayer',layerId:'body',newLayerId:'rear',name:'rear cloak',role:'rear',polygon:[[0,0],[300,0],[300,1535],[0,1535]],feather:2}]},{validate:v=>{S.validate(v);return R.ensure(v);},process});
 const main=result.document.layers.find(l=>l.id==='body'),piece=result.document.layers.find(l=>l.id==='rear');assert.equal(main.master,image);assert.equal(main.splitSourceId,undefined);assert.equal(piece.splitSourceId,'body');assert.equal(piece.ownershipEncoding,'selection');assert.equal(result.document.masks.coverage,white);assert.deepEqual(result.document.foregroundMesh,d.foregroundMesh);
 const alreadyCorrect=await prepareAuthoring({document:result.document,documentToken:'test',commands:[{op:'repairSplitEdges',layerId:'rear',radius:6}]},{validate:v=>v,process});assert.equal(alreadyCorrect.document.layers.find(l=>l.id==='rear').src,piece.src);
 const mean=async im=>(await process('mask_stats',{image:(await process('image_channel',{image:im,channel:'alpha'})).image})).mean;
 assert.ok(Math.abs(await mean(main.src)+await mean(piece.src)-await mean(image))<.005);assert.ok(await mean(piece.src)>.1);assert.ok(await mean(main.src)>.5);assert.equal(d.layers.length,1);
 const second=await prepareAuthoring({document:result.document,documentToken:'test',commands:[{op:'splitLayer',layerId:'body',newLayerId:'front',name:'front arm',role:'front',part:'arm',side:'right',polygon:[[700,0],[1023,0],[1023,1535],[700,1535]],feather:2}]},{validate:v=>{S.validate(v);return R.ensure(v);},process});
 const ownedParts=await Promise.all(second.document.layers.map(l=>mean(l.src)));assert.ok(Math.abs(ownedParts.reduce((a,b)=>a+b,0)-await mean(image))<.005);assert.equal(second.document.layers.length,3);assert.equal(second.document.layers.find(l=>l.id==='front').attachment.mode,'rigid');assert.equal(second.document.layers.find(l=>l.id==='front').anatomy.part,'arm');
 }finally{svc.close();await fs.rm(dir,{recursive:true,force:true});}
});
