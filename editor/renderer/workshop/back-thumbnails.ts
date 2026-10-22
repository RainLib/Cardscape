import importedCardRuntime from '../rendering/runtime-model.ts';
/* Render visible reverse thumbnails sequentially using a single WebGL context. */
export const moduleApi=(() => {
'use strict';
const cache=new Map<any, any>(),inflight=new Map<any, any>(),watched=new WeakMap();let queue: any=Promise.resolve(),canvas=null,gl=null,renderer=null,redraw=null;
function setup(){if(renderer)return;canvas=document.createElement('canvas');canvas.width=256;canvas.height=384;gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL 不可用');renderer=window.CardBackRenderer.create(gl,()=>redraw?.());}
function capture(asset){return new Promise((resolve: any,reject: any)=>{setup();const angle=[Math.PI+.12,-.045];let finished=false,timer;
 const done=(error?: any)=>{if(finished)return;finished=true;clearTimeout(timer);redraw=null;error?reject(error):resolve(canvas.toDataURL('image/png'));};
 const draw=()=>{if(finished)return;try{gl.viewport(0,0,256,384);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const result=renderer.draw(asset,{angle,root:[0,0,0,1.35],aspect:2/3,eye:importedCardRuntime.cameraInCard(angle[0],angle[1]),time:.8});if(result.error)done(Error('卡背缩略图解码失败'));else if(result.loaded)done();}catch(e){done(e);}};
 redraw=draw;timer=setTimeout(()=>done(Error('卡背缩略图加载超时')),6000);draw();
 });}
function get(key,asset){if(cache.has(key))return Promise.resolve(cache.get(key));if(inflight.has(key))return inflight.get(key);const task=queue.then(()=>capture(asset)).then(src=>{cache.set(key,src);while(cache.size>48)cache.delete(cache.keys().next().value);return src;});inflight.set(key,task);queue=task.catch(()=>{});task.finally(()=>inflight.delete(key)).catch(()=>{});return task;}
function watch(image,key,asset){
 const previous=watched.get(image);if(previous?.key===key)return;previous?.observer?.disconnect();
 const ticket={key,observer:null};watched.set(image,ticket);image.dataset.render='pending';image.src=asset.src;
 const current=()=>image.isConnected&&watched.get(image)===ticket;
 const render=()=>get(key,asset).then(src=>{if(current()){image.src=src;image.dataset.render='webgl';}}).catch(()=>{if(current())image.dataset.render='poster';});
 if(!('IntersectionObserver' in window)){render();return;}
 ticket.observer=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){ticket.observer.disconnect();render();}else if(!image.isConnected)ticket.observer.disconnect();});ticket.observer.observe(image);
 image.addEventListener('back-thumbnail-remove',()=>{ticket.observer.disconnect();if(watched.get(image)===ticket)watched.delete(image);},{once:true});
}
const exposedatelierBackThumbnails={watch,get};
window.atelierBackThumbnails=exposedatelierBackThumbnails;
return {atelierBackThumbnails:exposedatelierBackThumbnails};
})();
