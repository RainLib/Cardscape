(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardWorkshopTabs=api;})(typeof window==='undefined'?globalThis:window,()=>{
'use strict';
const ids=cards=>cards.map(c=>c.id),unique=list=>[...new Set(list)],validList=list=>Array.isArray(list)&&list.length<=64&&list.every(x=>typeof x==='string');
function normalize(saved,cards){
 const all=ids(cards),valid=new Set(all);
 if(!saved||saved.version!==1||!['known','open','pinned','closed'].every(k=>validList(saved[k])))saved={version:1,known:all,open:all,pinned:[],closed:[]};
 const clean=list=>unique(list).filter(id=>valid.has(id)),known=clean(saved.known);
 const open=unique([...clean(saved.open),...all.filter(id=>!known.includes(id))]),pinned=clean(saved.pinned).filter(id=>open.includes(id));
 return {version:1,known:all,open:[...open.filter(id=>pinned.includes(id)),...open.filter(id=>!pinned.includes(id))],pinned,closed:clean(saved.closed).filter(id=>!open.includes(id))};
}
function open(state,id){if(!state.known.includes(id))return state;return {...state,open:unique([...state.open,id]),closed:state.closed.filter(x=>x!==id)};}
function pin(state,id){if(!state.open.includes(id))return state;const pinned=state.pinned.includes(id)?state.pinned.filter(x=>x!==id):[...state.pinned,id];return {...state,pinned,open:[...state.open.filter(x=>pinned.includes(x)),...state.open.filter(x=>!pinned.includes(x))]};}
function restoredActive(state,current,preferred){return state.open.includes(current)?current:state.open.includes(preferred)?preferred:state.open[0]||null;}
function candidates(state,id,action){
 const i=state.open.indexOf(id);if(i<0)return [];
 const list=action==='left'?state.open.slice(0,i):action==='right'?state.open.slice(i+1):action==='others'?state.open.filter(x=>x!==id):action==='all'?state.open:action==='one'?[id]:[];
 return action==='one'?list:list.filter(x=>!state.pinned.includes(x));
}
function close(state,id,action,activeId){
 const removed=candidates(state,id,action),remaining=state.open.filter(x=>!removed.includes(x)),index=state.open.indexOf(activeId);
 const next={...state,open:remaining,pinned:state.pinned.filter(x=>remaining.includes(x)),closed:unique([...state.closed.filter(x=>!removed.includes(x)),...removed]).slice(-64)};
 const active=remaining.includes(activeId)?activeId:state.open.slice(index+1).find(x=>remaining.includes(x))||state.open.slice(0,index).reverse().find(x=>remaining.includes(x))||remaining[0]||null;
 return {state:next,activeId:active,removed};
}
return {normalize,open,pin,candidates,close,restoredActive};
});
