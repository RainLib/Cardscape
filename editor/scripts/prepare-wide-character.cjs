// Prepare a new offline card with real generated hidden support. Never edits
// the input project or an active editor document. Import/open the output in UI.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),{NativeWorker}=require('../dist/electron/native-client.cjs'),Fixture=require('./wide-character-fixture.cjs'),Audit=require('../dist/renderer/character-motion-audit.js');
async function main(){
 const [sourceFile,candidateFile,outputDirectory,generationId]=process.argv.slice(2);if(!outputDirectory)throw Error('Usage: node scripts/prepare-wide-character.cjs SOURCE_CARD GENERATED_TORSO_PNG OUTPUT_DIRECTORY [GENERATION_ID]');
 const dir=path.resolve(outputDirectory),project=path.join(dir,'大幅抬枪与提腿.cardproj');if(project===path.resolve(sourceFile))throw Error('Output must differ from the source project');
 const source=JSON.parse(await fs.readFile(sourceFile)),candidateBytes=await fs.readFile(candidateFile),candidate='data:image/png;base64,'+candidateBytes.toString('base64'),body=source.layers.find(l=>l.id==='hero-body');if(!body)throw Error('Missing registered torso');
 await fs.mkdir(dir,{recursive:true});const worker=new NativeWorker(),receipts=[];let image=body.src,addedMask=null,filledPixels=0;
 try{for(const {part,polygon,registration}of [{part:'near-grip',polygon:[[320,310],[480,310],[495,475],[395,520],[315,440]],registration:{scale:.8,x:95,y:20}},{part:'near-leg',polygon:[[465,570],[730,570],[775,790],[690,915],[470,870],[430,700]],registration:{scale:.88,x:55,y:-40}}]){
  const coverage=(await worker.call('image_channel',{image:source.layers.find(l=>l.id===part).src,channel:'alpha'})).image,region=(await worker.call('selection',{image,points:polygon,magnetic:false,feather:0})).image,mask=(await worker.call('mask_combine',{image:region,selection:region,coverage,mode:'replace',value:1})).image,result=await worker.call('underpaint',{image,candidate,mask,preserve_visible:true,registration});
  image=result.image;filledPixels+=result.filled_pixels;addedMask=addedMask?(await worker.call('mask_combine',{image:addedMask,selection:result.addedMask,mode:'add',value:1})).image:result.addedMask;receipts.push({part,polygon,registration,filledPixels:result.filled_pixels});
 }}finally{worker.close();}
 if(!filledPixels)throw Error('Generated support did not add any missing pixels');
 const result=Fixture.prepare(source,{support:{image,candidate:image,mask:addedMask,addedMask,filledPixels,jobId:generationId}}),audit=Audit.audit(result.document,result.action,{fps:120});if(!audit.ok)throw Error('Motion requires repair: '+JSON.stringify(audit));
 await fs.writeFile(project,JSON.stringify(result.document));await fs.writeFile(path.join(dir,'deformation-audit.json'),JSON.stringify(audit,null,2));await fs.writeFile(path.join(dir,'mesh-preparation.json'),JSON.stringify(result.summary,null,2));await fs.writeFile(path.join(dir,'support-receipts.json'),JSON.stringify({candidateSha256:createHash('sha256').update(candidateBytes).digest('hex'),generationId:generationId||null,preserveEveryExistingVisiblePixel:true,receipts},null,2));console.log(JSON.stringify({project,action:result.action.id,filledPixels,audit},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
