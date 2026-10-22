const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const S=require('../dist/renderer/spatial-model.js'),E=require('../dist/renderer/editor-commands.js'),{prepareAuthoring}=require('../dist/electron/authoring-service.cjs');
const document=()=>({id:'anatomy-test',spatial:{...S.defaults},layers:[{id:'body',name:'主体',kind:'foreground',spatial:{role:'body',z:.075,clip:false},visible:true},{id:'arm',name:'前手臂与握持组',kind:'image',splitSourceId:'body',spatial:{role:'front',z:.12,clip:false},visible:true}]});
test('depth audit is empty before a document opens and after returning home',()=>{
 const empty={schema:'card-character-depth-audit/1',spatialEnabled:false,characters:[],surfaces:[],occlusionPairs:[],issues:[],visualVerificationRequired:true};
 for(const d of [null,undefined,{}, {layers:[]}])assert.deepEqual(S.depthAudit(d),empty);
 const opened=S.depthAudit(document());assert.equal(opened.surfaces.length,2);
 assert.deepEqual(S.depthAudit(null),empty);
 assert.equal(S.depthAudit(document()).surfaces.length,2);
});
test('anatomical classification preserves rigid geometry and real depth, without altering the input',async()=>{
 const d=document(),before=JSON.stringify(d),result=await prepareAuthoring({document:d,documentToken:d.id,selected:'arm',commands:[{op:'characterPart',layerId:'arm',part:'arm',side:'right'}]},{validate:v=>{S.validate(v);return v;}}),arm=result.document.layers[1];
 assert.equal(JSON.stringify(d),before);assert.deepEqual(arm.anatomy,{schema:'card-character-part/1',part:'arm',side:'right'});assert.equal(arm.attachment.mode,'rigid');assert.equal(arm.attachment.motion,0);const link=S.connection(result.document,arm);assert.ok(Math.abs(link.z-link.parentZ-.025)<1e-8);assert.deepEqual(Array.from(S.attachmentWeights([.1,.1,.5,.7,.9,.9],null,null,64,{edge:'top',pin:200,release:1000},link.mode)),[1,1,1]);assert.equal(S.naturalAttachment(result.document,arm).motion,0);
 assert.equal(S.resolve(result.document,arm).registration,(2.7-link.z)/(2.7-.045));
 const p=[.1,.25,link.parentZ],q=[p[0]*S.resolve(result.document,arm).registration/S.resolve(result.document,d.layers[0]).registration,p[1]*S.resolve(result.document,arm).registration/S.resolve(result.document,d.layers[0]).registration,link.z];
 const front=S.project(p,0,0),partFront=S.project(q,0,0);assert.ok(Math.hypot(front[0]-partFront[0],front[1]-partFront[1])<1e-8);
 for(const [yaw,pitch] of [[.35,0],[-.35,0],[0,.2],[0,-.2],[.35,.2],[.35,-.2],[-.35,.2],[-.35,-.2]]){const a=S.project(p,yaw,pitch),b=S.project(q,yaw,pitch);assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>.0005);}
});
test('rigid parts reject wind and motion anchors atomically while cloth retains smooth root weights',async()=>{
 const d=document();S.classify(d,d.layers[1],{part:'wing',side:'left'});const before=JSON.stringify(d);
 for(const command of [{op:'attachment',layerId:'arm',motion:.5},{op:'attachment',layerId:'arm',mode:'cloth'},{op:'motionAnchor',layerId:'arm',root:[400,500],tip:[400,1200]}])await assert.rejects(prepareAuthoring({document:d,documentToken:d.id,commands:[command]},{validate:v=>{S.validate(v);return v;}}),/刚性|运动锚点/);
 assert.equal(JSON.stringify(d),before);S.classify(d,d.layers[1],{part:'cape'});assert.equal(S.connection(d,d.layers[1]).mode,'cloth');const w=S.attachmentWeights([.5,.1,.5,.5,.5,.9],null,null,64,{edge:'top',pin:400,release:900});assert.equal(w[0],0);assert.ok(w[1]>0&&w[1]<1);assert.equal(w[2],1);
});
test('depth audit reports metadata gaps without claiming invisible pixels are complete',()=>{
 const d=document(),audit=S.depthAudit(d);assert.equal(audit.visualVerificationRequired,true);assert.ok(audit.issues.some(i=>i.code==='hidden-support-unverified'));S.classify(d,d.layers[1],{part:'leg',side:'right'});d.layers[0].underpaint={filledPixels:500,jobId:'real-receipt'};const ready=S.depthAudit(JSON.parse(JSON.stringify(d)));assert.ok(!ready.issues.some(i=>i.code==='hidden-support-unverified'));assert.ok(ready.issues.some(i=>i.code==='hidden-support-review'&&i.layerId==='arm'));assert.equal(ready.surfaces[1].mode,'rigid');assert.equal(ready.visualVerificationRequired,true);d.layers=[d.layers[0]];assert.ok(S.depthAudit(d).issues.some(i=>i.code==='single-character-plane'));assert.deepEqual(S.depthAudit({layers:[]}).issues,[]);
});
test('character image references remain complete after parent backfill and retain bound occlusion context',()=>{
 const d=document(),body=d.layers[0],arm=d.layers[1];body.master='repaired-working-surface';body.underpaint={originalMaster:'complete-before-splitting',filledPixels:500};arm.master='partial-before-arm-extraction';S.classify(d,arm,{part:'arm',side:'right'});
 assert.equal(S.characterMaster(d,arm),'complete-before-splitting');assert.equal(S.characterMaster(d,body),'complete-before-splitting');assert.equal(S.characterMaster(d,{kind:'background'}),null);
 const context=S.imageContext(d,arm);assert.equal(context.part,'arm');assert.equal(context.role,'front');assert.equal(context.parentLayerId,'body');assert.ok(Math.abs(context.surfaces[1].z-.1)<1e-8);assert.deepEqual(S.validateImageContext(context,'arm'),context);
 for(const invalid of [{...context,layerId:'other'},{...context,part:'cape'},{...context,surfaces:[]},{...context,surfaces:[...context.surfaces,context.surfaces[0]]},{...context,extra:'unexpected'},{...context,surfaces:context.surfaces.map(p=>({...p,z:2}))}])assert.throws(()=>S.validateImageContext(invalid,'arm'),/人物图片任务/);
 assert.equal(S.imageContext(d,{kind:'text'}),null);assert.equal(S.validateImageContext(null,'arm'),null);assert.equal(body.master,'repaired-working-surface');
 d.spatial.enabled=false;const legacy=S.imageContext(d,arm);assert.equal(legacy.spatialEnabled,false);assert.ok(legacy.surfaces.every(p=>p.z===null));assert.deepEqual(S.validateImageContext(legacy,'arm'),legacy);
});
test('depth review checks each character and detects flat split surfaces without changing art',()=>{
 const d=document();d.layers.push({id:'second',name:'第二角色',kind:'image',spatial:{role:'body',z:.075,clip:false},visible:true});d.layers[1].spatial.z=.075;
 const original=JSON.stringify(d),audit=S.depthAudit(d);
 assert.deepEqual(audit.characters.map(c=>c.surfaceIds),[['body','arm'],['second']]);
 assert.ok(audit.issues.some(i=>i.code==='coplanar-character-parts'&&i.layerId==='body'));
 assert.ok(audit.issues.some(i=>i.code==='single-character-plane'&&i.layerId==='second'));
 assert.equal(JSON.stringify(d),original);assert.equal(audit.visualVerificationRequired,true);
 d.spatial.enabled=false;const legacy=S.depthAudit(d);assert.ok(legacy.issues.some(i=>i.code==='character-camera-disabled'&&i.layerId==='body'));assert.ok(legacy.characters.every(c=>c.depthRange===null));
 d.layers[1].visible=false;const hidden=S.depthAudit(d);assert.ok(hidden.issues.some(i=>i.code==='single-character-plane'&&i.layerId==='body'));
});
test('image tasks carry real slot depth, visibility and independent painter order with legacy compatibility',()=>{
 const d=document();d.layers.reverse();d.slots=[{id:'grip',z:-.2}];const arm=d.layers[0];arm.slotId='grip';arm.visible=false;S.classify(d,arm,{part:'forearm',side:'left'});
 const context=S.imageContext(d,arm),part=context.surfaces.find(p=>p.id===arm.id);
 assert.equal(part.visible,false);assert.equal(part.paintOrder,1);assert.equal(part.slotZ,-.2);assert.ok(Math.abs(part.z+.1)<1e-8);assert.deepEqual(S.validateImageContext(context,arm.id),context);
 const {occlusionPairs,...oldContext}=context,legacy={...oldContext,surfaces:context.surfaces.map(({visible,paintOrder,slotZ,...p})=>({...p,z:p.id===arm.id?.1:p.z}))};assert.deepEqual(S.validateImageContext(legacy,arm.id),legacy);
 for(const extra of [{paintOrder:-1},{paintOrder:64},{visible:'true'},{slotZ:1},{z:Infinity},{paintOrder:0}])assert.throws(()=>S.validateImageContext({...context,surfaces:context.surfaces.map(p=>p.id===arm.id?{...p,...extra}:p)},arm.id),/人物图片任务/);
 arm.visible=true;const audit=S.depthAudit(d);assert.ok(audit.issues.some(i=>i.code==='depth-role-conflict'&&i.layerId===arm.id));assert.ok(Math.abs(audit.surfaces.find(p=>p.id===arm.id).z+.055)<1e-8);
 // A Slot can put a valid surface beyond the ordinary +/- .4 role range.
 d.slots[0].z=.4;d.layers[1].spatial.z=.4;arm.spatial.z=.4;const offset=S.imageContext(d,arm);assert.ok(Math.abs(offset.surfaces[0].z-.8)<1e-8);S.validateImageContext(offset,arm.id);
});
test('authored limb occlusion checks painter order separately from depth and never modifies scene pixels',()=>{
 const d=document(),body=d.layers[0],near=d.layers[1];S.classify(d,near,{part:'forearm',side:'right'});
 const far={id:'far-wing',name:'左后翼',kind:'image',src:'same-wing-pixels',splitSourceId:'body',spatial:{role:'rear',z:.05,clip:false},anatomy:{schema:'card-character-part/1',part:'wing',side:'left'},attachment:{mode:'rigid',motion:0,maxOffset:.025,blendWidth:64}};
 d.layers=[near,body,far];const before=JSON.stringify(d),audit=S.depthAudit(d);
 assert.equal(JSON.stringify(d),before);assert.equal(audit.occlusionPairs.length,2);assert.ok(audit.occlusionPairs.every(p=>p.active&&p.painterMatches&&p.depthDelta>0));assert.ok(!audit.issues.some(i=>i.code==='painter-role-conflict'));
 assert.equal(audit.characters[0].partFamilies.arm[0].id,near.id);assert.equal(audit.characters[0].partFamilies.wing[0].id,far.id);assert.deepEqual(audit.characters[0].partFamilies.leg,[]);
 // Sorting alone may disagree with a correct camera depth. This is not auto-fixed.
 d.layers=[body,near,far];const bad=S.depthAudit(d);assert.ok(bad.issues.some(i=>i.code==='painter-role-conflict'&&i.layerId===near.id&&i.backId===body.id));assert.ok(!bad.issues.some(i=>i.code==='depth-role-conflict'));assert.ok(bad.occlusionPairs.find(p=>p.frontId===near.id).depthDelta>0);
 const context=S.imageContext(d,near);assert.deepEqual(S.validateImageContext(context,near.id),context);for(const mutate of [p=>({...p,painterMatches:true}),p=>({...p,backId:far.id}),p=>({...p,depthDelta:1}),p=>({...p,extra:true})])assert.throws(()=>S.validateImageContext({...context,occlusionPairs:context.occlusionPairs.map((p,i)=>i===0?mutate(p):p)},near.id),/遮挡关系/);
 far.visible=false;const hidden=S.imageContext(d,near);assert.equal(hidden.occlusionPairs.find(p=>p.backId===far.id).active,false);assert.deepEqual(S.depthAudit(d).characters[0].hiddenSurfaceIds,[far.id]);assert.ok(!S.depthAudit(d).surfaces.some(s=>s.id===far.id));
 d.spatial.enabled=false;const flat=S.imageContext(d,near);assert.ok(flat.occlusionPairs.every(p=>p.depthDelta===null));S.validateImageContext(flat,near.id);
});
test('character context recognises visible and hidden split images without including ordinary assets',()=>{
 const layers=[{id:'body',kind:'foreground'},{id:'cape',kind:'image',visible:false,splitSourceId:'body',spatial:{role:'rear',z:.02,clip:false}},{id:'background',kind:'image',spatial:{role:'far',z:-.1,clip:true}},{id:'title',kind:'image'},{id:'reference',kind:'image',previewReference:true,spatial:{role:'body',z:.1,clip:false}}];
 const check=id=>S.characterContextLayer({layer:layers.find(l=>l.id===id),document:{layers}});
 assert.equal(check('body'),true);assert.equal(check('cape'),true);assert.equal(check('background'),false);assert.equal(check('title'),false);assert.equal(check('reference'),false);assert.equal(S.characterContextLayer(null),false);
 assert.equal(S.characterContextLayer({layer:{id:'unknown',kind:'image'},document:{layers}}),false);
 assert.equal(S.characterContextLayer({layer:{id:'cape',kind:'image'},document:{characterDepth:{surfaces:[{id:'cape',role:'rear'}]}}}),true);
});
test('anatomy commands are bounded and skill is actually materialized into each client task',async()=>{
 E.validate([{op:'splitLayer',layerId:'body',newLayerId:'rear-wing',name:'后翅膀',role:'rear',part:'wing',side:'left',polygon:[[10,10],[50,10],[50,50]]}]);
 for(const c of [{op:'characterPart',layerId:'arm',part:'unknown'},{op:'characterPart',layerId:'arm',part:'arm',side:'screen-left'},{op:'attachment',layerId:'arm',mode:'rigid',motion:1},{op:'splitLayer',layerId:'body',newLayerId:'x',name:'x',role:'front',side:'left',polygon:[[0,0],[20,0],[20,20]]}])assert.throws(()=>E.validate([c]));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'anatomical-skill-'));try{const {materialize}=require('../dist/electron/production-skill.cjs'),first=await materialize(dir),second=await materialize(dir);assert.equal(first.sha256,second.sha256);const target=path.dirname(path.join(dir,first.entry)),skill=await fs.readFile(path.join(target,'SKILL.md'),'utf8'),reference=await fs.readFile(path.join(target,'references/anatomical-depth.md'),'utf8');assert.ok(skill.includes('references/anatomical-depth.md'));assert.ok(reference.includes('hidden-support-unverified'));assert.ok(reference.includes('前手臂'));}finally{await fs.rm(dir,{recursive:true,force:true});}
});
