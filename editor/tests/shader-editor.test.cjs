const {test}=require('node:test');
const assert=require('node:assert/strict');
const language=require('../dist/renderer/shader-language.js');
const runtime=require('../dist/renderer/runtime-model.js');
const {rendererDocument}=require('../dist/electron/renderer-document.cjs');
test('GLSL suggestions match stage inputs and exclude commented local declarations',()=>{
 const geometry=language.symbols('geometry','float wave = 0.0; // vec4 ghost;\n/* float hidden; */');
 assert.ok(geometry.some(s=>s.label==='q'));assert.ok(geometry.some(s=>s.label==='wave'));
 for(const id of ['mask','color','customStrength','ghost','hidden'])assert.ok(!geometry.some(s=>s.label===id));
 const fragment=language.symbols('fragment');assert.ok(fragment.some(s=>s.label==='mask'));assert.ok(!fragment.some(s=>s.label==='q'));
 assert.deepEqual(language.memberSymbols('mask','fragment').slice(0,4).map(s=>s.detail),['运动权重','框内外权重','发光权重','流光进度']);
 assert.ok(!language.stageSnippets('geometry').some(s=>s.id==='energy-flow'));
});
test('driver diagnostics point to user lines and exclude wrapper lines',()=>{
 assert.deepEqual(language.diagnostics("ERROR: 0:3: 'bad' : undeclared identifier\nERROR: 0:1002: wrapper\nWARNING: 0:2: unused variable",5),[{line:3,message:"'bad' : undeclared identifier",severity:'error'},{line:2,message:'unused variable',severity:'warning'}]);
 assert.equal(language.diagnostics('0(4) : error C0000: syntax error',5)[0].line,4);
 for(const source of [runtime.vertex('return q;'),runtime.fragmentSource('return color;')])assert.match(source,/#line 1\nreturn (q|color);\n#line 1001/);
});
test('renderer authorizes local editor styles with a fresh nonce and keeps script CSP strict',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../dist/renderer/index.html'),'utf8');
 const first=rendererDocument(source),second=rendererDocument(source),nonce=first.match(/name="atelier-style-nonce" content="([^"]+)"/)[1];
 assert.ok(!first.includes('__ATELIER_STYLE_NONCE__'));assert.ok(first.includes("style-src 'self' 'nonce-"+nonce+"'"));
 assert.ok(first.includes("script-src 'self';"));assert.ok(!first.includes('unsafe-inline'));assert.notEqual(first,second);
});
