/* Decode complete texture batches before swapping. A newer zoom or locale wins;
 * failed/stale loads keep the last complete frame and cannot reset animation. */

const api = (()=>{
'use strict';
function create({entries,load,apply,status=()=>{}}: any){let generation=0,disposed=false,current=null,desired=null;const pending=new Map<any, any>();
 const image=src=>{if(!pending.has(src)){const p=Promise.resolve().then(()=>load(src));pending.set(src,p);p.finally(()=>{if(pending.get(src)===p)pending.delete(src);}).catch(()=>{});}return pending.get(src);};
 async function set(level){if(disposed||desired===level)return;desired=level;const token=++generation;status({level,current,loading:true});const tasks=entries(),results=new Array(tasks.length),decoded=new Map<any, any>();const batchImage=src=>{if(!decoded.has(src))decoded.set(src,image(src));return decoded.get(src);};let cursor=0;
  try{await Promise.all(Array.from({length:Math.min(4,tasks.length)},async()=>{while(cursor<tasks.length){const i=cursor++,e=tasks[i],variant=e.variants?.[level]||e.variants?.large||{asset:e.asset};results[i]={entry:e,variant,image:await batchImage(variant.asset)};if(disposed||token!==generation)return;}}));if(disposed||token!==generation)return;apply(results,level);current=level;if(token===generation)status({level,current,loading:false});}
  catch(error){if(disposed||token!==generation)return;desired=null;status({level,current,loading:false,error:error.message});if(current===null)throw error;}
 }
 return {set,get current(){return current;},dispose(){disposed=true;generation++;pending.clear();}};
}
return {create};
})();

export default api;
