const {test}=require('node:test'),assert=require('node:assert/strict');
const {documentBytes,ownDocumentBytes,ownDocumentBudget,validateProject}=require('../dist/electron/services.cjs');
const R=require('../dist/renderer/runtime-model.js');
const image='data:image/png;base64,';
function document(src){return R.ensure({schema:'card-atelier/1',name:'分层卡背',width:1024,height:1536,layers:[{id:'figure',name:'人物',kind:'foreground',x:0,y:0,scale:1,opacity:1,visible:true,locked:false,src,master:src}],masks:{motion:src},back:src,effects:{}});}
test('independent linked reverse preserves the full front layer budget and both assets',()=>{
 const B=require('../dist/renderer/back-asset-model.js'),front=image+'A'.repeat(40*1024*1024),back=image+'B'.repeat(28*1024*1024),doc=document(front);doc.backScene=B.create(back);doc.back=back;const originalFront=doc.layers[0].src;
 assert.ok(documentBytes(doc)>64*1024*1024);assert.ok(ownDocumentBytes(doc)<64*1024*1024);assert.equal(validateProject(doc),doc);assert.equal(doc.layers[0].src,originalFront);assert.equal(doc.backScene.src,back);assert.equal(doc.back,back);
});
test('separate scene budgets still reject oversized front or component and hidden nesting',()=>{
 const B=require('../dist/renderer/back-asset-model.js'),C=require('../dist/renderer/component-model.js'),small=image+'AAAA';const doc=document(small);doc.backScene=B.create(image+'B'.repeat(65*1024*1024));doc.back=doc.backScene.src;assert.throws(()=>validateProject(doc),/组件.*64 MB/);
 doc.backScene=B.create(small);doc.back=small;doc.layers[0].src=image+'A'.repeat(65*1024*1024);assert.throws(()=>validateProject(doc),/工程去重后超过 64 MB/);
 const source=document(small);source.material=C.material({document:document(small)});const nested=document(small);nested.material=C.material({document:source});assert.throws(()=>validateProject(nested),/不能嵌套/);
});
test('legacy reverse preview is counted with its independent scene even when their images differ',()=>{
 const B=require('../dist/renderer/back-asset-model.js'),small=image+'AAAA',doc=document(small);doc.backScene=B.create(small);doc.back=image+'B'.repeat(65*1024*1024);
 assert.ok(ownDocumentBytes(doc)<64*1024*1024);assert.throws(()=>validateProject(doc),/组件.*64 MB/);
 doc.back=image+'C'.repeat(28*1024*1024);assert.equal(validateProject(doc),doc);assert.equal(doc.backScene.src,small);
});
test('shared embedded pixels count once while metadata uses UTF-8 bytes',()=>{
 const src=image+'AAAA',doc={name:'卡背',src,layer:{src}},bytes=documentBytes(doc);
 assert.ok(bytes<documentBytes({...doc,layer:{src:image+'AAAB'}}));
 assert.ok(documentBytes({name:'卡背'})>documentBytes({name:'ab'}));
 assert.equal(bytes,documentBytes(JSON.parse(JSON.stringify(doc))));
});
test('a repeated poster/layer/source remains valid but distinct oversized assets do not',()=>{
 const src=image+'A'.repeat(18*1024*1024),doc=document(src);
 assert.ok(JSON.stringify(doc).length>64*1024*1024);
 assert.ok(documentBytes(doc)<64*1024*1024);
 assert.equal(validateProject(doc),doc);
 const unique=structuredClone(doc);
 unique.layers[0].master=image+'B'.repeat(18*1024*1024);
 unique.masks.motion=image+'C'.repeat(18*1024*1024);
 unique.back=image+'D'.repeat(18*1024*1024);
 unique.masks.depth=image+'E'.repeat(18*1024*1024);
 assert.throws(()=>validateProject(unique),/去重后超过 64 MB/);
});
test('retained anatomical originals have a bounded source budget separate from runtime pixels',()=>{
 const src=image+'A'.repeat(40*1024*1024),original=image+'B'.repeat(28*1024*1024),doc=document(src);
 doc.layers[0].master=original;doc.layers[0].underpaint={original,originalMaster:original};doc.layers[0].splitEdgeOriginal=original;
 const sizes=ownDocumentBudget(doc);
 assert.ok(ownDocumentBytes(doc)>64*1024*1024);assert.ok(sizes.renderBytes<64*1024*1024);assert.ok(sizes.sourceBytes<64*1024*1024);
 assert.equal(validateProject(doc),doc);assert.equal(doc.layers[0].master,original);assert.equal(doc.layers[0].underpaint.original,original);
 const shared=document(src);assert.ok(ownDocumentBudget(shared).sourceBytes<1024);
});
test('source limits and unknown render references cannot be hidden in the source budget',()=>{
 const small=image+'AAAA',large=image+'B'.repeat(65*1024*1024),doc=document(small);doc.layers[0].master=large;
 assert.throws(()=>validateProject(doc),/编辑源素材.*64 MB/);
 doc.layers[0].master=small;doc.layers[0].underpaint={supportMask:large};assert.throws(()=>validateProject(doc),/工程去重后超过 64 MB/);
 doc.layers[0].underpaint={original:large};doc.unknownImage=large;assert.throws(()=>validateProject(doc),/工程去重后超过 64 MB/);
});
