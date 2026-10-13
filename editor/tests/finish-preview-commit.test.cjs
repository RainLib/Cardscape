const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const elements=new Map(),node=()=>({hidden:true,value:'',textContent:'',dataset:{},className:'',children:[],style:{setProperty(){}},classList:{add(){},remove(){}},focus(){},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},setAttribute(){},querySelectorAll(){return [];}}),get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
 const entries=['frame','particles','material'].map(kind=>({id:kind,name:kind,group:kind,kind,recipe:{finish:'new',count:12}}));entries.push({...entries[0],id:'frame-other'});
 let state={documentToken:'card',busy:false,workshop:{},document:{frameStyle:{finish:'old'},particles:{finish:'old'},material:{finish:'old'}}},drafts={},changes=[],current='old',reject=false;
 const value=kind=>kind==='frame'?state.document.frameStyle:state.document[kind];
 function refresh(kind){const next=(drafts[kind]||value(kind))?.finish;if(next!==current){changes.push(next);current=next;}}
 const host={activateRuntime(){},state:()=>state,mutate(label,fn){if(reject)throw Error('validation failed');fn(state.document);for(const kind of Object.keys(drafts))refresh(kind);return true;},say(message){get('error').textContent=message;}};
 const window={cardEditorHost:host,CardFinishCatalog:{entries,find:id=>entries.find(e=>e.id===id),value:id=>({finish:id==='frame-other'?'other':'new'}),apply(d,kind){if(kind==='frame')d.frameStyle={finish:'new'};else d[kind]={finish:'new'};}},atelierComponents:{getDraft:kind=>drafts[kind],draft(kind,v){if(v)drafts[kind]=v;else delete drafts[kind];refresh(kind);},revealAuthored(kinds){for(const kind of kinds){delete drafts[kind];refresh(kind);}}},addEventListener(){},atelierWorkspace:{ensurePreview(){}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../renderer/finish-library.js'),'utf8'),{window,document:{getElementById:get,createElement:node}});
 return {open:()=>window.atelierFinishLibrary.open(),preview:kind=>get('finish-library-list').children.find(b=>b.dataset.recipe===kind).onclick(),apply:()=>get('finish-library-apply').onclick(),close:()=>window.atelierFinishLibrary.close(),changes,drafts,reject(){reject=true;},get(id){return get(id);}};
}
test('applying an effect preview commits directly without briefly restoring old geometry',()=>{
 for(const kind of ['frame','particles','material']){
  const h=harness();h.open();h.preview(kind);assert.deepEqual(h.changes,['new']);h.apply();h.close();
  assert.deepEqual(h.changes,['new']);assert.equal(h.drafts[kind],undefined);assert.match(h.get('finish-library-selection').textContent,/已应用/);
 }
});
test('a rejected effect commit retains the complete preview until the user cancels',()=>{
 const h=harness();h.open();h.preview('frame');h.reject();h.apply();assert.deepEqual(h.changes,['new']);assert.equal(h.drafts.frame.finish,'new');assert.equal(h.get('error').textContent,'validation failed');h.close();assert.deepEqual(h.changes,['new','old']);
});
test('changing candidates of the same type updates once and cancel still restores the authored effect',()=>{
 const h=harness();h.open();h.preview('frame');h.preview('frame-other');assert.deepEqual(h.changes,['new','other']);h.close();assert.deepEqual(h.changes,['new','other','old']);
});
