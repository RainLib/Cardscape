const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('atelier',Object.freeze({
  platform:process.platform,
  onSplashState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('atelier:splash-state',listener);return()=>ipcRenderer.removeListener('atelier:splash-state',listener);},
  invoke:(method,args)=>ipcRenderer.invoke('atelier:invoke',method,args),
  onWindowState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('atelier:window-state',listener);return()=>ipcRenderer.removeListener('atelier:window-state',listener);},
  onCommand:callback=>{const listener=(_event,command)=>callback(command);ipcRenderer.on('atelier:command',listener);return()=>ipcRenderer.removeListener('atelier:command',listener);}
}));
