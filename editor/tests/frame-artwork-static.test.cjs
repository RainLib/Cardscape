const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('../renderer/frame-artwork.js'),F=require('../renderer/frame-model.js');
function surfaceFactory(){
 const canvases=[];let reads=0;
 const make=()=>{const canvas={width:0,height:0,data:null,draws:[],toDataURL(){return 'data:image/png;size='+this.width+'x'+this.height;}};canvases.push(canvas);
  const context={globalAlpha:1,globalCompositeOperation:'source-over',save(){},restore(){},translate(){},rotate(){},scale(){},drawImage(source){canvas.draws.push(source);if(source.data&&canvas.width===source.width&&canvas.height===source.height)canvas.data=new Uint8ClampedArray(source.data);},getImageData(){reads++;return {data:new Uint8ClampedArray(canvas.data||canvas.width*canvas.height*4)};},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(image){canvas.data=new Uint8ClampedArray(image.data);}};
  canvas.getContext=()=>context;return canvas;};return {make,canvases,get reads(){return reads;}};
}
function source(width=100,height=150){const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=75;data[i+1]=150;data[i+2]=245;data[i+3]=200;}return {width,height,data};}
const layer=channel=>({role:'frame-artwork',shaderChannel:channel});

test('static front and rear masks preserve source pixels and partition the same perimeter as the shader',()=>{
 const factory=surfaceFactory(),r=A.createStaticRasterizer(factory.make),image=source(),before=new Uint8ClampedArray(image.data);
 const front=r.imageForLayer(layer(3),image),rear=r.imageForLayer(layer(2),image);let frontOnly=0,rearOnly=0;
 for(let at=0;at<image.data.length;at+=4){assert.deepEqual(front.data.slice(at,at+3),before.slice(at,at+3));assert.deepEqual(rear.data.slice(at,at+3),before.slice(at,at+3));assert.equal(front.data[at+3]+rear.data[at+3],before[at+3]);if(front.data[at+3]===200)frontOnly++;if(rear.data[at+3]===200)rearOnly++;}
 const alpha=(im,x,y)=>im.data[(y*im.width+x)*4+3];assert.equal(alpha(front,50,8),0);assert.equal(alpha(rear,50,8),200);assert.equal(alpha(front,93,74),200);assert.equal(alpha(rear,93,74),0);assert.ok(frontOnly>1000&&rearOnly>1000);
 assert.deepEqual(image.data,before);assert.equal(factory.reads,1);assert.equal(r.imageForLayer({...layer(3),x:100,scale:1.8},image),front);assert.equal(r.imageForLayer(layer(1),image),image);assert.equal(r.imageForLayer({shaderChannel:3},image),image);assert.equal(factory.reads,1);
});

test('static raster cache is bounded and separates replacement images without modifying image assets',()=>{
 const factory=surfaceFactory(),r=A.createStaticRasterizer(factory.make),first=source(16,24),original=r.imageForLayer(layer(3),first);for(let i=0;i<5;i++)r.imageForLayer(layer(2),source(16,24));
 assert.equal(r.stats().entries,4);assert.ok(r.stats().bytes<=r.stats().maxBytes);assert.notEqual(r.imageForLayer(layer(3),first),original);r.clear();assert.equal(r.stats().bytes,0);
});

test('component composition and artwork preview retain rear, carrier, metal, front order with overscan',async()=>{
 const factory=surfaceFactory(),window={CardFrame:{...F,draw(ctx){ctx.drawImage({carrier:true});}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../renderer/frame-artwork.js'),'utf8'),{window,document:{createElement:factory.make}});const art=window.CardFrameArtwork,flow=source(20,30),metal=source(20,30),scene=art.value(F.defaults,{metal:'metal',flow:'flow'});let loads=0;
 await art.loadDocument({assetKind:'frame',...scene.document},async src=>{loads++;return src==='flow'?flow:metal;});assert.equal(loads,2);
 const front=art.imageForLayer(scene.document.layers[0],flow),rear=art.imageForLayer(scene.document.layers[3],flow),canvas=factory.make();assert.equal(art.draw(canvas.getContext('2d'),scene),true);
 assert.equal(canvas.draws[0],rear);assert.equal(canvas.draws[1].carrier,true);assert.equal(canvas.draws[2],metal);assert.equal(canvas.draws[3],front);
 const out=art.preview({componentScenes:{frame:scene}},factory.make);assert.equal(out.time,0);assert.deepEqual({...out.bounds},{x:-108,y:-108,width:1240,height:1752});assert.match(out.src,/1240x1752$/);assert.equal(factory.canvases.at(-1).draws[0],rear);
 scene.document.layers[0].visible=false;const hidden=factory.make();art.draw(hidden.getContext('2d'),scene);assert.equal(hidden.draws.includes(front),false);assert.equal(hidden.draws.includes(rear),true);
 assert.equal(art.preview({frameStyle:F.defaults},factory.make),null);
});

test('the independent editor uses the same masked images and respects frame asset layer order',()=>{
 const app=fs.readFileSync(require.resolve('../renderer/app.js'),'utf8'),start=app.indexOf('function drawLayer('),end=app.indexOf('function popRaster(',start),compositionStart=app.indexOf('function drawComposition('),compositionEnd=app.indexOf('function compose(',compositionStart),calls=[],masked={masked:true},raw={raw:true};
 const frame={id:'frame',kind:'frame',visible:true,opacity:1},front={id:'front',kind:'image',role:'frame-artwork',shaderChannel:3,visible:true,opacity:1},rear={...front,id:'rear',shaderChannel:2},metal={...front,id:'metal',shaderChannel:1};
 const doc={assetKind:'frame',layers:[front,metal,frame,rear]},images=new Map([[front.id,raw],[metal.id,raw],[rear.id,raw]]),factory=surfaceFactory();
 const context={doc,images,window:{CardRuntime:{placement:()=>({x:0,y:0,scale:1,rotation:0})},CardFrame:{resolve:()=>F.defaults,draw:()=>calls.push('frame')},CardFrameArtwork:{imageForLayer(l,s){assert.equal(s,raw);calls.push(l.id);return masked;},draw:()=>false},CardStats:{paintOrder:layers=>layers.slice().reverse()},CardSpatial:{background:()=>false}},registeredImage:(l,s)=>s,adjustedImage:(l,s)=>s};
 vm.createContext(context);vm.runInContext(app.slice(start,end)+app.slice(compositionStart,compositionEnd),context);const target=factory.make();context.drawComposition(target.getContext('2d'),doc,images);
 assert.deepEqual(calls,['rear','frame','metal','front']);assert.ok(target.draws.every(s=>s===masked));
});
