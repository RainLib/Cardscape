// Independent GPU input: source game images remain in QA, never exported assets.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const R=require('../renderer/runtime-model.js'),K=require('../renderer/finish-catalog.js');
async function main(){
 const output=path.resolve('outputs/rays-v86'),prediction=JSON.parse(await fs.readFile(path.join(output,'geometry-prediction.json'))),version=require('../package.json').version;
 const sequence=process.argv.includes('--sequence');
 if(version!=='0.19.85')throw Error('This geometry experiment requires the recorded v85 baseline');
 const start=R.fragment.indexOf('// Shared procedural finish'),end=R.fragment.indexOf('\nfloat rimPath',start),shared=R.fragment.slice(start,end);
 if(start<0||end<0)throw Error('Production finish functions missing');
 const p=sequence?JSON.parse(await fs.readFile(path.join(output,'sequence-prediction.json'))).candidate:prediction.candidate;
 const recipe=K.value('material-purple-rays');
 const angular=sequence?Number((p.phaseRate/(p.count*recipe.speed)).toFixed(5)):0;
 const old='vec2 q=location-vec2(.35,.90);float r=length(q);\n float theta=atan(q.y,q.x)-r*1.10;\n float count=max(12.,floor(density*8.+.5));\n return vec2(smoothstep(-.06,.08,cos(theta*count)),theta);';
 const candidate=`vec2 q=location-vec2(${p.centerX.toFixed(5)},${p.centerY.toFixed(5)});float r=length(q);\n float theta=atan(q.y,q.x)-r*${p.twist.toFixed(5)}${sequence?'+ray_time*'+angular.toFixed(5):''};\n float count=max(12.,floor(density*${(p.count/4).toFixed(5)}+.5));\n return vec2(smoothstep(-.06,.08,cos(theta*count+${p.phase.toFixed(5)})),theta);`;
 if(!shared.includes(old))throw Error('Baseline ray function does not match');
 const shader=(body)=>'shader_type canvas_item;\nrender_mode unshaded;\nuniform float qa_clock=0.;\nuniform vec2 qa_view=vec2(0.);\nuniform vec3 qa_low;\nuniform vec3 qa_high;\n'+body+'\nvoid fragment(){vec3 result=finishColor(vec3(.18,.22,.3),UV,qa_clock*'+recipe.speed+',qa_view,14.,'+recipe.frequency+',qa_low,qa_high,true);COLOR=vec4(result,1.);}\n';
 let proposed=shared.replace(old,candidate);
 if(sequence)proposed=proposed.replace('vec2 finishRay(vec2 location,float density){','vec2 finishRay(vec2 location,float density,float ray_time){').replace('finishRay(p,density)','finishRay(p,density,finish_time)');
 const modes=[{id:'baseline',shader:shader(shared),parameters:prediction.baseline},{id:sequence?'animated':'candidate',shader:shader(proposed),parameters:{...p,...(sequence?{angularSpeed:angular}:{})}}];
 for(const mode of modes)mode.shaderSha256=createHash('sha256').update(mode.shader).digest('hex');
 const input={schema:'cardscape-rays-gpu-input/1',version,referenceSha256:prediction.sourceSha256,registration:prediction.registration,recipe,modes,frames:Array.from({length:77},(_,i)=>({index:i,time:Number((i*.03).toFixed(2)),view:[0,0]})),experimental:true,activeWorkshopEdited:false,accepted1to1:false};
 const file=path.join(output,sequence?'gpu-animated-input.json':'gpu-input.json');await fs.writeFile(file,JSON.stringify(input));console.log({output:file,version,frames:input.frames.length,modes:modes.length});
}
main().catch(e=>{console.error(e);process.exitCode=1;});
