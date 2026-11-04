const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const F=require('../dist/renderer/frame-model.js'),R=require('../dist/renderer/runtime-model.js'),W=require('../dist/renderer/workshop-model.js');
const image='data:image/png;base64,AA==';
function document(artwork=true){
 const style={...F.defaults,width:36,corner:64,depth:16,bevel:4};
 const d=R.ensure({id:'card-a',name:'Hero',layers:[{id:'frame',kind:'frame',name:'Frame',visible:true,locked:false}],masks:{},frameStyle:style});
 if(artwork)d.componentScenes={frame:{schema:'card-frame/1',style:{...style},document:R.ensure({id:'art-frame',name:'Artwork frame',assetKind:'frame',frameStyle:{...style},layers:[{id:'metal',kind:'image',role:'frame-artwork',src:image,x:0,y:0,scale:1,visible:true},{id:'frame',kind:'frame',visible:true,locked:false}],masks:{}})}};
 return d;
}
function harness(doc,workshop=W.create(doc,'workshop','card-a')){
 const elements=new Map();
 function node(){return {id:'',dataset:{},hidden:false,disabled:false,value:'',title:'',type:'',textContent:'',validity:{valid:true},children:[],classList:{remove(){},toggle(){}},setAttribute(){},add(child){this.children.push(child);},append(...children){this.children.push(...children);for(const child of children)if(child.id)elements.set(child.id,child);},replaceChildren(...children){this.children=children;},before(...children){for(const child of children){elements.set(child.id,child);for(const descendant of child.children||[])if(descendant.id)elements.set(descendant.id,descendant);}},after(...children){for(const child of children)elements.set(child.id,child);},closest(){return this;}};}
 function get(id){if(!elements.has(id)){const el=node();el.id=id;if(['width','corner','depth','bevel','animationSpeed'].some(k=>id==='frame-'+k))el.type='number';else if(['frame-color','frame-accent'].includes(id))el.type='color';elements.set(id,el);}return elements.get(id);}
 let state={document:doc,workshop,layer:doc.layers.find(l=>l.kind==='frame'),busy:false,revision:0,documentToken:doc.id};const history=[],opened=[],messages=[],playbacks=[],events=new Map();let view={time:1.25,paused:doc.effects?.paused??false};let enabled=0;
 const host={state:()=>state,say:message=>messages.push(message),mutate(label,fn){const next=structuredClone(state.document);fn(next);R.validate(next);history.push(structuredClone(state.document));state={...state,document:next,layer:next.layers.find(l=>l.id===state.layer?.id),revision:state.revision+1};return true;},chooseFrame(){state.layer=state.document.layers.find(l=>l.kind==='frame');},unlockFrame(){state.layer.locked=false;}};
 host.previewEffects=(seconds,paused)=>{playbacks.push({seconds,paused});view={...view,time:seconds,paused};state.document.effects={...state.document.effects,paused};return true;};
 const window={addEventListener:(name,fn)=>events.set(name,fn),cardPreview:{getView:()=>view},cardEditorHost:host,CardFrameContourEditor:require('../dist/renderer/frame-contour-editor.js'),CardFrame:F,CardWorkshop:W,CardStats:require('../dist/renderer/card-stats.js'),CardCosmetics:require('../dist/renderer/cosmetics-model.js'),atelierComponentEditor:{open(...args){opened.push(args);}},atelierWorkspace:{panel(){},syncLayout(){},enableEffectsPreview(){enabled++;get('preview-effects').checked=true;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../dist/renderer/frame-panel.js'),'utf8'),{window,structuredClone,document:{getElementById:get,createElement:node,createElementNS:()=>node(),createTextNode:text=>({textContent:text}),activeElement:null,body:{classList:{remove(){}}}},Option:function(text,value){return {text,value};}});
 const refresh=()=>window.atelierFrame.refresh(state);
 return {get,opened,messages,history,window,playbacks,enabled:()=>enabled,state:()=>state,refresh,event(name){events.get(name)?.();},change(key,value){get('frame-'+key).value=String(value);get('frame-'+key).onchange();},undo(){const d=history.pop();state={...state,document:d,layer:d.layers.find(l=>l.kind==='frame')};refresh();},set(next){state={...state,...next};refresh();}};
}

test('frame playback pauses and resumes the current clock, and replay starts at zero without editing artwork',()=>{
 const d=document(),h=harness(d),shader=structuredClone(d.componentScenes.frame.document.shader),layers=structuredClone(d.componentScenes.frame.document.layers);
 assert.equal(h.get('frame-playback').textContent,'暂停边框');h.get('frame-playback').onclick();assert.deepEqual(h.playbacks.at(-1),{seconds:1.25,paused:true});assert.equal(h.get('frame-playback').textContent,'播放边框');
 h.get('frame-playback').onclick();assert.deepEqual(h.playbacks.at(-1),{seconds:1.25,paused:false});assert.equal(h.enabled(),1);
 h.get('frame-replay').onclick();assert.deepEqual(h.playbacks.at(-1),{seconds:0,paused:false});assert.equal(h.enabled(),2);
 assert.deepEqual(d.componentScenes.frame.document.shader,shader);assert.deepEqual(d.componentScenes.frame.document.layers,layers);assert.equal(h.history.length,0);
});

test('contour controls synchronize artwork carriers and component windows without replacing image pixels',()=>{
 const d=document(),h=harness(d),before=structuredClone(d.componentScenes.frame.document.layers);
 h.get('frame-contour-preset').value='double';h.get('frame-contour-preset').onchange();h.get('frame-contour-apply').onclick();
 const result=h.state().document;assert.equal(result.frameStyle.contour.windows.length,2);assert.deepEqual(result.frameStyle.contour,result.componentScenes.frame.document.frameStyle.contour);assert.deepEqual(result.componentScenes.frame.document.layers,before);
 assert.equal(h.history.length,1);h.undo();assert.equal(h.state().document.frameStyle.contour,undefined);
});

test('frame playback is available without selection or unlocking and reveals disabled effects',()=>{
 const d=document(),h=harness(d);d.layers[0].locked=true;h.set({layer:null});h.get('preview-effects').checked=false;h.event('atelier-preview-frame');
 assert.equal(h.get('frame-playback').textContent,'播放边框');assert.equal(h.get('frame-playback').disabled,false);h.get('frame-playback').onclick();assert.deepEqual(h.playbacks.at(-1),{seconds:1.25,paused:false});assert.equal(h.get('preview-effects').checked,true);
 h.window.cardPreview.getView=()=>({time:2,paused:true});h.event('atelier-preview-frame');assert.equal(h.get('frame-playback').textContent,'播放边框');
 h.set({busy:true});h.get('frame-replay').onclick();assert.equal(h.playbacks.length,1);
 h.set({busy:false,document:null});assert.equal(h.get('frame-playback').hidden,true);h.get('frame-playback').onclick();assert.equal(h.playbacks.length,1);
});

test('artwork thickness uses the internal outline and synchronizes carrier, aperture and saved component atomically',()=>{
 const d=document();d.frameStyle.width=71;d.frameStyle.corner=99;d.componentScenes.frame.style.width=72;
 const before=structuredClone(d),h=harness(d);assert.equal(Number(h.get('frame-width').value),36);assert.equal(Number(h.get('frame-corner').value),64);
 assert.equal(h.get('frame-depth').disabled,false);h.change('depth',42);
 const result=h.state().document,style=result.frameStyle;assert.equal(style.depth,42);assert.equal(style.width,36);assert.equal(style.corner,64);
 assert.deepEqual(style,result.componentScenes.frame.style);assert.deepEqual(style,result.componentScenes.frame.document.frameStyle);
 assert.deepEqual(result.componentScenes.frame.document.layers,before.componentScenes.frame.document.layers);
 const w=W.commit(h.state().workshop,result),reopened=W.resolve(JSON.parse(JSON.stringify(w)));assert.deepEqual(reopened.frameStyle,reopened.componentScenes.frame.document.frameStyle);assert.equal(reopened.frameStyle.depth,42);
 assert.deepEqual(d,before);assert.equal(h.history.length,1);h.undo();assert.deepEqual(h.state().document,before);
});

test('artwork cannot change PNG shape with procedural controls, and normal frames remain editable',()=>{
 const d=document(),h=harness(d),before=JSON.stringify(d);
 assert.equal(h.get('frame-animation').value,'component');assert.equal(h.get('frame-animation').children[0].text,'组件图层 / Shader');assert.match(h.get('frame-animation').title,/效果预览中播放/);assert.equal(h.get('frame-animationSpeed').hidden,true);
 for(const key of ['width','corner','bevel','color','accent','finish','animation','animationSpeed']){assert.equal(h.get('frame-'+key).disabled,true,key);h.change(key,key==='width'?80:key==='finish'?'glow':'1');}
 h.get('frame-level-preset').value='rare';h.get('frame-level-preset').onchange();assert.equal(JSON.stringify(h.state().document),before);assert.equal(h.history.length,0);
 const plain=document(false);h.set({document:plain,layer:plain.layers[0]});assert.equal(h.get('frame-component-edit').hidden,true);assert.equal(h.get('frame-width').disabled,false);assert.equal(h.get('frame-level-preset').disabled,false);
 assert.equal(h.get('frame-animation').value,'none');assert.equal(h.get('frame-animation').children.length,4);assert.equal(h.get('frame-animationSpeed').hidden,false);
 h.change('width',48);assert.equal(h.state().document.frameStyle.width,48);assert.equal(h.state().document.componentScenes,undefined);
});

test('component edit reuses the pinned resource and captures local edits instead of opening a stale published version',()=>{
 const d=document(),published=W.publish(W.create(d,'workshop','card-a'),{kind:'frame',id:'shared-frame',name:'Shared artwork',value:W.capture(d,'frame')}),w=W.bind(published.workshop,'frame','shared-frame',1,['card-a']);
 const h=harness(W.resolve(w),w);h.set({layer:null});assert.equal(h.get('frame-component-edit').hidden,false);assert.equal(h.get('frame-component-edit').disabled,false);
 h.get('frame-component-edit').onclick();assert.deepEqual(h.opened,[['frame','shared-frame',1]]);
 const edited=structuredClone(h.state().document);edited.componentScenes.frame.document.layers[0].x=10;h.set({document:edited});h.get('frame-component-edit').onclick();assert.deepEqual(h.opened[1],['frame','',0]);assert.equal(W.version(w,{resourceId:'shared-frame',version:1}).value.document.layers[0].x,0);
 h.set({busy:true});h.get('frame-component-edit').onclick();assert.equal(h.opened.length,2);
 h.set({busy:false,workshop:null});assert.equal(h.get('frame-component-edit').disabled,true);h.get('frame-component-edit').onclick();assert.equal(h.opened.length,2);
});

test('independent artwork workspaces keep thickness editing and do not open a nested component',()=>{
 const d=document().componentScenes.frame.document,h=harness(d);assert.equal(h.get('frame-component-edit').hidden,true);assert.equal(h.get('frame-width').disabled,true);h.change('depth',28);assert.equal(h.state().document.frameStyle.depth,28);assert.equal(h.state().document.componentScenes,undefined);
 h.get('frame-component-edit').onclick();assert.equal(h.opened.length,0);h.state().document.layers.find(l=>l.kind==='frame').locked=true;h.refresh();assert.equal(h.get('frame-depth').disabled,true);
});

test('normal property refresh preserves workshop and busy state through the workspace dispatcher',()=>{
 const h=harness({...document(),effects:{depth:1,background:0,cape:false,flow:false}}),window=h.window,received=[];window.CardDOM={element:h.get};window.CardMaskAssets={maskNames:{}};window.CardTitle=require('../dist/renderer/title-model.js');
 window.atelierWorkspace.refresh=next=>{received.push(next);window.atelierFrame.refresh(next);};
 const source=fs.readFileSync(require.resolve('../dist/renderer/app.js'),'utf8'),start=source.indexOf('function syncProperties()'),end=source.indexOf('\nfunction setTool(',start);
 const context={window,$:h.get,doc:h.state().document,workshop:h.state().workshop,active:()=>h.state().layer,loading:false,busy:false,applying:false,gesture:null,freeTransform:false,undo:[],redo:[],textStyle:()=>({}),target:'image',showMask:false,maskNames:{},selection:null,selectionMask:null,selectionLayer:null,lassoPoints:[],images:new Map(),tool:'move',brushValue:255,revision:0,documentToken:'card-a',white:true,maskDisplayMode:'overlay',document:{body:{dataset:{}},querySelector:h.get}};
 vm.createContext(context);vm.runInContext(require('./fixtures/source-node.cjs').extractFunction(source,'syncProperties'),context);
 context.syncProperties();assert.equal(h.get('frame-component-edit').disabled,false);assert.equal(received.at(-1).workshop,h.state().workshop);assert.match(h.get('frame-component-edit').title,/主编辑区/);
 h.set({busy:true});context.syncProperties();assert.equal(h.get('frame-component-edit').disabled,true);assert.equal(received.at(-1).busy,true);
 h.set({busy:false});context.syncProperties();assert.equal(h.get('frame-component-edit').disabled,false);h.get('frame-component-edit').onclick();assert.deepEqual(h.opened,[['frame','',0]]);
 h.set({workshop:null});context.workshop=null;context.syncProperties();assert.equal(h.get('frame-component-edit').disabled,true);assert.equal(received.at(-1).workshop,null);
});
