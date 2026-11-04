const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../dist/renderer/particle-physics-model.js');
const config=(extra={})=>({...P.defaults(),radius:0,friction:0,...extra});
const close=(a,b,t=2e-6)=>assert.ok(Math.abs(a-b)<=t, a+' != '+b);
test('ballistic motion agrees with closed-form free fall and does not mutate inputs',()=>{
 const c=config({planes:[],gravity:[0,-2,0]}),p=[0,1,0],v=[2,3,4],engine=P.cache();
 const s=engine.sample(c,p,v,.5,2);s.position.forEach((x,i)=>close(x,[1,2.25,2][i]));assert.deepEqual(s.velocity,[2,2,4]);assert.deepEqual(p,[0,1,0]);assert.deepEqual(v,[2,3,4]);
});
test('swept plane collision catches high velocity between frames and reflects the incoming velocity',()=>{
 const c=config({gravity:[0,0,0],restitution:1,planes:[{id:'floor',normal:[0,1,0],distance:0}]});
 const s=P.cache().sample(c,[0,1,0],[0,-10,0],.15,2);close(s.position[1],.5);assert.deepEqual(s.velocity,[0,10,0]);assert.equal(s.contacts,1);
});
test('gravity collision time and friction use the actual impact instant',()=>{
 const engine=P.cache(),floor=[{id:'floor',normal:[0,1,0],distance:0}];
 const elastic=engine.sample(config({gravity:[0,-2,0],restitution:1,planes:floor}),[0,1,0],[0,0,0],1.5,3);close(elastic.position[1],.75);close(elastic.velocity[1],1);
 const rough=engine.sample(config({gravity:[0,0,0],restitution:.5,friction:.5,planes:floor}),[0,1,0],[2,-10,0],.2,2);close(rough.position[0],.3);close(rough.position[1],.5);assert.deepEqual(rough.velocity,[1,5,0]);
});
test('slide, finite radius, initial penetration and bounce limits remain finite',()=>{
 const floor=[{id:'floor',normal:[0,1,0],distance:0}],engine=P.cache();
 const sliding=engine.sample(config({response:'slide',gravity:[0,-2,0],planes:floor}),[0,.3,0],[1,-2,0],3,4);close(sliding.position[1],0);close(sliding.velocity[1],0);assert.equal(sliding.alive,true);
 const radius=engine.sample(config({radius:.05,gravity:[0,0,0],restitution:1,planes:floor}),[0,.1,0],[0,-1,0],.08,1);close(radius.position[1],.08);
 const born=engine.sample(config({gravity:[0,0,0],restitution:1,planes:floor}),[0,-.1,0],[0,-1,0],.1,1);assert.ok(born.position[1]>=0);assert.equal(born.velocity[1],1);
 const killed=engine.sample(config({maxBounces:0,gravity:[0,0,0],planes:floor}),[0,1,0],[0,-10,0],.5,1);assert.equal(killed.alive,false);close(killed.position[1],0);
 const asleep=engine.sample(config({gravity:[0,-20,0],planes:floor}),[0,0,0],[0,0,0],12,12);assert.ok(asleep.position.every(Number.isFinite));close(asleep.position[1],0);assert.equal(asleep.alive,true);
});
test('multiple planes and arbitrary seek order reproduce the same path',()=>{
 const c=config({gravity:[0,0,0],restitution:1,maxBounces:32,planes:[{id:'left',normal:[1,0,0],distance:-.5},{id:'right',normal:[-1,0,0],distance:-.5}]}),engine=P.cache();
 const reference=Array.from({length:21},(_,i)=>engine.sample(c,[0,0,0],[8,0,0],i/20,1));
 for(let i=20;i>=0;i--){const s=engine.sample(c,[0,0,0],[8,0,0],i/20,1);assert.deepEqual(s,reference[i]);assert.ok(s.position[0]>=-.50001&&s.position[0]<=.50001);}
 assert.ok(reference.at(-1).contacts>=4);
 const impossible=config({planes:[{id:'a',normal:[1,0,0],distance:1},{id:'b',normal:[-1,0,0],distance:1}]});assert.equal(engine.sample(impossible,[0,0,0],[0,0,0],1,2).alive,false);
});
test('physics validates collider limits and bounds its numeric cache',()=>{
 for(const p of [config({radius:-1}),config({gravity:[0,NaN,0]}),config({planes:[{id:'a',normal:[0,0,0],distance:0}]}),config({maxBounces:33})])assert.throws(()=>P.validate(p));
 const engine=P.cache(),c=config({planes:[]});for(let i=0;i<1000;i++)engine.sample(c,[i,1,0],[0,0,0],.2,1);assert.equal(engine.size,256);engine.clear();assert.equal(engine.size,0);
});
