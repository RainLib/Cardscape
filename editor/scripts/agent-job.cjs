#!/usr/bin/env node
// Portable handoff helper. Copies only a supplied PNG into the selected task.
const fs=require('node:fs/promises'),path=require('node:path');
async function main(){
 const [command,directory,image]=process.argv.slice(2);
 if(!directory||!['inspect','complete'].includes(command)||(command==='complete'&&!image)){console.error('Usage: node scripts/agent-job.cjs inspect <job-directory>\n       node scripts/agent-job.cjs complete <job-directory> <output.png>');process.exitCode=2;return;}
 const dir=await fs.realpath(directory),contract=JSON.parse(await fs.readFile(path.join(dir,'contract.json'),'utf8'));
 if(contract.schema!=='card-atelier-agent/1')throw Error('Unsupported task contract');
 if(command==='inspect'){console.log(JSON.stringify(contract,null,2));return;}
 const data=await fs.readFile(image);if(data.length<24||data.length>24*1024*1024||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Expected PNG under 24 MB');
 if(data.readUInt32BE(16)!==contract.output.width||data.readUInt32BE(20)!==contract.output.height)throw Error('Output size must be '+contract.output.width+' x '+contract.output.height);
 await fs.mkdir(path.join(dir,'output'),{recursive:true});await fs.writeFile(path.join(dir,'output/result.png'),data);
 const file=path.join(dir,'result.json'),tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify({status:'completed',image:'output/result.png',message:'External agent image delivered'},null,2));await fs.rename(tmp,file);
 console.log('Image delivered. Click 收取 result.json in Card Atelier to preview and apply.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
