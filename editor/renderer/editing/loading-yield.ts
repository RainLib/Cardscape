/* Hidden Electron windows cannot supply animation frames. Loading must still advance. */

const api = (()=>{
'use strict';
function paint(surface=globalThis){
 if(surface.atelier||surface.document?.hidden)return new Promise((resolve: any)=>surface.setTimeout(resolve,0));
 return new Promise((resolve: any)=>{
  let frame=0,done=false;
  const finish=()=>{if(done)return;done=true;surface.clearTimeout(timer);if(frame)surface.cancelAnimationFrame(frame);resolve();};
  // A tab may become hidden after the first frame. Never bind loading to visibility.
  const timer=surface.setTimeout(finish,100);
  frame=surface.requestAnimationFrame(()=>{if(!done)frame=surface.requestAnimationFrame(finish);});
 });
}
return {paint};
})();

export default api;
