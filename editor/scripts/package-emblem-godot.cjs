// Preserve actual PNG bytes; do not synthesize pixels from CPU samples.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
async function main(){
 const [sampleFile,captureDirectory,mode,logFile,output]=process.argv.slice(2);
 if(!output||!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(mode||''))throw Error('Usage: node package-emblem-godot.cjs SAMPLES CAPTURE_DIRECTORY MODE GPU_LOG OUTPUT');
 const inputBytes=await fs.readFile(sampleFile),input=JSON.parse(inputBytes),meta=JSON.parse(await fs.readFile(path.join(captureDirectory,mode+'-metadata.json'),'utf8')),log=await fs.readFile(logFile,'utf8');
 if(!/"status":"passed"/.test(log)||/^(?:SHADER ERROR|SCRIPT ERROR|ERROR):/m.test(log))throw Error('A successful actual GPU run is required');
 if(input.schema!=='cardscape-emblem-qa-samples/1'||input.frames.length!==77||meta.frames!==77||meta.version!==input.version||meta.profile?.id!==input.growthProfile?.id)throw Error('Capture and samples do not match');
 const frames=[];
 for(let index=0;index<input.frames.length;index++){
  const png=await fs.readFile(path.join(captureDirectory,mode,String(index).padStart(3,'0')+'.png'));
  if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==820||png.readUInt32BE(20)!==1000)throw Error('Expected an actual 820 x 1000 PNG');
  frames.push({time:input.frames[index].time,count:input.frames[index].count,png:'data:image/png;base64,'+png.toString('base64')});
 }
 const registration={cameraDistance:2.7,rootScale:1.23,rootY:-.06,cardFront:.045};
 registration.cardWidthPixels=1000*1.45*Math.min(1,.82/.85)*registration.rootScale/(registration.cameraDistance-registration.cardFront*registration.rootScale);
 const result={schema:'cardscape-gpu-emblem-frames/1',version:input.version,renderer:meta.renderer,experimental:!!input.growthProfile,runtimeSamplerVerified:false,registration,config:input.config,growthProfile:input.growthProfile,accepted1to1:false,provenance:{samples:sampleFile,samplesSha256:createHash('sha256').update(inputBytes).digest('hex'),captureDirectory,log:logFile},frames};
 await fs.writeFile(output,JSON.stringify(result));console.log(JSON.stringify({output,frames:frames.length,renderer:result.renderer,profile:result.growthProfile?.id||'baseline',runtimeSamplerVerified:false}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
