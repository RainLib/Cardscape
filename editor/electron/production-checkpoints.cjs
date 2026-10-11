'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),storage=require('./workshop-storage.cjs');
function createCheckpoints({runtimeDir,validate,write}){
 const root=path.join(runtimeDir,'production-checkpoints');
 function files(id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('制作检查点 ID 无效');return {meta:path.join(root,id+'.json'),card:path.join(root,id+'.cardproj'),workshop:path.join(root,id+'.cardworkshop')};}
 async function info(id){try{return JSON.parse(await fs.readFile(files(id).meta,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 return {
  async save(args){
   const w=args.workshop?storage.unpack(args.workshop):null,doc=w?w.cards.find(c=>c.id===w.activeCardId)?.document:args.document;
   if(!doc)throw Error('检查点缺少当前卡片');validate(doc);const id=w?w.id:doc.id,f=files(id),file=w?f.workshop:f.card,text=w?storage.serialized(w,validate):JSON.stringify(doc);
   if(Buffer.byteLength(text)>storage.MAX_BYTES)throw Error('制作检查点超过 192 MB');
   const meta={id,file,name:w?w.name:doc.name,documentToken:doc.id,revision:doc.revision,at:new Date().toISOString()};await write(file,text);await write(f.meta,JSON.stringify(meta));return meta;
  },info,
  async open(id){const meta=await info(id);if(!meta)throw Error('没有可恢复的制作检查点');const f=files(id),file=meta.file===f.workshop?f.workshop:meta.file===f.card?f.card:null;if(!file)throw Error('制作检查点路径无效');return {...await storage.read(file,validate),checkpoint:meta};}
 };
}
module.exports={createCheckpoints};
