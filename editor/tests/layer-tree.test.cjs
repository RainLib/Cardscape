const {test}=require('node:test'),assert=require('node:assert/strict');
const folders=require('../renderer/layer-tree.js'),commands=require('../renderer/editor-commands.js');
const doc=()=>({layers:['title','near','hero','far'].map(id=>({id,name:id,kind:'image',x:0,y:0,scale:1,opacity:1,visible:true,locked:false})),effects:{},deformation:{}});
const order=d=>d.layers.map(l=>l.id);

test('folders preserve source objects, form contiguous order, nest, move and ungroup',()=>{
 const d=doc(),hero=d.layers[2];folders.group(d,['near','hero'],'人物','character');
 folders.group(d,['far'],'远景','background');
 assert.deepEqual(order(d),['title','near','hero','far']);assert.equal(d.layers[2],hero);
 folders.move(d,['background'],'character','inside');assert.deepEqual(folders.ids(folders.find(d.layerTree,'character').node),['near','hero','far']);
 folders.move(d,['character'],'title','before');assert.deepEqual(order(d),['near','hero','far','title']);
 folders.ungroup(d,'character');assert.deepEqual(order(d),['near','hero','far','title']);assert.equal(folders.find(d.layerTree,'background').parent,null);
});
test('dragging multiple members preserves their original order and supports moving out to root',()=>{
 const d=doc();folders.group(d,['near','hero'],'主体','character');
 folders.move(d,['hero','near'],'far','after');assert.deepEqual(order(d),['title','far','near','hero']);assert.equal(folders.find(d.layerTree,'hero').parent,null);
 folders.move(d,['near','hero'],'character','inside');folders.moveRoot(d,['character']);assert.deepEqual(order(d),['title','far','near','hero']);
});
test('new assets reconcile into folders and deleted assets leave no dangling references',()=>{
 const d=doc();folders.group(d,['near','hero'],'主体','character');
 d.layers.unshift({id:'fresh',name:'fresh'});folders.ensure(d);assert.equal(d.layerTree[0].id,'fresh');
 d.layers=d.layers.filter(l=>l.id!=='near');folders.ensure(d);assert.deepEqual(folders.ids(folders.find(d.layerTree,'character').node),['hero']);folders.validate(d);
 const restored=JSON.parse(JSON.stringify(d));folders.ensure(restored);assert.deepEqual(restored,d);
});
test('cycles, invalid imports and moves involving locked members are rejected',()=>{
 const d=doc();folders.group(d,['near','hero'],'主体','character');folders.group(d,['far'],'背景','background');folders.move(d,['background'],'character','inside');
 const original=JSON.stringify(d);assert.throws(()=>folders.move(d,['character'],'background','inside'),/自身或子组/);assert.equal(JSON.stringify(d),original);
 d.layers.find(l=>l.id==='hero').locked=true;const locked=JSON.stringify(d);assert.throws(()=>folders.move(d,['character'],'title','before'),/锁定/);assert.equal(JSON.stringify(d),locked);
 assert.throws(()=>folders.validate({layers:d.layers,layerTree:[{type:'group',id:'g',name:'bad',children:[{type:'layer',id:'missing'}]}]}),/不存在/);
});
test('AI folder edits form an isolated plan, keep schema and do not partially mutate on rejection',()=>{
 const d=doc(),first=commands.plan(d,[{op:'group',groupId:'character',name:'人物',layerIds:['near','hero']}],'hero').document;
 assert.equal(d.layerTree,undefined);const before=JSON.stringify(first);
 const moved=commands.plan(first,[{op:'moveNode',nodeIds:['character'],targetId:'title',position:'before'},{op:'renameGroup',groupId:'character',name:'人物组件'}],'hero').document;
 assert.equal(JSON.stringify(first),before);assert.deepEqual(order(moved),['near','hero','title','far']);
 assert.equal(folders.find(moved.layerTree,'character').node.name,'人物组件');
 assert.throws(()=>commands.plan(first,[{op:'renameGroup',groupId:'character',name:'暂存'},{op:'moveNode',nodeIds:['character'],targetId:'hero',position:'inside'}],'hero'),/自身或子组/);
 assert.equal(JSON.stringify(first),before);
});
