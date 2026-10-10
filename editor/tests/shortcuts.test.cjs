const {test}=require('node:test');
const assert=require('node:assert/strict');
const keys=require('../renderer/shortcuts.js');

test('basic document shortcuts agree between Electron and browser keyboard events',()=>{
 const cases=[['z',false,false,'undo'],['z',true,false,'redo'],['y',false,false,'redo'],['s',false,false,'save'],['s',true,false,'save-as'],['i',true,false,'invert-selection'],['i',false,true,'import'],['a',false,false,'select-all'],['d',false,false,'deselect'],['j',false,false,'duplicate'],['t',false,false,'transform'],['0',false,false,'fit'],['1',false,false,'actual'],['+',true,false,'zoom-in'],['-',false,false,'zoom-out']];
 for(const [key,shift,alt,expected] of cases)for(const mac of [true,false]){
  const dom={key,shiftKey:shift,altKey:alt,metaKey:mac,ctrlKey:!mac};
  const native=keys.fromElectron({type:'keyDown',key,shift,alt,meta:mac,control:!mac});
  assert.equal(keys.resolve(dom),expected);assert.equal(keys.resolve(native),expected);
 }
});

test('text/GLSL editing keeps native undo and selection while save remains global',()=>{
 const editing={editing:true},e={ctrlKey:true,key:'z'};
 assert.equal(keys.resolve(e,editing),'text-undo');
 assert.equal(keys.resolve({...e,shiftKey:true},editing),'text-redo');
 assert.equal(keys.resolve({...e,key:'y'},editing),'text-redo');
 assert.equal(keys.resolve({...e,key:'a'},editing),'text-select-all');
 assert.equal(keys.resolve({...e,key:'s'},editing),'save');
 assert.equal(keys.resolve({...e,key:'s',shiftKey:true},editing),'save-as');
 assert.equal(keys.resolve({...e,key:'j'},editing),null);
 assert.equal(keys.resolve({key:'Backspace'},editing),null);
 assert.equal(keys.resolve({...e,isComposing:true}),null);
 assert.equal(keys.resolve({...e,getModifierState:name=>name==='AltGraph'}),null);
 assert.equal(keys.resolve({key:'z'}),null);
 assert.equal(keys.resolve({...e,altKey:true}),null);
});
