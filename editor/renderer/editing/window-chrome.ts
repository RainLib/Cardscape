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
 const title=(document.getElementById('titlebar-document') as any);
 const refresh=()=>{title.textContent=(document.getElementById('document-name') as any).textContent;title.title=title.textContent;};
 new MutationObserver(refresh).observe((document.getElementById('document-name') as any),{childList:true,subtree:true,characterData:true});
 refresh();
})();
