(() => {
 'use strict';
 const bridge=window.atelier;
 if(bridge?.platform){
  document.body.dataset.desktopPlatform=bridge.platform;
  const update=state=>{
   document.body.classList.toggle('window-fullscreen',!!state.fullscreen);
   document.body.classList.toggle('window-inactive',!state.focused);
  };
  bridge.onWindowState(update);
  bridge.invoke('window-state').then(update).catch(()=>{});
 }
 const title=document.getElementById('titlebar-document');
 const refresh=()=>{title.textContent=document.getElementById('document-name').textContent;title.title=title.textContent;};
 new MutationObserver(refresh).observe(document.getElementById('document-name'),{childList:true,subtree:true,characterData:true});
 refresh();
})();
