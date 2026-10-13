/* Static 2D artwork uses the live renderer's procedural rim, including its outer band. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./frame-model.js'):root.CardFrame,typeof module==='object'&&module.exports?require('./runtime-model.js'):root.CardRuntime);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardFrameRaster=api;})(typeof window==='object'?window:this,(F,R)=>{
'use strict';
const MAX_ENTRIES=4,MAX_BYTES=34*1024*1024;
function bounds(style){const pad=F.hasAura(style)?F.auraPadding(style):0;return {x:pad?-pad:0,y:pad?-pad:0,width:1024+pad*2,height:1536+pad*2};}
function fragmentSource(){const start=R.fragment.indexOf('// Shared procedural finish'),end=R.fragment.indexOf('\nvoid ',start);if(start<0||end<0)throw Error('Missing shared rim shader');return `precision highp float;
varying vec2 masterUV;uniform vec3 low,hi;uniform vec4 metrics;uniform vec2 animation;uniform float finish;
${R.fragment.slice(start,end)}
void main(){vec2 uv=masterUV,p=uv*vec2(1.,1.5);float distance=rimDistance(p,metrics.y);
 if(distance>metrics.x){gl_FragColor=rimAura(low,hi,uv,vec2(0.),0.,metrics,finish,animation);return;}
 if(distance<0.){gl_FragColor=rimAura(low,hi,uv,vec2(0.),0.,metrics,finish,animation);return;}
 float bevel=min(metrics.w,metrics.x*.4),shade=1.;
 if(bevel>0.){shade=distance<bevel?mix(.3,1.,distance/bevel):distance>metrics.x-bevel?mix(1.,.3,(distance-metrics.x+bevel)/bevel):.75;}
 vec4 body=vec4(rimColor(low,hi,uv,vec2(0.),0.,metrics,finish,animation,shade),rimCoverage(uv,metrics,finish));
 gl_FragColor=body;
}`;}
const vertex='attribute vec2 point;uniform vec4 extent;varying vec2 masterUV;void main(){masterUV=(extent.xy+vec2((point.x+1.)*.5,(1.-point.y)*.5)*extent.zw)/vec2(1024.,1536.);gl_Position=vec4(point,0.,1.);}';
function createRenderer(makeCanvas=()=>document.createElement('canvas')){
 let surface=null,gl=null,program=null,buffer=null,uniforms=null,error=null,renders=0,hits=0,bytes=0;const cache=new Map();
 function reset(){cache.clear();bytes=0;if(gl&&!gl.isContextLost()){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);}buffer=program=uniforms=null;}
 function initialize(){
  if(gl&&program&&!gl.isContextLost())return true;
  if(!surface){surface=makeCanvas();surface.addEventListener?.('webglcontextlost',e=>{e.preventDefault();reset();});surface.addEventListener?.('webglcontextrestored',()=>{error=null;reset();});}
  if(!gl){gl=surface.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false});if(!gl){error='WebGL unavailable';return false;}}
  if(gl.isContextLost())return false;
  const shaders=[];try{
   program=gl.createProgram();for(const [type,code] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragmentSource()]]){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);}
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
   uniforms=Object.fromEntries(['extent','low','hi','metrics','animation','finish'].map(name=>[name,gl.getUniformLocation(program,name)]));error=null;return true;
  }catch(e){error=e.message;reset();return false;}finally{for(const shader of shaders)gl.deleteShader(shader);}
 }
 function raster(input){
  const style=F.resolve({frameStyle:input}),key=JSON.stringify([style.width,style.corner,style.depth,style.bevel,style.color,style.accent,style.finish,style.animation,style.animationSpeed]);
  if(cache.has(key)){const entry=cache.get(key);cache.delete(key);cache.set(key,entry);hits++;return entry;}
  if(error||!initialize())return null;const rect=bounds(style);surface.width=rect.width;surface.height=rect.height;
  gl.viewport(0,0,rect.width,rect.height);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const at=gl.getAttribLocation(program,'point');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
  gl.uniform4f(uniforms.extent,rect.x,rect.y,rect.width,rect.height);gl.uniform3fv(uniforms.low,F.rgb(style.color));gl.uniform3fv(uniforms.hi,F.rgb(style.accent));gl.uniform4fv(uniforms.metrics,[style.width,style.corner,style.depth,style.bevel].map(n=>n/1024));gl.uniform2f(uniforms.animation,F.animations.indexOf(style.animation),style.animationSpeed);gl.uniform1f(uniforms.finish,F.finishes.indexOf(style.finish));gl.drawArrays(gl.TRIANGLES,0,6);
  const code=gl.getError();if(code){error='Frame raster WebGL error '+code;reset();return null;}
  const canvas=makeCanvas();canvas.width=rect.width;canvas.height=rect.height;canvas.getContext('2d').drawImage(surface,0,0);renders++;
  const entry={canvas,bounds:rect},size=rect.width*rect.height*4;while(cache.size>=MAX_ENTRIES||bytes+size>MAX_BYTES){const old=cache.keys().next().value,value=cache.get(old);bytes-=value.bounds.width*value.bounds.height*4;cache.delete(old);}cache.set(key,entry);bytes+=size;return entry;
 }
 function draw(ctx,style){const entry=raster(style);if(!entry)return false;ctx.drawImage(entry.canvas,entry.bounds.x,entry.bounds.y);return true;}
 function fit(ctx,style,width,height){const entry=raster(style);if(!entry)return false;const scale=Math.min(width/entry.bounds.width,height/entry.bounds.height);ctx.drawImage(entry.canvas,(width-entry.bounds.width*scale)/2,(height-entry.bounds.height*scale)/2,entry.bounds.width*scale,entry.bounds.height*scale);return true;}
 function preview(style){const entry=raster(style);return entry?{src:entry.canvas.toDataURL('image/png'),bounds:{...entry.bounds},time:0}:null;}
 function stats(){return {entries:cache.size,bytes,renders,hits,contexts:gl?1:0,error,maxEntries:MAX_ENTRIES,maxBytes:MAX_BYTES};}
 return {raster,draw,fit,preview,stats,clear:reset};
}
let singleton=null;const service=()=>singleton||(singleton=createRenderer());
return {bounds,fragmentSource,vertex,createRenderer,draw:(...args)=>service().draw(...args),fit:(...args)=>service().fit(...args),raster:(...args)=>service().raster(...args),preview:(...args)=>service().preview(...args),stats:()=>service().stats()};
});
