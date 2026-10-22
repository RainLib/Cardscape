const test=require('node:test');
const assert=require('node:assert/strict');
const Stats=require('../dist/renderer/card-stats.js');
const Commands=require('../dist/renderer/editor-commands.js');
const Runtime=require('../dist/renderer/runtime-model.js');
const {prepareAuthoring}=require('../dist/electron/authoring-service.cjs');
const base=()=>Runtime.ensure({id:'stat-art-test',name:'徽标测试',width:1024,height:1536,layers:[],masks:{},effects:{}});

test('approved badge artwork keeps editable values, roles and transforms across serialization',()=>{
 const doc=base();Stats.apply(doc,{cost:4,power:7});const cost=doc.layers.find(l=>l.role==='stat-cost');cost.x=23;cost.scale=1.2;
 Stats.apply(doc,{theme:'stellar-energy'});assert.equal(Stats.resolveTheme(doc),'stellar-energy');assert.equal(cost.text,'4');assert.equal(cost.x,23);assert.equal(cost.scale,1.2);
 const reopened=JSON.parse(JSON.stringify(doc));Stats.validate(reopened);assert.equal(Stats.resolveTheme(reopened),'stellar-energy');Stats.apply(reopened,{cost:99,power:-99});assert.equal(Stats.resolve(reopened).cost,99);assert.equal(Stats.resolve(reopened).power,-99);assert.equal(Stats.resolveTheme(reopened),'stellar-energy');
 Stats.apply(reopened,{theme:'snap'});assert.equal(Stats.resolveTheme(reopened),'snap');assert.equal(Stats.resolve(reopened).power,-99);
});

test('locked or malformed badge updates leave both layers unchanged',()=>{
 const doc=base();Stats.apply(doc,{cost:4,power:7});doc.layers.find(l=>l.role==='stat-power').locked=true;const before=JSON.stringify(doc);
 assert.throws(()=>Stats.apply(doc,{theme:'stellar-energy',cost:5}),/锁定/);assert.equal(JSON.stringify(doc),before);
 assert.throws(()=>Stats.apply(doc,{theme:'unknown'}),/外观/);assert.equal(JSON.stringify(doc),before);
 const full=base();full.layers=Array.from({length:63},(_,i)=>({id:'image-'+i,kind:'image'}));const saved=JSON.stringify(full);assert.throws(()=>Stats.apply(full,{cost:4}),/超限/);assert.equal(JSON.stringify(full),saved);
});

test('atlas load retries failures, rejects invalid aspect and deduplicates concurrent decodes',async()=>{
 await assert.rejects(Stats.loadTheme('stellar-energy',async()=>{throw Error('offline');}),/offline/);
 await assert.rejects(Stats.loadTheme('stellar-energy',async()=>({width:512,height:512})),/图集/);
 let calls=0;const image={width:1024,height:512};const loader=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return image;};
 await Promise.all([Stats.loadTheme('stellar-energy',loader),Stats.loadTheme('stellar-energy',loader)]);await Stats.loadThemes({layers:[{role:'stat-cost',textStyle:{badgeTheme:'stellar-energy'}}]},loader);assert.equal(calls,1);
 const drawn=[],text=[];const ctx={save(){},restore(){},drawImage(...args){drawn.push(args);},measureText(){return {width:200};},strokeText(...args){text.push(args);},fillText(...args){text.push(args);}};
 const style={badgeTheme:'stellar-energy',fontSize:108,fontWeight:700,fontFamily:'Georgia',italic:true,strokeWidth:3,color:'#fff',stroke:'#000'};
 Stats.draw(ctx,{role:'stat-cost',text:'99'},style);Stats.draw(ctx,{role:'stat-power',text:'-99'},style);
 assert.deepEqual(drawn.map(a=>a.slice(1)),[[0,0,512,512,0,0,188,188],[512,0,512,512,836,0,188,188]]);assert.deepEqual(text.map(t=>t[0]),['99','99','-99','-99']);assert.match(ctx.font,/italic 700 60\.48px/);
});

test('AI theme command is bounded and uses the same editable production layers',async()=>{
 Commands.validate([{op:'cardStats',theme:'stellar-energy'}]);assert.throws(()=>Commands.validate([{op:'cardStats',theme:'unknown'}]),/外观/);
 const fixture=Runtime.ensure({schema:'card-atelier/1',id:'stat-art',name:'徽标测试',width:1024,height:1536,previewMode:'authored',layers:[{id:'title',kind:'text',name:'Title',text:'Hero',x:0,y:0,scale:1,opacity:1,visible:true,locked:false}],effects:{},masks:{}}),before=JSON.stringify(fixture);
 const out=await prepareAuthoring({document:fixture,documentToken:fixture.id,commands:[{op:'cardStats',cost:4,power:7,theme:'stellar-energy'}]},{validate:d=>{Runtime.validate(d);return d;}});
 assert.equal(Stats.resolveTheme(out.document),'stellar-energy');assert.equal(Stats.resolve(out.document).cost,4);assert.equal(Stats.resolve(out.document).power,7);assert.equal(JSON.stringify(fixture),before);assert.equal(fixture.layers.length,1);
});

test('switching back restores previous typography and preserves independent number values',()=>{
 const doc=base();Stats.apply(doc,{cost:4,power:7});const cost=doc.layers.find(l=>l.role==='stat-cost');cost.textStyle.fontFamily='Menlo';cost.textStyle.fontSize=96;const before={...cost.textStyle};
 Stats.apply(doc,{theme:'stellar-energy'});const reopened=JSON.parse(JSON.stringify(doc));Stats.apply(reopened,{theme:'snap'});assert.deepEqual(reopened.layers.find(l=>l.role==='stat-cost').textStyle,{...before,badgeTheme:'snap'});assert.equal(Stats.resolve(reopened).cost,4);
 const legacy=base();Stats.apply(legacy,{cost:4,power:7});for(const l of legacy.layers)l.textStyle={...l.textStyle,badgeTheme:'stellar-energy',fontFamily:'Georgia',strokeWidth:3};Stats.apply(legacy,{theme:'snap'});assert.equal(legacy.layers[0].textStyle.fontFamily,'Arial');assert.equal(legacy.layers[0].textStyle.strokeWidth,7);
});
