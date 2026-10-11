const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createLoadingWindow,normalize}=require('../electron/loading-window.cjs');
function fixture(background=false){
 const events=[],windows=[];class Window extends EventEmitter{constructor(options){super();this.options=options;this.id=windows.length+1;this.dead=false;this.webContents=new EventEmitter();this.webContents.mainFrame={url:'atelier://app/splash.html'};this.webContents.send=(...args)=>events.push(['send',...args]);this.webContents.setWindowOpenHandler=fn=>this.popup=fn;windows.push(this);}setMenu(){}async loadURL(url){this.url=url;}isDestroyed(){return this.dead;}hide(){events.push(['splash-hide']);}show(){events.push(['splash-show']);}focus(){}destroy(){this.dead=true;}}
 const main={hide:()=>events.push(['main-hide']),show:()=>events.push(['main-show']),focus(){},isDestroyed:()=>false,webContents:{setBackgroundThrottling:value=>events.push(['throttle',value])}};
 return {windows,events,controller:createLoadingWindow({BrowserWindow:Window,main,preload:'/preload.cjs',url:'atelier://app/splash.html',version:'test',background})};
}
test('native loading window displays separately before showing editor and accepts only its own frame',async()=>{
 const {controller,events,windows}=fixture();await controller.show({name:'星潮守卫',percent:12});assert.equal(windows.length,1);assert.equal(windows[0].options.frame,false);assert.equal(windows[0].options.webPreferences.sandbox,true);assert.ok(events.find(e=>e[0]==='main-hide'));assert.ok(events.find(e=>e[0]==='splash-show'));assert.equal(events.some(e=>e[0]==='main-show'),false);
 controller.update({stage:'恢复 Mask',percent:80});assert.equal(controller.state().name,'星潮守卫');assert.equal(controller.state().percent,80);assert.equal(controller.isSender({sender:windows[0].webContents,senderFrame:windows[0].webContents.mainFrame}),true);assert.equal(controller.isSender({sender:windows[0].webContents,senderFrame:{url:'atelier://app/index.html'}}),false);assert.deepEqual(windows[0].popup(),{action:'deny'});
 await controller.finish();assert.ok(events.find(e=>e[0]==='main-show'));assert.equal(controller.state().percent,100);controller.destroy();assert.equal(windows[0].dead,true);
});
test('a delayed previous finish cannot dismiss a newer card load; background runs stay hidden',async()=>{
 const {controller,events}=fixture();await controller.show({name:'第一张'});const oldFinish=controller.finish();await controller.show({name:'第二张'});await oldFinish;assert.equal(events.some(e=>e[0]==='main-show'),false);assert.equal(controller.state().name,'第二张');await controller.finish();controller.destroy();
 const bg=fixture(true);await bg.controller.show();await bg.controller.finish();assert.equal(bg.events.some(e=>['main-show','splash-show','main-hide'].includes(e[0])),false);bg.controller.destroy();
});
test('loading labels are bounded, progress is clamped and missing progress keeps its previous value',()=>{
 const state=normalize({name:'x'.repeat(200),stage:'y'.repeat(200),percent:200,version:'test'});assert.equal(state.name.length,120);assert.equal(state.stage.length,160);assert.equal(state.percent,100);assert.equal(normalize({percent:-5},state).percent,0);assert.equal(normalize({percent:NaN},state).percent,100);
});
test('relaunch and Dock activation keep only the independent splash visible until editing is ready',async()=>{
 const {controller,events,windows}=fixture();await controller.show({name:'霜灯卡牌工坊'});
 assert.equal(windows[0].options.parent,undefined);assert.deepEqual(events[0],['throttle',false]);
 controller.focus();controller.focus();assert.equal(events.some(e=>e[0]==='main-show'),false);
 await controller.finish();assert.ok(events.find(e=>e[0]==='throttle'&&e[1]===true));controller.focus();assert.equal(events.filter(e=>e[0]==='main-show').length,2);controller.destroy();
});
