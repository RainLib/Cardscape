const test=require('node:test'),assert=require('node:assert/strict');
const Raster=require('../renderer/frame-raster.js'),F=require('../renderer/frame-model.js'),R=require('../renderer/runtime-model.js'),Space=require('../renderer/space-model.js');
const {framePreviewBytes}=require('../electron/card-export.cjs');
test('static raster preserves the master aperture and includes the entire outside band',()=>{
 assert.deepEqual(Raster.bounds({...F.defaults,finish:'neonnights'}),{x:-88,y:-88,width:1200,height:1712});
 assert.deepEqual(Raster.bounds({...F.defaults,finish:'distressed-copper'}),{x:0,y:0,width:1024,height:1536});
 const view=Space.sourceView({part:'frame'},[1200,1712],true);assert.deepEqual(view.plane,[0,0,1200/1024,1712/1536]);assert.deepEqual(view.rect,[0,0,1,1]);
 const cropped=Space.sourceView({part:'frame'},[1200,1712],false);assert.deepEqual(cropped.plane,[0,0,1,1]);assert.deepEqual(cropped.rect,[88/1200,88/1712,1024/1200,1536/1712]);assert.deepEqual(cropped.size,[1024,1536]);
 assert.deepEqual(Space.sourceView({part:'frame'},[1024,1536],false).plane,[0,0,1,1]);
});
test('2D and live frame shaders share every procedural function',()=>{
 const marker='// Shared procedural finish',start=R.fragment.indexOf(marker),end=R.fragment.indexOf('\nvoid ',start);
 assert.ok(Raster.fragmentSource().includes(R.fragment.slice(start,end)));assert.ok(Raster.fragmentSource().includes('rimCoverage(uv,metrics,finish)'));
});
test('neon letter plates cannot color the physical thickness walls',()=>{
 const geometry=F.geometry({...F.defaults,finish:'neonnights'}),shades=kind=>geometry[kind].weights.filter((_,i)=>i%4===2);
 assert.ok(shades('sides').every(n=>n<=.5));assert.ok(shades('rim').some(n=>n>.55));
 assert.match(R.fragment,/if\(bevelWeight>\.55\)\{vec4 sign=rimNeonSign/);
});
test('missing GPU degrades to the established canvas renderer without repeated contexts',()=>{
 let attempts=0;const service=Raster.createRenderer(()=>({addEventListener(){},getContext(){attempts++;return null;}}));
 assert.equal(service.raster(F.defaults),null);assert.equal(service.draw({},F.defaults),false);assert.equal(attempts,1);assert.equal(service.stats().renders,0);assert.equal(service.stats().error,'WebGL unavailable');
});
test('export accepts an optional bounded static frame preview with matching PNG dimensions',()=>{
 const pngBytes=s=>Buffer.from(s.slice(s.indexOf(',')+1),'base64'),png=Buffer.alloc(24);png.writeUInt32BE(1200,16);png.writeUInt32BE(1712,20);
 const preview={src:'data:image/png;base64,'+png.toString('base64'),bounds:Raster.bounds({...F.defaults,finish:'neonnights'}),time:0};
 assert.deepEqual(framePreviewBytes(preview,pngBytes),png);assert.equal(framePreviewBytes(null,pngBytes),null);
 assert.throws(()=>framePreviewBytes({...preview,time:1},pngBytes),/范围/);assert.throws(()=>framePreviewBytes({...preview,bounds:{...preview.bounds,width:100000}},pngBytes),/范围/);
 const wrong=Buffer.from(png);wrong.writeUInt32BE(1024,16);assert.throws(()=>framePreviewBytes({...preview,src:'data:image/png;base64,'+wrong.toString('base64')},pngBytes),/尺寸/);
});

test('art frame preview permits bounded transparent margins and rejects unsafe bounds',()=>{
 const png=Buffer.alloc(24),decode=s=>Buffer.from(s.split(',')[1],'base64');
 for(const pad of [0,88,108,512]){png.writeUInt32BE(1024+pad*2,16);png.writeUInt32BE(1536+pad*2,20);assert.equal(framePreviewBytes({src:'data:image/png;base64,'+png.toString('base64'),time:0,bounds:{x:-pad,y:-pad,width:1024+pad*2,height:1536+pad*2}},decode).length,24);}
 for(const pad of [-1,1.5,513,Infinity])assert.throws(()=>framePreviewBytes({src:'data:image/png;base64,',time:0,bounds:{x:-pad,y:-pad,width:1024+pad*2,height:1536+pad*2}},decode),/范围/);
});
