'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const name='card-atelier',files=['SKILL.md','references/questions.md','references/production.md','references/spatial-depth.md','agents/openai.yaml'];
async function materialize(directory){
 const source=path.resolve(__dirname,'../skills',name),relative=path.join('.agents','skills',name),hash=createHash('sha256');
 for(const file of files){const content=await fs.readFile(path.join(source,file));hash.update(file).update(content);const target=path.join(directory,relative,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content);}
 return {name,entry:path.join(relative,'SKILL.md'),sha256:hash.digest('hex')};
}
module.exports={materialize};
