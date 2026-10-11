(() => {
'use strict';
const $=id=>document.getElementById(id);
function update(state){$('splash-name').textContent=state.name;$('splash-stage').textContent=state.stage;$('splash-progress').value=state.percent;$('splash-percent').textContent=Math.round(state.percent)+'%';$('splash-version').textContent='Cardscape '+state.version;}
window.atelier.onSplashState(update);window.atelier.invoke('splash-state').then(update).catch(()=>{});
Promise.all([...document.images].map(image=>image.decode())).then(()=>console.log('SPLASH_READY',JSON.stringify({images:document.images.length,artwork:true}))).catch(e=>console.error('SPLASH_ART_ERROR',e.message));
})();
