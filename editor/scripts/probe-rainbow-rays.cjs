// Public reference pixels are QA only; candidate uses continuous math, no textures.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const R=require('../renderer/runtime-model.js');
const root=path.resolve('outputs/rays-v87');
const shared=fragment=>{const start=fragment.indexOf('// Shared procedural finish'),end=fragment.indexOf('\nfloat rimPath',start);if(start<0||end<0)throw Error('Shared finish boundary missing');return fragment.slice(start,end);};
async function main(){
 const baseline=JSON.parse(await fs.readFile(path.join(root,'baseline.json'))),g=JSON.parse(await fs.readFile(path.join(root,'geometry-prediction.json')));
 if(baseline.version!=='0.19.86')throw Error('Wrong recorded baseline');
 const production=process.argv.includes('--production'),colors=process.argv.includes('--colors'),eased=process.argv.includes('--eased'),p=g.candidate,recipe=baseline.recipe;
 let angular=Number((p.phaseRate/(p.count*recipe.speed)).toFixed(5));
 let rotation='ray_time*'+angular.toFixed(5),phase=p.phase;
 if(eased){const v=JSON.parse(await fs.readFile(path.join(root,'eased-phase-prediction.json'))).candidate;angular=Number((v.rate/(p.count*recipe.speed)).toFixed(5));rotation=`ray_time*${angular.toFixed(5)}+${(v.amplitude/p.count).toFixed(5)}*sin(ray_time*${(v.frequency/recipe.speed).toFixed(5)}+${v.start.toFixed(5)})`;phase=v.offset;}
 const helper=`vec2 finishRainbowRay(vec2 location,float density,float ray_time){\n vec2 q=(location-vec2(${p.centerX.toFixed(5)},${p.centerY.toFixed(5)}))*vec2(1.,${(p.yScale||1).toFixed(5)});float r=length(q);\n float theta=atan(q.y,q.x)-pow(r,${(p.radiusExponent||1).toFixed(5)})*${p.twist.toFixed(5)}+${rotation};\n float count=max(12.,floor(density*${(p.count/recipe.frequency).toFixed(5)}+.5));\n return vec2(smoothstep(-.06,.08,cos(theta*count+${phase.toFixed(5)})),theta);\n}\n`;
 let body=shared(baseline.fragment);
 body=body.replace('float finishFrost',helper+'float finishFrost').replace('vec2 ray=style>28.5?finishRayMotion(p,density,finish_time):finishRay(p,density);','vec2 ray=style>28.5?finishRayMotion(p,density,finish_time):style>26.5?finishRainbowRay(p,density,finish_time):finishRay(p,density);');
 if(colors){
  const color=JSON.parse(await fs.readFile(path.join(root,'color-prediction.json')));
  const start=body.indexOf('   float film=ray.y*.70'),end=body.indexOf('\n  }',start);
  if(start<0||end<0)throw Error('Rainbow color boundary missing');
  body=body.slice(0,start)+color.shaderBody+body.slice(end);
  // New ribbon model includes silver; do not re-apply the legacy silver band.
  body=body.replace('  ribbon=mix(ribbon,vec3(.9,.95,.98),silver*.68);','  if(!(style>26.5&&style<27.5))ribbon=mix(ribbon,vec3(.9,.95,.98),silver*.68);');
 }
 const wrap=text=>'shader_type canvas_item;\nrender_mode unshaded;\nuniform float qa_clock=0.;\nuniform vec2 qa_view=vec2(0.);\nuniform vec3 qa_low;\nuniform vec3 qa_high;\n'+text+'\nvoid fragment(){COLOR=vec4(finishColor(vec3(.18,.22,.3),UV,qa_clock*'+recipe.speed+',qa_view,27.,'+recipe.frequency+',qa_low,qa_high,true),1.);}\n';
 const parameters={...p,angularSpeed:angular,...(eased?{easing:JSON.parse(await fs.readFile(path.join(root,'eased-phase-prediction.json'))).candidate}:{})};
 const modes=production?[{id:'production',shader:wrap(shared(R.fragment)),parameters}]:[{id:'baseline',shader:wrap(shared(baseline.fragment)),parameters:g.baseline},{id:eased?'eased':colors?'colored':'geometry',shader:wrap(body),parameters}];
 for(const m of modes)m.shaderSha256=createHash('sha256').update(m.shader).digest('hex');
 const input={schema:'cardscape-rays-gpu-input/1',version:require('../package.json').version,referenceSha256:g.sourceSha256,registration:g.registration,recipe,modes,frames:Array.from({length:77},(_,i)=>({index:i,time:Number((i*.03).toFixed(2)),view:[0,0]})),experimental:!production,activeWorkshopEdited:false,accepted1to1:false};
 const file=path.join(root,production?'gpu-production-input.json':eased?'gpu-eased-input.json':colors?'gpu-color-input.json':'gpu-geometry-input.json');
 await fs.writeFile(file,JSON.stringify(input));
 console.log({input:file,modes:modes.length,frames:77,angularSpeed:angular});
}
main().catch(error=>{console.error(error);process.exitCode=1;});
