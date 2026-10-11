const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {paint}=require('../renderer/loading-yield.js');
const clock={setTimeout,clearTimeout};
test('hidden native loading advances without an animation frame',async()=>{
 let frames=0;await paint({...clock,atelier:{},document:{hidden:false},requestAnimationFrame(){frames++;},cancelAnimationFrame(){}});assert.equal(frames,0);
 await paint({...clock,document:{hidden:true},requestAnimationFrame(){frames++;},cancelAnimationFrame(){}});assert.equal(frames,0);
});
test('a browser tab becoming hidden cannot leave loading waiting forever',async()=>{
 let frames=0,canceled=0;await paint({...clock,document:{hidden:false},requestAnimationFrame(){frames++;return 7;},cancelAnimationFrame(id){canceled=id;}});assert.equal(frames,1);assert.equal(canceled,7);
});
test('a visible browser still paints two frames before continuing',async()=>{
 let frames=0;await paint({...clock,document:{hidden:false},requestAnimationFrame(fn){const id=++frames;queueMicrotask(fn);return id;},cancelAnimationFrame(){}});assert.equal(frames,2);
});
test('desktop opening completes through every mask yield while the main window has no frames',async()=>{
 const nodes=new Map(),events=[],dataset={appMode:'home'};
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,replaceChildren(){},focus(){},click(){},dataset:{view:'edit'}});return nodes.get(id);};
 const context={console,setTimeout,clearTimeout,Intl,Promise,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 context.document={body:{dataset},getElementById:element,querySelector:()=>element('stage'),hidden:false};context.window=context;context.dispatchEvent=()=>{};context.atelier={invoke:async(method,args)=>events.push([method,args.action])};context.CardLoadingYield={paint};
 context.cardEditorHost={state:()=>({document:null}),flushSession:async()=>events.push(['flush']),opened:()=>events.push(['editor-ready'])};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/home-screen.js'),'utf8'),context);
 const result=await context.atelierHome.run('霜灯卡牌工坊',async()=>{for(let i=0;i<7;i++){context.atelierHome.progress('恢复 Mask',70+i*3);await context.atelierHome.paint();}events.push(['document-opened']);return true;});
 assert.equal(result,true);assert.equal(dataset.appMode,'editor');assert.equal(dataset.loadingSurface,'native');assert.ok(events.find(e=>e[0]==='document-opened'));assert.equal(events.at(-1)[0],'editor-ready');
 assert.ok(events.find(e=>e[0]==='loading-window'&&e[1]==='finish'));
});
