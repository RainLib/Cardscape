const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const U=require('../dist/renderer/preview-update-model.js'),W=require('../dist/renderer/workshop-model.js'),R=require('../dist/renderer/runtime-model.js');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const card=()=>R.ensure({id:'hero',schema:'card-atelier/1',name:'Hero',width:1024,height:1536,previewMode:'authored',layers:[{id:'person',kind:'foreground',src:png},{id:'sky',kind:'background',src:png},{id:'caption',kind:'text',text:'Title'}],masks:{motion:png,coverage:png},back:png,effects:{paused:false}});
test('binding shared frame, particles and finish needs no hero, background or Mask upload',()=>{
 let w=W.create(card(),'workshop','card');const d=W.resolve(w);
 for(const [kind,value] of [['frame',W.capture(d,'frame')],['particles',W.capture(d,'particles')],['material',W.capture(d,'material')]]){
  const pub=W.publish(w,{kind,id:kind,name:kind,value});w=W.bind(pub.workshop,kind,pub.resourceId,pub.version,['card']);
  const p=U.plan(d,W.resolve(w));assert.equal(p.compatible,true);assert.deepEqual(p.images,[]);assert.deepEqual(p.masks,[]);assert.equal(p.geometry,false);
 }
});
test('changed crop, image, deleted layer and Mask have independent update sets',()=>{
 const old=card(),next=structuredClone(old);next.layers[0].sourceWindow={x:10,y:0,width:1024,height:1536};next.layers=next.layers.filter(l=>l.id!=='sky');next.masks.motion='motion-v2';
 const p=U.plan(old,next);assert.deepEqual(p.images.map(l=>l.id),['person']);assert.deepEqual(p.removed,['background']);assert.deepEqual(p.masks,['motion']);assert.equal(p.back,false);assert.equal(p.geometry,false);
 next.foregroundMesh.positions[0]+=.02;assert.equal(U.plan(old,next).geometry,true);
 next.id='another';assert.equal(U.plan(old,next).compatible,false);
});
function harness(){
 const waits=[],surfaces=[],reports=[];let created=0,deleted=0;
 const gl=new Proxy({MAX_VERTEX_ATTRIBS:1,drawingBufferWidth:100,drawingBufferHeight:100,createProgram:()=>({}),createShader:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getParameter:()=>8,getAttribLocation:()=>0,getUniformLocation:()=>({}),deleteProgram:()=>deleted++},{get:(o,k)=>k in o?o[k]:()=>{}});
 class Image{set src(value){if(value)waits.push({src:value,im:this});}}
 const context={window:{CardPreviewUpdate:U,CardContourFieldRenderer:require('../dist/renderer/contour-field-renderer.js'),CardRuntime:R,CardFrame:{defaults:{}},CardSurfaceRenderer:{create(){created++;const s={uploads:[],removals:[],documents:[],disposed:false,setDocument(d){this.documents.push(d);},compileShader(){},beginUpdate(){},endUpdate(){},setTexture(id,im){this.uploads.push([id,im.source]);},addImage(l,im){this.uploads.push([l.id,im.source]);},setText(l,im){this.uploads.push([l.id,im.source]);},updateMask(id){this.uploads.push(['mask',id]);},removeTexture(id){this.removals.push(id);},removeMask(id){this.removals.push(id);},drawExternal(){return {triangles:2};},dispose(){this.disposed=true;}};surfaces.push(s);return s;}}},document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({})})})},Image,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(require.resolve('../dist/renderer/back-asset-renderer.js'),'utf8'),context);
 const renderer=context.window.CardBackRenderer.create(gl,()=>{},m=>reports.push(m));
 const asset=(src,revision=1)=>({document:{...card(),id:'frame',revision,layers:[{id:'rim',kind:'image',visible:true,src}],masks:{}}});
 const draw=a=>renderer.draw(a,{angle:[0,0],root:[0,0,0,1],reverse:false});
 async function finish(src,fail=false){const at=waits.findIndex(w=>w.src===src);assert.ok(at>=0);const {im}=waits.splice(at,1)[0];im.source=src;im.naturalWidth=1024;im.naturalHeight=1536;if(fail)im.onerror();else im.onload();await new Promise(resolve=>setImmediate(resolve));}
 return {renderer,surfaces,reports,waits,asset,draw,finish,get created(){return created;},get deleted(){return deleted;}};
}
test('component revisions reuse the surface; delayed replacement preserves its last complete scene',async()=>{
 const h=harness(),first=h.asset('first');assert.equal(h.draw(first).loaded,false);await h.finish('first');assert.equal(h.draw(first).loaded,true);
 const unchanged=h.asset('first',2);assert.equal(h.draw(unchanged).updates,1);assert.equal(h.waits.length,0);
 const second=h.asset('first',2);second.document.layers[0].x=50;assert.equal(h.draw(second).loaded,true);assert.equal(h.created,1);assert.equal(h.surfaces[0].uploads.length,1);assert.equal(h.waits.length,0);
 const next=h.asset('new',3);assert.equal(h.draw(next).loaded,true);assert.equal(h.surfaces[0].disposed,false);assert.equal(h.surfaces[0].documents.at(-1).revision,2);
 await h.finish('new');assert.equal(h.draw(next).loaded,true);assert.equal(h.created,1);assert.equal(h.surfaces[0].uploads.length,2);assert.equal(h.surfaces[0].documents.at(-1).revision,3);
 h.renderer.dispose();assert.equal(h.surfaces[0].disposed,true);
});
test('obsolete or failed component decodes cannot overwrite the latest complete scene',async()=>{
 const h=harness(),first=h.asset('first');h.draw(first);await h.finish('first');
 const slow=h.asset('slow',2),latest=h.asset('latest',3);h.draw(slow);h.draw(latest);await h.finish('latest');await h.finish('slow');assert.equal(h.surfaces[0].documents.at(-1).revision,3);assert.deepEqual(h.surfaces[0].uploads,[['rim','first'],['rim','latest']]);
 const broken=h.asset('broken',4);h.draw(broken);await h.finish('broken',true);assert.equal(h.draw(broken).loaded,true);assert.equal(h.draw(broken).error,true);assert.equal(h.created,1);assert.equal(h.surfaces[0].documents.at(-1).revision,3);assert.equal(h.reports.length,1);
 h.renderer.dispose();
});
test('exported WebGL player includes every script needed for incremental component rendering',async()=>{
 const fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{exportRuntime}=require('../dist/electron/runtime-export.cjs');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'cardscape-preview-export-'));
 try{
  await exportRuntime(dir,card());const html=await fsp.readFile(path.join(dir,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
  for(const name of scripts)assert.ok((await fsp.stat(path.join(dir,name))).size>0,name);
  assert.ok(scripts.indexOf('preview-update-model.js')<scripts.indexOf('back-asset-renderer.js'));
  assert.equal(await fsp.readFile(path.join(dir,'preview-update-model.js'),'utf8'),fs.readFileSync(require.resolve('../dist/renderer/preview-update-model.js'),'utf8'));
 }finally{await fsp.rm(dir,{recursive:true,force:true});}
});
