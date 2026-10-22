const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const A=require('../dist/renderer/frame-artwork.js'),K=require('../dist/renderer/finish-catalog.js'),W=require('../dist/renderer/workshop-model.js'),R=require('../dist/renderer/runtime-model.js'),F=require('../dist/renderer/frame-model.js');
test('artwork preparation retries failure and deduplicates both complete images',async()=>{
 await assert.rejects(A.prepare(async()=>{throw Error('offline');}),/offline/);
 let decodes=0;const load=async p=>{decodes++;return 'data:image/png;base64,'+(await fs.readFile(path.join(__dirname,'../dist/renderer',p))).toString('base64');};
 const [a,b]=await Promise.all([A.prepare(load),A.prepare(load)]);assert.equal(a,b);assert.equal(decodes,2);
});
test('reference artwork is a reusable independent frame scene and other recipes remove it',()=>{
 const d=R.ensure({id:'hero',name:'Original hero',width:1024,height:1536,layers:[{id:'frame',kind:'frame',visible:true},{id:'hero',kind:'foreground',src:'original-art',visible:true},{id:'power',kind:'text',role:'stat-power',text:'7',visible:true}],masks:{}});const before=JSON.stringify([d.layers,d.masks]);
 K.apply(d,'original-frame-stellar-art');assert.equal(JSON.stringify([d.layers,d.masks]),before);R.validate(d.componentScenes.frame.document);assert.equal(F.finishes.length,25);
 const scene=d.componentScenes.frame;assert.equal(scene.document.layers[0].id,'stellar-flow');assert.equal(scene.document.layers[1].id,'stellar-metal');assert.equal(scene.document.shader.fragmentTarget,'all');assert.equal(scene.document.layers[3].id,'stellar-flow-rear');assert.equal(scene.document.layers[0].src,scene.document.layers[3].src);assert.equal(scene.document.layers[0].shaderChannel,3);assert.equal(scene.document.layers[1].shaderChannel,1);assert.equal(scene.document.layers[3].shaderChannel,2);assert.equal(scene.document.deformation.bend,0);
 const p=W.publish(W.create(d,'workshop','hero'),{kind:'frame',name:'Stellar artwork',value:W.capture(d,'frame'),id:'shared-frame'});const reopened=W.resolve(JSON.parse(JSON.stringify(W.bind(p.workshop,'frame','shared-frame',1,['hero']))));assert.deepEqual(reopened.componentScenes.frame,scene);
 K.apply(reopened,'frame-refraction-rainbow');assert.equal(reopened.componentScenes.frame,undefined);assert.equal(reopened.frameStyle.finish,'refraction');assert.equal(JSON.stringify([reopened.layers,reopened.masks]),before);
});
test('frame asset editing uses its primary layers and keeps the selected document identity',()=>{
 const d=R.ensure({id:'asset-own-id',name:'My frame',assetKind:'frame',layers:[],masks:{}});K.apply(d,'original-frame-stellar-art');assert.equal(d.id,'asset-own-id');assert.equal(d.name,'My frame');assert.equal(d.componentScenes,undefined);assert.ok(d.layers.some(l=>l.id==='stellar-metal'));R.validate(d);
});

test('portable layer shader controls validate, survive reordering and leave ordinary alpha protected',()=>{
 const d=R.ensure({layers:[{id:'light',kind:'image',shaderChannel:3,shaderTransparent:true},{id:'metal',kind:'image',shaderChannel:1}],masks:{}});R.validate(d);d.layers.reverse();R.validate(d);assert.equal(d.layers.find(l=>l.id==='light').shaderChannel,3);
 for(const channel of [-1,256,.5,NaN]){d.layers[0].shaderChannel=channel;assert.throws(()=>R.validate(d),/Shader 通道/);}d.layers[0].shaderChannel=1;d.layers[0].shaderTransparent='yes';assert.throws(()=>R.validate(d),/透明扩展/);
 const {portableBody}=require('../dist/electron/godot-export.cjs');assert.equal(portableBody(A.flowBody),A.flowBody);assert.equal(portableBody(A.flowPrelude),A.flowPrelude);assert.ok(A.flowBody.length<=4096);
});
