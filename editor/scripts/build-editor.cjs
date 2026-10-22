// Compatibility entry point; the build is maintained in TypeScript.
const {spawnSync}=require('node:child_process');
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{cwd:require('node:path').resolve(__dirname,'..'),stdio:'inherit',shell:process.platform==='win32'});
process.exitCode=result.status??1;
