import contourFields from './contour-field-renderer.ts';
import importedCardRuntime from './runtime-model.ts';
import importedCardPreviewUpdate from './preview-update-model.ts';
import importedCardFrame from '../editing/frame-model.ts';
import importedCardBack from '../workshop/back-asset-model.ts';
import importedCardComponents from '../workshop/component-model.ts';
/* The editor, flipped card and exported WebGL player share this rigid reverse scene. */
export const moduleApi=(() => {
'use strict';
const vertex=`attribute vec3 p;attribute vec2 uv;uniform vec2 angle;uniform vec4 root,placement;uniform float aspect,camera;varying vec2 v;varying vec3 local;
void main(){v=uv;vec3 q=vec3(-p.x*placement.w+placement.x,p.y*placement.w+placement.y,placement.z);local=q;float c=cos(angle.x),s=sin(angle.x);q=vec3(c*q.x+s*q.z,q.y,-s*q.x+c*q.z);c=cos(angle.y);s=sin(angle.y);q=vec3(q.x,c*q.y-s*q.z,s*q.y+c*q.z);q=q*root.w+root.xyz;float fit=min(1.,aspect/.85);gl_Position=vec4(q.x*2.9*fit/aspect,q.y*2.9*fit,-q.z*.3,max(.15,camera-q.z));}`;
const fragment=()=>`precision highp float;uniform sampler2D tex;uniform vec3 eye,color,accent;uniform vec4 metrics,adjustment,material;uniform vec2 angle;uniform float plane,t,opacity,rootOpacity,selected;varying vec2 v;varying vec3 local;
${importedCardRuntime.contourGLSL}
void main(){float den=local.z-eye.z;vec2 at=eye.xy+(local.xy-eye.xy)*(plane-eye.z)/(abs(den)<.00001?-.00001:den);vec2 a=abs(at),edge=vec2(.5,.75)-metrics.x;float cut=max(0.,metrics.y-(2.-sqrt(2.))*metrics.x);if(contourCounts.y>.5){if(contourAt(at).x<.5)discard;}else if(any(greaterThan(a,edge))||a.x+a.y>edge.x+edge.y-cut+.000001)discard;vec4 c=texture2D(tex,v);if(c.a<.015)discard;c.rgb=pow(clamp((c.rgb-.5)*adjustment.y+.5+adjustment.x,0.,1.),vec3(1./adjustment.w));float y=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=clamp(mix(vec3(y),c.rgb,adjustment.z),0.,1.);float bands=.5+.5*sin((v.x+v.y*(material.w>.5?2.:.7))*material.z*6.283+angle.x*3.+angle.y*2.+t*material.y);float shine=material.w>.5?pow(bands,5.):.35+.65*bands;c.rgb=mix(c.rgb,clamp(c.rgb+mix(color,accent,bands)*shine,0.,1.),material.x);if(selected>.5)c.rgb=mix(c.rgb,vec3(.2,.8,1.),.18);gl_FragColor=vec4(c.rgb,c.a*opacity*rootOpacity);}`;
function create(gl,invalidate=()=>{},report=(_message: string)=>{}){
 const contourFieldRenderer=contourFields.create(gl);
 const program=gl.createProgram();for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment()]] as const){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);gl.deleteShader(s);}gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const names=['angle','root','placement','aspect','camera','tex','eye','metrics','adjustment','material','color','accent','plane','t','opacity','rootOpacity','selected','contourCounts','contourEdges[0]','contourTexture','contourField','contourFieldInfo'],u=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(program,n)]));const pos=gl.getAttribLocation(program,'p'),uv=gl.getAttribLocation(program,'uv'),buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,.75,0,0,0,-.5,-.75,0,0,1,.5,.75,0,1,0,.5,.75,0,1,0,-.5,-.75,0,0,1,.5,-.75,0,1,1]),gl.STATIC_DRAW);
 const cache=new Map<any, any>();let disposed=false,activeSources=new Set<any>(),surface=null,surfaceAsset=null,surfaceReady=false,surfaceError=null,surfaceGeneration=0,surfaceDocument=null,pendingAsset=null,surfaceInstances=0,surfaceUpdates=0;const maxAttributes=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
 function texture(src){let entry=cache.get(src);if(entry)return entry;entry={texture:null,error:null};cache.set(src,entry);const image=new Image();image.onload=()=>{if(disposed||cache.get(src)!==entry)return;if(image.naturalWidth>8192||image.naturalHeight>8192||image.naturalWidth*image.naturalHeight>16*1024*1024){entry.error='卡背图像超过 16 MP / 8192 px 上限';report(entry.error);invalidate();return;}const tex=gl.createTexture();entry.texture=tex;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);for(const [name,value] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]] as const)gl.texParameteri(gl.TEXTURE_2D,name,value);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);invalidate();};image.onerror=()=>{if(disposed||cache.get(src)!==entry)return;entry.error='卡背图层图像无法解码';report(entry.error);invalidate();};image.src=src;return entry;}
 function authored(asset,options){
  const d=asset.document;
  if(surfaceAsset!==asset&&pendingAsset!==asset){
   pendingAsset=asset;surfaceError=null;const generation=++surfaceGeneration;
   if(!surface){const canvas=document.createElement('canvas');surface=window.CardSurfaceRenderer.create({canvas,gl,embedded:true});surfaceInstances++;}const target=surface;
   const prepared={...d,layers:d.layers.filter(l=>!l.previewReference).map(l=>{const variant=l.titleArt?.variants.find(v=>v.locale===d.locale)||l.titleArt?.variants[0];return {...l,src:l.kind==='text'?(asset.titleRasters?.[l.id]?.[variant?.locale]||asset.layerRasters?.[l.id]||variant?.src):l.src};}),masks:{...d.masks},effects:{...d.effects},previewMode:'authored'};
   delete prepared.backScene;delete prepared.componentScenes;
   prepared.foregroundMesh||=surfaceDocument?.foregroundMesh||importedCardRuntime.grid();
   const changes=importedCardPreviewUpdate.plan(surfaceDocument,prepared);if(!changes.geometry)prepared.foregroundMesh=surfaceDocument.foregroundMesh;
   if(surfaceDocument&&importedCardPreviewUpdate.equal({...surfaceDocument,revision:prepared.revision},prepared)){surfaceAsset=asset;pendingAsset=null;}else{
   const decoded=new Map<any, any>(),requests=new Map<any, any>();for(const l of changes.images)requests.set(l.src,false);for(const id of changes.masks)requests.set(prepared.masks[id],true);
   const decode=(src,mask)=>window.cardEditorHost?.loadImage?window.cardEditorHost.loadImage(src).then(im=>{if(im.naturalWidth>8192||im.naturalHeight>8192||im.naturalWidth*im.naturalHeight>16*1024*1024)throw Error('组件图像超过尺寸上限');if(mask&&(im.naturalWidth!==1024||im.naturalHeight!==1536))throw Error('组件 Mask 与母版尺寸不一致');return im;}):new Promise((resolve: any,reject: any)=>{const im=new Image(),timer=setTimeout(()=>{im.onload=im.onerror=null;im.src='';reject(Error('组件图像解码超时'));},15000);im.onload=()=>{clearTimeout(timer);if(im.naturalWidth>8192||im.naturalHeight>8192||im.naturalWidth*im.naturalHeight>16*1024*1024)reject(Error('组件图像超过尺寸上限'));else if(mask&&(im.naturalWidth!==1024||im.naturalHeight!==1536))reject(Error('组件 Mask 与母版尺寸不一致'));else resolve(im);};im.onerror=()=>{clearTimeout(timer);reject(Error('组件图像无法解码'));};im.src=src;});
   const registered=(l,im)=>{if(!l.sourceWindow||l.kind==='background'||l.role==='background-candidate')return im;const r=l.sourceWindow,c=document.createElement('canvas');c.width=1024;c.height=1536;c.getContext('2d').drawImage(im,r.x,r.y,r.width,r.height,0,0,1024,1536);return c;};
   const commit=()=>{
    if(disposed||generation!==surfaceGeneration)return;
    target.compileShader(prepared.shader);target.beginUpdate();
    try{
     target.setDocument(prepared);
     for(const id of changes.removed)target.removeTexture(id);
     for(const id of changes.removedMasks)target.removeMask(id);
     for(const l of changes.images){const im=registered(l,decoded.get(l.src));if(l.kind==='foreground')target.setTexture('pop_foreground',im);else if(l.kind==='background')target.setTexture('snap_background',im);else if(l.kind==='text')target.setText(l,im);else if(l.kind==='image')target.addImage(l,im);}
     for(const id of changes.masks){const c=document.createElement('canvas');c.width=1024;c.height=1536;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(decoded.get(prepared.masks[id]),0,0,1024,1536);target.updateMask(id,ctx.getImageData(0,0,1024,1536));}
     surfaceDocument=prepared;surfaceAsset=asset;pendingAsset=null;surfaceReady=true;surfaceUpdates++;
    }finally{target.endUpdate();}
    invalidate();
   };
   const fail=error=>{if(disposed||generation!==surfaceGeneration)return;surfaceError=error.message;surfaceAsset=asset;pendingAsset=null;report(surfaceError);invalidate();};
   // Keep the last complete scene visible until all changed sources are ready.
   if(requests.size)Promise.all([...requests].map(async([src,mask]: any)=>decoded.set(src,await decode(src,mask)))).then(commit).catch(fail);
   else try{commit();}catch(error){fail(error);}
   }
  }
  if(!surfaceReady)return {count:0,loaded:false,error:!!surfaceError,triangles:0,instances:surfaceInstances,updates:surfaceUpdates};
  const reverse=options.reverse!==false,angle=[options.angle[0]+(reverse?Math.PI:0),options.angle[1]],root=[...options.root];
  const plane=reverse?options.plane:0;root[0]+=Math.sin(options.angle[0])*plane*root[3];root[1]-=Math.sin(options.angle[1])*Math.cos(options.angle[0])*plane*root[3];root[2]+=Math.cos(options.angle[1])*Math.cos(options.angle[0])*plane*root[3];
  const result=surface.drawExternal({...options,angle,root,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight});return {...result,count:surfaceAsset.document.layers.filter(l=>l.visible).length,loaded:true,error:!!surfaceError,ownFrame:true,pending:!!pendingAsset,instances:surfaceInstances,updates:surfaceUpdates};
 }
 function draw(asset,{angle=[Math.PI,0],root=[0,0,0,1],aspect=1,camera=2.7,eye=[0,0,-2.7],plane=0,style=importedCardFrame.defaults,time=0,particleRevealTime=time,effects=true,selected='',reverse=true,emitterContext=null,particleConfig=null,cosmicFront=false,detail=null}: any={}){
  if(asset?.document)return authored(asset,{angle,root,aspect,camera,eye,plane,style,time,particleRevealTime,effects,selected,reverse,emitterContext,particleConfig,cosmicFront,detail});
  if(surface){surfaceGeneration++;surface.dispose();surface=null;surfaceReady=false;surfaceDocument=null;surfaceAsset=null;pendingAsset=null;}
  const layers=importedCardBack.layers(asset).filter(l=>l.visible);activeSources=new Set<any>(layers.map(l=>l.src));for(const src of activeSources)texture(src);for(const [src,e] of cache)if(cache.size>16&&!activeSources.has(src)){if(e.texture)gl.deleteTexture(e.texture);cache.delete(src);}
  gl.useProgram(program);for(let i=0;i<maxAttributes;i++)gl.disableVertexAttribArray(i);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,20,12);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.tex,0);gl.uniform2fv(u.angle,angle);gl.uniform4fv(u.root,root.slice(0,4));gl.uniform1f(u.aspect,aspect);gl.uniform1f(u.camera,camera);gl.uniform3fv(u.eye,eye);gl.uniform1f(u.plane,plane);gl.uniform4f(u.metrics,style.width/1024,style.corner/1024,0,0);gl.uniform1f(u.t,time);gl.uniform1f(u.rootOpacity,root[4]??1);
  contourFieldRenderer.bind(style,u);const shape=importedCardFrame.contourUniforms(style);gl.uniform2fv(u.contourCounts,shape.counts);if(style.contour)gl.uniform4fv(u['contourEdges[0]'],shape.edges);
  const adj=asset?.adjustments||{},mat=importedCardComponents.material(asset?.material);gl.uniform4f(u.adjustment,(adj.brightness||0)/100,1+(adj.contrast||0)/100,(adj.saturation??100)/100,adj.gamma??1);gl.uniform4f(u.material,effects&&detail?.materials!==false&&mat.enabled?mat.strength:0,mat.speed,mat.frequency,mat.style==='holographic'?1:0);gl.uniform3fv(u.color,importedCardFrame.rgb(mat.color));gl.uniform3fv(u.accent,importedCardFrame.rgb(mat.accent));let count=0;
  for(const layer of layers){const entry=cache.get(layer.src);if(!entry?.texture)continue;const placement=importedCardBack.placement(layer,asset,plane,camera);gl.uniform4f(u.placement,placement.x,placement.y,placement.z,placement.scale);gl.uniform1f(u.opacity,layer.opacity);gl.uniform1f(u.selected,layer.id===selected?1:0);gl.blendFunc(gl.SRC_ALPHA,layer.blend==='add'?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.drawArrays(gl.TRIANGLES,0,6);count++;}
  gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);return {count,loaded:layers.every(l=>!!cache.get(l.src)?.texture),error:layers.some(l=>!!cache.get(l.src)?.error),triangles:count*2};
 }
 function reset(){contourFieldRenderer.dispose();surfaceGeneration++;surface?.dispose();surface=null;surfaceAsset=null;surfaceReady=false;surfaceError=null;surfaceDocument=null;pendingAsset=null;for(const e of cache.values())if(e.texture)gl.deleteTexture(e.texture);cache.clear();}
 function dispose(){disposed=true;reset();gl.deleteBuffer(buffer);gl.deleteProgram(program);}
 return {draw,dispose,reset};
}
const exposedCardBackRenderer={create};
window.CardBackRenderer=exposedCardBackRenderer;
return {CardBackRenderer:exposedCardBackRenderer};
})();
