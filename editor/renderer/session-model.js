/* Incremental recovery snapshots: image bytes are sent once, metadata thereafter. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardSession=api;})(typeof window==='object'?window:this,()=>{
'use strict';
function encoder(){
 const ids=new Map(),sent=new Set();
 return async function encode(value){
  const sources=new Set();function collect(v){if(typeof v==='string'&&v.startsWith('data:'))sources.add(v);else if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object')Object.values(v).forEach(collect);}collect(value);
  const blobs={};
  await Promise.all([...sources].map(async src=>{let id=ids.get(src);if(!id){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(src));id=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');ids.set(src,id);}if(!sent.has(id))blobs[id]=src;}));
  function walk(v){if(typeof v==='string'&&ids.has(v))return {$blob:ids.get(v)};if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,walk(x)]));return v;}
  return {project:walk(value),blobs,ack(){Object.keys(blobs).forEach(id=>sent.add(id));}};
 };
}
return {encoder};
});
