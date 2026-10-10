const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createServices,ROOT}=require('../electron/services.cjs');

test('local object selection uses prompts, reuses image embeddings and validates coordinates',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-smart-')),s=createServices({runtimeDir:dir});
 try{
  const info=await s.invoke('smart-info');
  if(!info.available){t.skip('Install optional local model with npm run selection:setup');return;}
  assert.equal(info.local,true);assert.equal(info.device,'cpu');
  const image='data:image/png;base64,'+(await fs.readFile(path.join(ROOT,'assets/foreground.png'))).toString('base64');
  const prompt={image,points:[[180,440]],labels:[1],engine:'sam'};
  const first=await s.invoke('process',{op:'smart_selection',args:prompt});
  assert.equal(first.engine,'MobileSAM');assert.equal(first.embeddingCached,false);
  assert.deepEqual([first.width,first.height],[1024,1536]);
  assert.ok(first.activePixels>10000&&first.activePixels<400000,'cape selection must be a local region');
  assert.ok(first.score>.5);
  const repeat=await s.invoke('process',{op:'smart_selection',args:prompt});
  assert.equal(repeat.embeddingCached,true);assert.equal(repeat.image,first.image);
  const excluded=await s.invoke('process',{op:'smart_selection',args:{...prompt,points:[[180,440],[360,680]],labels:[1,0]}});
  assert.equal(excluded.embeddingCached,true);assert.ok(excluded.activePixels>0);
  const box=await s.invoke('process',{op:'smart_selection',args:{image,box:[550,740,1000,1280],engine:'sam'}});
  assert.equal(box.embeddingCached,true);assert.ok(box.activePixels>10000);
  const cut=await s.invoke('process',{op:'smart_selection',args:{image,box:[50,280,440,780],engine:'grabcut'}});
  assert.equal(cut.engine,'OpenCV GrabCut');assert.ok(cut.activePixels>0);
  await assert.rejects(s.invoke('process',{op:'smart_selection',args:{...prompt,points:[[1024,0]]}}),/图像内/);
  await assert.rejects(s.invoke('process',{op:'smart_selection',args:{...prompt,labels:[0]}}),/前景/);
  await assert.rejects(s.invoke('process',{op:'smart_selection',args:{...prompt,engine:'grabcut'}}),/拖框/);
 }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
