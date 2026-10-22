const {test}=require('node:test'),assert=require('node:assert/strict');
const region=require('../dist/renderer/preview-region.js'),spatial=require('../dist/renderer/spatial-model.js'),runtime=require('../dist/renderer/runtime-model.js'),space=require('../dist/renderer/space-model.js');
function card(){return {spatial:{...spatial.defaults},layers:[{id:'body',name:'body',kind:'foreground',x:0,y:-19,scale:1.12,spatial:{role:'body',z:.07,clip:false}},{id:'skirt',kind:'image',splitSourceId:'body',x:0,y:-20,scale:1.12,spatial:{role:'front',z:.17,clip:false},attachment:{maxOffset:.1,blendWidth:96,anchor:{edge:'top',pin:870,release:1130},motion:.35}},{id:'title',kind:'text'},{id:'other',kind:'foreground'}]};}
test('shared mother regions follow split surfaces but never unrelated artwork',()=>{
 const d=card(),[body,cloth,title,other]=d.layers,before=structuredClone(d);
 for(const mode of ['mask','selection']){const state={mode,layerId:'body',map:{}};assert.equal(region.pass(d,body,state),2);assert.equal(region.pass(d,cloth,state),2);assert.equal(region.pass(d,title,state),0);assert.equal(region.pass(d,other,state),0);assert.equal(region.pass(d,cloth,{...state,map:null}),0);}
 assert.equal(region.pass(d,cloth,{mode:'layer',layerId:'body'}),0);assert.equal(region.pass(d,cloth,{mode:'layer',layerId:'skirt'}),1);
 assert.equal(region.pass(d,body,{mode:'connection',layerId:'body'}),0);assert.equal(region.pass(d,cloth,{mode:'connection',layerId:'skirt'}),3);
 assert.equal(region.pass(d,cloth,{mode:'channels',layerId:'body'}),4);assert.equal(region.pass(d,title,{mode:'channels',layerId:'title'}),0);assert.equal(region.pass(d,cloth,{mode:'none',layerId:'skirt'}),0);assert.deepEqual(d,before);
});
test('natural cloth preserves the root and underpaint while reducing visible hem separation',()=>{
 const d=card(),l=d.layers[1],before=structuredClone(l),old=space.clothGeometry(d,l);l.attachment=spatial.naturalAttachment(d,l);const next=space.clothGeometry(d,l);
 assert.equal(l.attachment.maxOffset,.04);assert.equal(l.attachment.motion,.25);assert.deepEqual(l.attachment.anchor,before.attachment.anchor);assert.equal(l.attachment.blendWidth,96);
 // First row is the fixed root, last row is the free hem, on the actual mesh.
 assert.deepEqual(next.positions.slice(0,3),old.positions.slice(0,3));
 const base=spatial.connection(d,l).parentZ,oldZ=old.positions.at(-1),newZ=next.positions.at(-1);assert.ok(Math.abs(newZ-base)<Math.abs(oldZ-base));
 for(const yaw of [-.49,.49])for(const pitch of [-.31,.31]){const parent=spatial.project([0,-.7,base],yaw,pitch),a=spatial.project([0,-.7,oldZ],yaw,pitch),b=spatial.project([0,-.7,newZ],yaw,pitch);assert.ok(Math.hypot(b[0]-parent[0],b[1]-parent[1])<Math.hypot(a[0]-parent[0],a[1]-parent[1]));}
 l.attachment.maxOffset=.012;l.attachment.motion=.1;assert.equal(spatial.naturalAttachment(d,l).maxOffset,.012);assert.equal(spatial.naturalAttachment(d,l).motion,.1);
});
test('editor highlight shaders are opt in and portable GLSL stays free of inspection samplers',()=>{
 const v=runtime.vertex(),f=runtime.fragmentSource();assert.doesNotMatch(v,/connectionWeight/);assert.doesNotMatch(f,/regionTex|regionMode/);
 const editorV=runtime.vertex(undefined,true),editorF=runtime.fragmentSource(undefined,true);assert.match(editorV,/connectionWeight=weight/);assert.match(editorF,/texture2D\(regionTex,v\)/);assert.ok(editorF.indexOf('if(c.a<.015)discard')<editorF.indexOf('if(regionMode>.5)'));assert.ok(editorF.indexOf('if(customEffect>.5)')<editorF.indexOf('if(regionMode>.5)'));
});
