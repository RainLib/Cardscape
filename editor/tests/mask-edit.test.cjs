const test=require('node:test'),assert=require('node:assert/strict'),M=require('../dist/renderer/mask-edit-model.js'),S=require('../dist/renderer/spatial-model.js'),R=require('../dist/renderer/runtime-model.js');
test('texture patch copies exact changed grayscale bytes with no adjacent row bleed',()=>{const image={width:8,height:6,data:new Uint8Array(8*6*4)};for(let i=0;i<48;i++)image.data[i*4]=i;const p=M.grayPatch(image,{x:3,y:2,width:2,height:3});assert.deepEqual([...p.data],[19,20,27,28,35,36]);assert.equal(p.data.length,6);assert.deepEqual(M.union({x:1,y:2,width:3,height:4},{x:3,y:1,width:4,height:2}),{x:1,y:1,width:6,height:5});});
test('gray brush reaches exact target with hard brush, soft edge and partial strength',()=>{assert.equal(M.brush(0,128,1,.6,1),128);assert.equal(M.brush(0,255,.5,0,0),128);assert.equal(M.brush(255,0,1,1,0),255);assert.equal(M.brush(0,192,1,.8,.8),192);});
test('rotation keeps off-center pivot in place across scales and slot placement',()=>{const layer={kind:'image',x:30,y:-20,scale:1.2,rotation:90,pivot:{u:.75,v:.8},slotId:'s'},doc={slots:[{id:'s',u:.6,v:.5,scale:.8,rotation:0}]},p=R.placement(doc,layer);const x=(layer.pivot.u-.5)*1024*p.scale,y=(layer.pivot.v-.5)*1536*p.scale;const actual={x:p.x+Math.cos(p.rotation)*x-Math.sin(p.rotation)*y,y:p.y+Math.sin(p.rotation)*x+Math.cos(p.rotation)*y};assert.ok(Math.abs(actual.x-(30+102.4+x))<1e-6);assert.ok(Math.abs(actual.y-(-20+y))<1e-6);});
test('two-dimensional cloth anchors pin root and smoothly release tip',()=>{const anchor={edge:'segment',root:[200,300],tip:[600,900]};S.validateAttachment({maxOffset:.025,blendWidth:64,anchor});const weights=S.attachmentWeights([200/1024,300/1536,400/1024,600/1536,600/1024,900/1536],null,null,64,anchor);assert.deepEqual([...weights],[0,.5,1]);assert.throws(()=>S.validateAttachment({maxOffset:.025,blendWidth:64,anchor:{...anchor,tip:[201,300]}}),/16px/);});

test('packed foil/subject patches preserve armor and subject as independent bytes', () => {
 const pixels = (values) => ({width:3,height:2,data:Uint8Array.from(values.flatMap(v => [v,v,v,255]))});
 const foil = pixels([17, 23, 28, 35, 41, 48]), subject = pixels([255, 0, 40, 60, 0, 255]);
 const {data} = M.grayPatch(foil, {x:1,y:0,width:2,height:2}, subject);
 assert.deepEqual([...data], [23,0,28,40,41,0,48,255]);
 assert.deepEqual([...M.grayPatch(foil).data], [17,23,28,35,41,48]);
});
