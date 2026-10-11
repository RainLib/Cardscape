'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const storage=require('./workshop-storage.cjs'),workshops=require('../renderer/workshop-model.js');
function createEditorSession({runtimeDir,validate,write}){
 const root=path.join(runtimeDir,'editor-session'),file=path.join(root,'current.json'),assets=path.join(root,'assets');
 let token=null,sequence=0,queue=Promise.resolve(),cache=new Map();
 const hash=s=>createHash('sha256').update(s).digest('hex');
 async function expand(project){let nodes=0;async function walk(v,depth=0){if(++nodes>1000000||depth>40)throw Error('恢复记录结构过深');if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.hasOwn(v,'$blob')){const id=v.$blob;if(Object.keys(v).length!==1||typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('恢复素材引用无效');if(!cache.has(id)){const src=await fs.readFile(path.join(assets,id+'.txt'),'utf8');if(hash(src)!==id)throw Error('恢复素材摘要不匹配');cache.set(id,src);}return cache.get(id);}if(Array.isArray(v))return Promise.all(v.map(x=>walk(x,depth+1)));if(v&&typeof v==='object')return Object.fromEntries(await Promise.all(Object.entries(v).map(async([k,x])=>[k,await walk(x,depth+1)])));return v;}return walk(project);}
 async function recover(sourceFile=null){
  try{const record=JSON.parse(await fs.readFile(file,'utf8'));if(record.schema!=='card-editor-session/1')throw Error('恢复记录格式无效');
   if(sourceFile&&record.sourceFile!==path.resolve(sourceFile))return null;
   if(record.sourceFile){try{if((await fs.stat(record.sourceFile)).mtimeMs>record.at)return null;}catch(e){if(e.code!=='ENOENT')throw e;}}
   const value=await expand(record.project),result=value.schema==='card-workshop/1'?{workshop:workshops.validate(value,validate)}:{document:validate(value)};
   return {...result,sourceFile:record.sourceFile,recovery:{view:record.view,revision:record.revision,savedRevision:record.savedRevision,at:record.at}};
  }catch(e){if(e.code==='ENOENT')return null;return {recoveryError:e.message};}
 }
 return {
  start(){token=randomUUID();sequence=0;return token;},recover,
  save(args,sourceFile){const run=async()=>{
   if(args.token!==token)throw Error('编辑会话已切换，忽略旧恢复记录');
   if(!Number.isSafeInteger(args.sequence)||args.sequence<1)throw Error('恢复记录序号无效');if(args.sequence<=sequence)return {stale:true};
   if(!Number.isSafeInteger(args.revision)||!Number.isSafeInteger(args.savedRevision)||args.revision<0||args.savedRevision<0)throw Error('恢复记录版本无效');
   if(!args.project||!['card-workshop/1','card-atelier/1'].includes(args.project.schema))throw Error('恢复记录缺少工程');
   if(Buffer.byteLength(JSON.stringify(args.project))>16*1024*1024||Buffer.byteLength(JSON.stringify(args.view||{}))>16*1024)throw Error('恢复元数据过大');
   let bytes=0;for(const [id,src] of Object.entries(args.blobs||{})){if(!/^[a-f0-9]{64}$/.test(id)||typeof src!=='string'||!src.startsWith('data:')||hash(src)!==id)throw Error('恢复素材摘要不匹配');bytes+=Buffer.byteLength(src);if(bytes>storage.MAX_BYTES)throw Error('恢复素材超过 192 MB');await write(path.join(assets,id+'.txt'),src);cache.set(id,src);}
   const value=await expand(args.project);if(value.schema==='card-workshop/1')workshops.validate(value,validate);else validate(value);
   const at=Date.now(),record={schema:'card-editor-session/1',sourceFile:sourceFile?path.resolve(sourceFile):null,project:args.project,view:args.view,revision:args.revision,savedRevision:args.savedRevision,at};
   if(args.token!==token)throw Error('编辑会话已切换，忽略旧恢复记录');await write(file,JSON.stringify(record));sequence=args.sequence;
   return {at,sequence};
  };const pending=queue.then(run);queue=pending.catch(()=>{});return pending;}
 };
}
module.exports={createEditorSession};
