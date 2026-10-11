/* Hidden Electron windows cannot supply animation frames. Loading must still advance. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardLoadingYield=api;})(typeof globalThis==='object'?globalThis:this,()=>{
'use strict';
function paint(surface=globalThis){
 if(surface.atelier||surface.document?.hidden)return new Promise(resolve=>surface.setTimeout(resolve,0));
 return new Promise(resolve=>{
  let frame=0,done=false;
  const finish=()=>{if(done)return;done=true;surface.clearTimeout(timer);if(frame)surface.cancelAnimationFrame(frame);resolve();};
  // A tab may become hidden after the first frame. Never bind loading to visibility.
  const timer=surface.setTimeout(finish,100);
  frame=surface.requestAnimationFrame(()=>{if(!done)frame=surface.requestAnimationFrame(finish);});
 });
}
return {paint};
});
