const {app,BrowserWindow,Menu,dialog,ipcMain,protocol,net,session,shell} = require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createServices,ROOT}=require('./services.cjs');
const shortcuts=require('../renderer/shortcuts.js');
const {windowChromeOptions}=require('./window-chrome.cjs');
const {rendererDocument}=require('./renderer-document.cjs');
const {createLoadingWindow}=require('./loading-window.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'atelier',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win,services,loadingWindow,hasUnsavedChanges=false,discardConfirmed=false;
const runtimeDir=path.resolve(process.env.ATELIER_RUNTIME||path.join(ROOT,'runtime'));
const appIcon=path.join(ROOT,'assets','icons',process.platform==='win32'?'card-atelier.ico':'card-atelier.png');
app.setName('Cardscape');
app.setPath('userData',path.join(runtimeDir,'electron-profile'));
const ownsInstance=app.requestSingleInstanceLock();
if(!ownsInstance)app.quit();
app.on('second-instance',()=>loadingWindow?.focus());
app.on('activate',()=>loadingWindow?.focus());
const command=c=>win?.webContents.send('atelier:command',c);
const choose=async options=>(await dialog.showOpenDialog(win,options)).filePaths?.[0];
app.whenReady().then(async()=>{
  if(!ownsInstance)return;
  if(process.platform==='darwin')app.dock.setIcon(appIcon);
  protocol.handle('atelier',async request=>{
    const url=new URL(request.url);
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
    const file=path.resolve(ROOT,'renderer',relative);
    if(url.host!=='app'||!(file.startsWith(path.join(ROOT,'renderer')+path.sep)))return new Response('Forbidden',{status:403});
    const response=await net.fetch(pathToFileURL(file).toString());
    if(relative==='index.html')return new Response(rendererDocument(await response.text()),{headers:{'Content-Type':'text/html; charset=utf-8'}});
    return response;
  });
  // Assets live beside source code; the renderer directory contains a prepared copy.
  services=createServices({runtimeDir,initialProject:process.env.ATELIER_INITIAL_PROJECT||null,dialogs:{
    reveal:directory=>shell.openPath(directory),
    openSetup:file=>shell.openPath(file),
    saveProject:async name=>(await dialog.showSaveDialog(win,{defaultPath:path.join(runtimeDir,String(name||'card')+'.cardproj'),filters:[{name:'卡牌工程',extensions:['cardproj']}]})).filePath,
    saveWorkshop:async name=>(await dialog.showSaveDialog(win,{defaultPath:path.join(runtimeDir,String(name||'workshop')+'.cardworkshop'),filters:[{name:'多卡片工坊',extensions:['cardworkshop']}]})).filePath,
    saveImage:async name=>(await dialog.showSaveDialog(win,{defaultPath:path.join(runtimeDir,name),filters:[{name:'PNG 图像',extensions:['png']}]})).filePath,
    openProject:()=>choose({properties:['openFile'],filters:[{name:'卡牌与工坊工程',extensions:['cardproj','cardworkshop']}]}),
    importMaterialMaker:()=>choose({properties:['openFile','openDirectory']}),
    importFont:()=>choose({properties:['openFile'],filters:[{name:'字体',extensions:['ttf','otf','woff2']}]}),
    importImage:()=>choose({properties:['openFile'],filters:[{name:'图像',extensions:['png','jpg','jpeg','webp']}]}),
    exportDirectory:()=>choose({properties:['openDirectory','createDirectory']})
  }});
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  ipcMain.handle('atelier:invoke',(event,method,args)=>{
    if(loadingWindow?.isSender(event)){if(method==='splash-state')return loadingWindow.state();throw Error('Unsupported loading window command');}
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!=='atelier://app/index.html')throw Error('Untrusted IPC sender');
    if(method==='document-state'){hasUnsavedChanges=args?.dirty===true;return {ok:true};}
    if(method==='loading-window'){if(args?.action==='show')return loadingWindow.show(args);if(args?.action==='progress'){loadingWindow.update(args);return {ok:true};}if(args?.action==='finish')return loadingWindow.finish();throw Error('Unsupported loading window action');}
    if(method==='window-state')return windowState();
    if(method==='edit-text'){
      const op={undo:'undo',redo:'redo','select-all':'selectAll'}[args?.command];
      if(!op)throw Error('Unsupported text command');
      win.webContents[op]();return {ok:true};
    }
    return services.invoke(method,args);
  });
  win=new BrowserWindow({show:false,width:1560,height:1020,minWidth:1120,minHeight:760,...windowChromeOptions(process.platform),backgroundColor:'#2b2b2b',title:'Cardscape '+app.getVersion(),icon:appIcon,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  loadingWindow=createLoadingWindow({BrowserWindow,main:win,preload:path.join(__dirname,'preload.cjs'),url:'atelier://app/splash.html',version:app.getVersion(),background:process.env.ATELIER_BACKGROUND==='1'});
  function windowState(){return {platform:process.platform,focused:win.isFocused(),fullscreen:win.isFullScreen(),maximized:win.isMaximized()};}
  const sendWindowState=()=>win.webContents.send('atelier:window-state',windowState());
  for(const event of ['focus','blur','enter-full-screen','leave-full-screen','maximize','unmaximize'])win.on(event,sendWindowState);
  win.webContents.on('did-finish-load',sendWindowState);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  // Known keyboard shortcuts run once in the shared renderer. Text fields keep
  // Chromium's native undo; the menu no longer hijacks their editing history.
  win.webContents.on('before-input-event',(_event,input)=>{
    win.webContents.setIgnoreMenuShortcuts(input.type==='keyDown'&&!!shortcuts.resolve(shortcuts.fromElectron(input)));
  });
  win.webContents.on('will-navigate',(event,url)=>{if(url!=='atelier://app/index.html')event.preventDefault();});
  win.webContents.on('console-message',event=>console.log('[renderer]',event.message));
  win.webContents.on('did-fail-load',(_event,code,description)=>console.error('LOAD FAILED',code,description));
  win.on('close',event=>{
    if(!hasUnsavedChanges||discardConfirmed)return;
    event.preventDefault();
    const choice=dialog.showMessageBoxSync(win,{type:'question',title:'保存当前工程',message:'当前工程尚有未保存的修改',detail:'返回编辑器保存，或放弃修改退出。',buttons:['返回编辑器','放弃修改'],defaultId:0,cancelId:0});
    if(choice===1){discardConfirmed=true;win.close();}
  });
  win.on('closed',()=>loadingWindow?.destroy());
  const item=(label,c,accelerator)=>({label,accelerator,click:()=>command(c)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Cardscape',submenu:[{role:'about'},{type:'separator'},{role:'quit'}]},
    {label:'文件',submenu:[item('新建卡片','new','CmdOrCtrl+N'),item('打开工程…','open','CmdOrCtrl+O'),item('保存工程…','save','CmdOrCtrl+S'),item('另存为…','save-as','CmdOrCtrl+Shift+S'),item('导入图像…','import','CmdOrCtrl+Alt+I'),item('导出素材包…','export')]},
    {label:'编辑',submenu:[item('撤销','undo','CmdOrCtrl+Z'),item('重做','redo','CmdOrCtrl+Shift+Z'),{type:'separator'},item('全选','select-all','CmdOrCtrl+A'),item('取消选区','deselect','CmdOrCtrl+D'),item('反选','invert-selection','CmdOrCtrl+Shift+I'),item('自由变换','transform','CmdOrCtrl+T'),item('复制图层 / 选区','duplicate','CmdOrCtrl+J'),item('删除普通图层','delete-layer','Delete'),{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'}]},
    {label:'视图',submenu:[item('适合窗口','fit','CmdOrCtrl+0'),item('100%','actual','CmdOrCtrl+1'),{role:'togglefullscreen'}]},
    {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]},
    {label:'帮助',submenu:[item('快捷键说明','shortcuts','F1')]}
  ]));
  await loadingWindow.show({name:'准备创作空间',stage:'读取最近卡片与工作区…',percent:12});
  await win.loadURL('atelier://app/index.html');
  console.log('ELECTRON_READY',JSON.stringify({appVersion:app.getVersion(),version:process.versions.electron,chrome:windowChromeOptions(process.platform),worker:await services.worker.call('ping')}));
}).catch(error=>{console.error(error);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{loadingWindow?.destroy();services?.close();});
