const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../renderer/runtime-model.js'),F=require('../renderer/frame-model.js'),B=require('../renderer/particle-batch.js'),M=require('../renderer/mask-edit-model.js');

function harness(){
 const uploads=[],patches=[],deleted=[],created=[];let bound=null,nextId=0;
 const gl=new Proxy({MAX_VERTEX_ATTRIBS:1,TEXTURE_2D:2,TEXTURE0:3,LUMINANCE:4,RGBA:5,UNSIGNED_BYTE:6,
  createTexture(){const texture={id:++nextId};created.push(texture);return texture;},bindTexture(target,texture){bound=texture;},
  texImage2D(...args){uploads.push({texture:bound,args});},texSubImage2D(...args){patches.push({texture:bound,args});},deleteTexture(texture){deleted.push(texture);},
  createProgram:()=>({}),createShader:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getParameter:()=>8,getAttribLocation:()=>0,getUniformLocation:()=>({})
 },{get:(target,key)=>key in target?target[key]:()=>{}});
 class HTMLImageElement{constructor(src){this.src=src;this.currentSrc=src;this.naturalWidth=16;this.naturalHeight=24;}}
 const makeCanvas=()=>({dataset:{},width:16,height:24,setAttribute(){},getContext:type=>type==='webgl'?null:{fillRect(){}}});
 const window={CardRuntime:R,CardFrame:F,CardParticleBatch:B,CardMaskEdit:M,CardSpatial:{},dispatchEvent(){}},document={createElement:makeCanvas,getElementById:()=>({after(){}})};
 vm.runInNewContext(fs.readFileSync(require.resolve('../renderer/author-preview.js'),'utf8'),{window,document,HTMLImageElement});
 const canvas=makeCanvas(),renderer=window.CardSurfaceRenderer.create({canvas,gl,embedded:true,legacy:{addImage(){},updateMask(){}}});
 const add=(id,image)=>renderer.addImage({id,kind:'image'},image),image=src=>new HTMLImageElement(src);
 return {renderer,canvas,uploads,patches,deleted,created,add,image,makeCanvas,last:()=>uploads.at(-1).texture};
}

test('two layers share one immutable decoded image without duplicate GPU uploads',()=>{
 const h=harness(),flow=h.image('flow.png');h.add('front',flow);const shared=h.last(),count=h.uploads.length;
 h.add('rear',flow);h.add('front',flow);assert.equal(h.uploads.length,count);assert.equal(Number(h.canvas.dataset.resourceTextures),count);
 h.renderer.removeTexture('front');assert.ok(!h.deleted.includes(shared));
 h.add('third',flow);assert.equal(h.uploads.length,count);h.renderer.removeTexture('rear');assert.ok(!h.deleted.includes(shared));
 h.renderer.removeTexture('third');assert.equal(h.deleted.filter(t=>t===shared).length,1);
 // A new decode can contain new pixels even when its URL is unchanged.
 h.add('one',h.image('flow.png'));h.add('two',h.image('flow.png'));assert.equal(h.uploads.length,count+2);h.renderer.dispose();
});

test('replacing one shared layer or changing an image source preserves the other layer',()=>{
 const h=harness(),flow=h.image('flow.png');h.add('front',flow);const shared=h.last();h.add('rear',flow);
 h.add('front',h.image('replacement.png'));const replacement=h.last();assert.notEqual(replacement,shared);assert.ok(!h.deleted.includes(shared));
 h.add('front',flow);assert.equal(h.uploads.length,3);assert.equal(h.deleted.filter(t=>t===replacement).length,1);
 flow.src=flow.currentSrc='flow-v2.png';h.add('front',flow);const changed=h.last();assert.notEqual(changed,shared);assert.ok(!h.deleted.includes(shared));
 h.add('rear',flow);assert.equal(h.last(),changed);assert.equal(h.uploads.length,4);assert.equal(h.deleted.filter(t=>t===shared).length,1);
 h.renderer.dispose();assert.equal(h.deleted.filter(t=>t===changed).length,1);
});

test('writable canvas and ImageData uploads detach from shared artwork and never share',()=>{
 const h=harness(),flow=h.image('flow.png');h.add('front',flow);const shared=h.last();h.add('rear',flow);
 const canvas=h.makeCanvas();h.add('front',canvas);const writable=h.last();assert.notEqual(writable,shared);assert.ok(!h.deleted.includes(shared));
 const count=h.uploads.length;h.add('front',canvas);assert.equal(h.last(),writable);assert.equal(h.uploads.length,count+1);
 h.add('other-canvas',canvas);assert.notEqual(h.last(),writable);
 const pixels={width:2,height:2,data:new Uint8ClampedArray(16)};h.add('front',pixels);h.add('other-pixels',pixels);assert.notEqual(h.last(),writable);
 h.renderer.removeTexture('front');assert.ok(!h.deleted.includes(shared));h.renderer.dispose();assert.equal(h.deleted.filter(t=>t===shared).length,1);
});

test('mutable masks retain independent luminance textures and patch the selected target only',()=>{
 const h=harness(),pixels={width:2,height:2,data:new Uint8ClampedArray(16).fill(255)};
 h.renderer.updateMask('emission',pixels);const emission=h.last();h.renderer.updateMask('phase',pixels);const phase=h.last();assert.notEqual(emission,phase);
 pixels.data[0]=0;h.renderer.updateMask('emission',pixels,{x:0,y:0,width:1,height:1});assert.equal(h.patches.length,1);assert.equal(h.patches[0].texture,emission);assert.equal(h.patches[0].args[6],4);
 assert.equal(h.canvas.dataset.maskTextureFormat,'LUMINANCE8');assert.equal(h.canvas.dataset.maskUploadMode,'patch');
 const image=h.image('mask.png');h.renderer.setTexture('mask-foil',image);const foil=h.last();h.renderer.setTexture('custom-mask',image);const custom=h.last();h.renderer.setTexture('region-mask',image);assert.notEqual(foil,custom);assert.notEqual(custom,h.last());
 h.renderer.removeTexture('mask-emission');assert.ok(!h.deleted.includes(phase));h.renderer.dispose();
});

test('reset and repeated disposal delete each physical texture once and clear sharing entries',()=>{
 const h=harness(),flow=h.image('flow.png');h.add('front',flow);const shared=h.last();h.add('rear',flow);const old=[...h.created];
 h.renderer.resetAssets();for(const tex of old)assert.equal(h.deleted.filter(t=>t===tex).length,1);
 h.add('front',flow);const fresh=h.last();assert.notEqual(fresh,shared);const count=h.uploads.length;h.add('rear',flow);assert.equal(h.uploads.length,count);
 h.renderer.dispose();const deletes=h.deleted.length;h.renderer.dispose();assert.equal(h.deleted.length,deletes);for(const tex of h.created)assert.equal(h.deleted.filter(t=>t===tex).length,1);
});
