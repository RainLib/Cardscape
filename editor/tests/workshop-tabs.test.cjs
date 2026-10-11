const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../renderer/workshop-tabs.js');
const cards=['a','b','c','d','e'].map(id=>({id,name:id,document:{layers:[{id:'art',x:47}]}}));
test('pinned tabs move to the front and survive closing tabs on either side',()=>{
 let s=T.normalize(null,cards);s=T.pin(s,'c');assert.deepEqual(s.open,['c','a','b','d','e']);
 let plan=T.close(s,'b','left','a');assert.deepEqual(plan.removed,['a']);assert.equal(plan.activeId,'b');assert.deepEqual(plan.state.open,['c','b','d','e']);
 plan=T.close(plan.state,'b','right','b');assert.deepEqual(plan.removed,['d','e']);assert.equal(plan.activeId,'b');assert.deepEqual(plan.state.open,['c','b']);
 assert.deepEqual(T.close(s,'c','others','b').state.open,['c']);
 assert.deepEqual(T.close(s,'b','all','b').state.open,['c']);
});
test('closing the active tab chooses its nearest neighbor and closing all preserves card data',()=>{
 const before=JSON.stringify(cards),s=T.normalize(null,cards);let p=T.close(s,'b','one','b');assert.equal(p.activeId,'c');
 p=T.close(s,'e','one','e');assert.equal(p.activeId,'d');
 p=T.close(s,'c','all','c');assert.equal(p.activeId,null);assert.deepEqual(p.state.open,[]);assert.equal(JSON.stringify(cards),before);
 const saved=JSON.parse(JSON.stringify(p.state));assert.deepEqual(T.normalize(saved,cards).open,[]);assert.deepEqual(T.open(saved,'c').open,['c']);assert.ok(!T.open(saved,'c').closed.includes('c'));
});
test('individual close can close a pinned tab; restoration opens it without pinning',()=>{
 const p=T.close(T.pin(T.normalize(null,cards),'b'),'b','one','b');assert.deepEqual(p.state.pinned,[]);assert.equal(p.state.closed.at(-1),'b');
 const restored=T.open(p.state,p.state.closed.at(-1));assert.equal(restored.open.at(-1),'b');assert.deepEqual(restored.pinned,[]);
});
test('restoring preferences prunes removed cards, opens new cards and keeps deliberately closed tabs closed',()=>{
 let s=T.close(T.normalize(null,cards),'b','one','a').state;s=T.pin(s,'d');
 const next=cards.filter(c=>c.id!=='e').concat({id:'f',name:'f'});s=T.normalize(JSON.parse(JSON.stringify(s)),next);
 assert.deepEqual(s.open,['d','a','c','f']);assert.deepEqual(s.closed,['b']);assert.deepEqual(s.known,['a','b','c','d','f']);
 assert.deepEqual(T.normalize({version:1,known:'invalid'},next).open,next.map(c=>c.id));
 const duplicated={version:1,known:['a','b','c','d','e'],open:['a','a','unknown','b'],pinned:['b','b'],closed:['a','c','c']};assert.deepEqual(T.normalize(duplicated,cards),{version:1,known:['a','b','c','d','e'],open:['b','a'],pinned:['b'],closed:['c']});
});
test('disabled batch actions have no candidates at the edges and preserve active tabs',()=>{
 const s=T.normalize(null,cards);assert.deepEqual(T.candidates(s,'a','left'),[]);assert.deepEqual(T.candidates(s,'e','right'),[]);assert.deepEqual(T.candidates(s,'gone','all'),[]);
 assert.equal(T.close(s,'d','right','b').activeId,'b');assert.deepEqual(T.close(s,'b','unknown','b').removed,[]);
});
test('refresh cannot reopen a closed tab when the document recovery still points to it',()=>{
 const plan=T.close(T.normalize(null,cards),'b','one','b');
 const restored=T.normalize(JSON.parse(JSON.stringify({...plan.state,active:plan.activeId})),cards);
 assert.equal(T.restoredActive(restored,'b',plan.activeId),'c');assert.ok(!restored.open.includes('b'));
 assert.equal(T.restoredActive(restored,'a','c'),'a');assert.equal(T.restoredActive(restored,'b','deleted'),'a');
 const empty=T.close(restored,'a','all','a').state;assert.equal(T.restoredActive(empty,'a','c'),null);
});
