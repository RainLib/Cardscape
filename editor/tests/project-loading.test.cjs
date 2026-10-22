const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./fixtures/character-animation.cjs');
// Run the real open preflight to the shader boundary. A decode failure must not
// replace the current project; GPU/UI setup after that boundary is browser QA.
async function preflight(document){
 const decoded=[],fallback='data:image/png;base64,neutral',boundary=Error('shader boundary');
 const context={document:null,loading:false,tool:'move',taskToken:0,busy:false,doc:null,
  say(){},registerFont:async()=>{},canvasFor:()=>({getContext:()=>({fillRect(){}}),toDataURL:()=>fallback}),
  imageFrom:async src=>{assert.equal(typeof src,'string');decoded.push(src);return {naturalWidth:1024,naturalHeight:1536};},
  maskNames:Object.fromEntries(Object.keys(document.masks).map(k=>[k,k])),
  window:{CardDocumentAssets:require('../dist/renderer/core/document-assets.js'),atelierHome:{progress(){},paint:async()=>{}},CardStats:{loadThemes:async()=>{}},CardFrameArtwork:{loadDocument:async()=>{}},CardRuntime:{defaults:{shader:{}}},cardPreview:{compileShader(){throw boundary;}}}
 };
 context.window.CardMaskAssets={maskNames:context.maskNames};context.window.CardImageAssets={canvasFor:context.canvasFor};
 vm.createContext(context);const source=fs.readFileSync(require.resolve('../dist/renderer/app.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('async function loadDocument('),source.indexOf('async function updateDocument(')),context);
 await assert.rejects(context.loadDocument(document),error=>error===boundary);assert.equal(context.doc,null);return {decoded,fallback};
}
test('valid portable real-art projects without back art reach the shader preflight',async()=>{
 const doc=fixture();delete doc.back;const before=structuredClone(doc),result=await preflight(doc);
 assert.ok(result.decoded.includes(result.fallback));assert.deepEqual(doc,before);
});
test('opening preserves an authored back scene source instead of replacing it with neutral art',async()=>{
 const doc=fixture();delete doc.back;doc.backScene={src:'data:image/png;base64,authored-back'};
 const result=await preflight(doc);assert.ok(result.decoded.includes(doc.backScene.src));assert.ok(!result.decoded.includes(result.fallback));
});
