'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const key=value=>createHash('sha256').update(value).digest('hex');
function createRecentProjects({runtimeDir,write,session}){
 const index=path.join(runtimeDir,'recent-projects.json');let queue=Promise.resolve();
 async function read(){try{if((await fs.stat(index)).size>8*1024*1024)return [];const value=JSON.parse(await fs.readFile(index,'utf8'));return value.version===1&&Array.isArray(value.entries)?value.entries.filter(e=>typeof e.id==='string'&&typeof e.projectId==='string'&&Array.isArray(e.cards)).slice(0,16):[];}catch{return [];}}
 async function thumbnail(value){if(value?.$blob&&/^[a-f0-9]{64}$/.test(value.$blob)){try{const file=path.join(runtimeDir,'editor-session/assets',value.$blob+'.txt');if((await fs.stat(file)).size>128*1024)return '';const src=await fs.readFile(file,'utf8');return key(src)===value.$blob?thumbnail(src):'';}catch{return '';}}return typeof value==='string'&&value.length<=128*1024&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)?value:'';}
 async function record(project,file,at=Date.now(),dirty=false){
  const run=async()=>{
   const projectId=project.id||'single',source=file?path.resolve(file):null,id=key(source||'draft:'+projectId);
   const cards=project.schema==='card-workshop/1'?project.cards:[{id:project.id||'single',name:project.name,thumbnail:project.thumbnail}];
   const entry={id,projectId,file:source,name:String(project.name||'未命名工程').slice(0,200),kind:project.schema==='card-workshop/1'?'workshop':'card',activeCardId:project.activeCardId||cards[0]?.id,at,dirty,cards:await Promise.all(cards.slice(0,64).map(async c=>({id:c.id,name:String(c.name||'未命名卡片').slice(0,200),thumbnail:await thumbnail(c.thumbnail)})))};
   const entries=[entry,...(await read()).filter(e=>e.id!==id&&!(e.projectId===projectId&&!e.file))].slice(0,16);
   for(let i=entries.length-1;Buffer.byteLength(JSON.stringify(entries))>4*1024*1024&&i>=0;i--)for(const c of entries[i].cards)c.thumbnail='';
   await write(index,JSON.stringify({version:1,entries}));return entry;
  };const pending=queue.then(run);queue=pending.catch(()=>{});return pending;
 }
 async function list(initialFile=null){
  await queue;const meta=await session.metadata();
  if(meta?.project){let newer=false;if(meta.sourceFile)try{newer=(await fs.stat(meta.sourceFile)).mtimeMs>meta.at;}catch{}if(!newer)await record(meta.project,meta.sourceFile,meta.at,meta.revision!==meta.savedRevision);}
  const entries=await read();let files=[];try{files=(await fs.readdir(path.join(runtimeDir,'projects'))).filter(f=>/\.(cardproj|cardworkshop)$/.test(f)).map(f=>path.join(runtimeDir,'projects',f));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(initialFile)files.unshift(path.resolve(initialFile));
  for(const file of new Set(files)){if(entries.some(e=>e.file===file))continue;const stat=await fs.stat(file).catch(()=>null);if(!stat)continue;entries.push({id:key(file),projectId:'',file,name:path.basename(file).replace(/\.(cardproj|cardworkshop)$/,''),kind:'project',at:stat.mtimeMs,cards:[]});}
  return Promise.all(entries.sort((a,b)=>b.at-a.at).slice(0,24).map(async e=>({...e,available:!!(e.file&&await fs.stat(e.file).catch(()=>null))||!!(meta?.project&&(meta.project.id||'single')===e.projectId&&(!e.file||meta.sourceFile===e.file))||!!(e.projectId&&await session.hasRecent(e.projectId,e.file))})));
 }
 return {record,list};
}
module.exports={createRecentProjects};
