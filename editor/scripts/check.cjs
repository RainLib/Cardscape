const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let count=0;
for(const dir of ['dist/electron','scripts','dist/renderer','tests']){
  if(!fs.existsSync(path.join(root,dir)))continue;
  for(const name of fs.readdirSync(path.join(root,dir)))if(/\.(cjs|mjs|js)$/.test(name)){
    execFileSync(process.execPath,['--check',path.join(root,dir,name)],{stdio:'inherit'});count++;
  }
}
console.log(`Syntax checks passed: ${count} files.`);
