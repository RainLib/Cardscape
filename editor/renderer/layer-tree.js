/* Folder metadata owns authoring order, never creates an extra render surface. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardLayers=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const idOK=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const leaf=id=>({type:'layer',id});
function walk(nodes,fn,parent=null,depth=0){for(const n of nodes){fn(n,parent,depth);if(n.type==='group')walk(n.children,fn,n,depth+1);}}
function ids(node){return node.type==='layer'?[node.id]:node.children.flatMap(ids);}
function find(tree,id){let result;walk(tree,(node,parent,depth)=>{if(node.id===id)result={node,parent,depth,siblings:parent?parent.children:tree};});return result;}
function validate(doc){
 if(doc.layerTree===undefined)return;
 if(!Array.isArray(doc.layerTree))throw Error('图层分组格式无效');
 const layers=new Set(doc.layers.map(l=>l.id)),seen=new Set();let groups=0;
 walk(doc.layerTree,(n,parent,depth)=>{
  if(!n||!idOK(n.id)||seen.has(n.id)||depth>7)throw Error('图层分组引用重复、过深或无效');seen.add(n.id);
  if(n.type==='layer'){if(!layers.has(n.id)||Object.keys(n).some(k=>!['type','id'].includes(k)))throw Error('分组引用了不存在的图层');}
  else if(n.type==='group'){if(layers.has(n.id)||++groups>64||!Array.isArray(n.children)||typeof n.name!=='string'||!n.name.trim()||n.name.length>200||Object.keys(n).some(k=>!['type','id','name','children'].includes(k)))throw Error('图层组无效');}
  else throw Error('图层分组类型无效');
 });
}
function ensure(doc){
 const layerIDs=new Set(doc.layers.map(l=>l.id));
 if(!doc.layerTree)return doc;
 // Deleting/adding an image elsewhere in the editor reconciles with folders.
 const prune=nodes=>nodes.filter(n=>n.type==='group'||layerIDs.has(n.id)).map(n=>n.type==='group'?{...n,children:prune(n.children)}:{...n});
 doc.layerTree=prune(doc.layerTree);validate(doc);
 const known=new Set();walk(doc.layerTree,n=>{if(n.type==='layer')known.add(n.id);});
 for(let i=doc.layers.length-1;i>=0;i--){const l=doc.layers[i];if(known.has(l.id))continue;const following=doc.layers.slice(i+1).map(x=>find(doc.layerTree,x.id)).find(Boolean);if(following)following.siblings.splice(following.siblings.indexOf(following.node),0,leaf(l.id));else doc.layerTree.push(leaf(l.id));known.add(l.id);}
 const byID=new Map(doc.layers.map(l=>[l.id,l]));doc.layers=doc.layerTree.flatMap(ids).map(id=>byID.get(id));return doc;
}
function tree(doc){ensure(doc);return doc.layerTree||doc.layers.map(l=>leaf(l.id));}
function writable(doc,node){for(const id of ids(node)){const l=doc.layers.find(l=>l.id===id);if(l?.locked)throw Error('图层已锁定：'+l.name+'；请先解锁后排序');}}
function move(doc,nodeIDs,targetID,position='before'){
 if(!['before','after','inside'].includes(position)||!Array.isArray(nodeIDs)||!nodeIDs.length)throw Error('拖动目标无效');
 doc.layerTree=tree(doc);const destination=find(doc.layerTree,targetID);if(!destination)throw Error('目标图层或组已不存在');
 const requested=new Set(nodeIDs),moving=[];walk(doc.layerTree,n=>{if(requested.has(n.id))moving.push(n);});
 if(moving.length!==requested.size)throw Error('拖动图层已不存在');
 const descendants=new Set();for(const n of moving)if(n.type==='group')walk(n.children,c=>descendants.add(c.id));
 const nodes=moving.filter(n=>!descendants.has(n.id));
 if(nodes.some(n=>n.id===targetID||n.type==='group'&&find(n.children,targetID)))throw Error('不能将图层组放入自身或子组');
 if(position==='inside'&&destination.node.type!=='group')throw Error('只有图层组可接收图层');
 for(const n of nodes)writable(doc,n);
 for(const n of nodes){const f=find(doc.layerTree,n.id);f.siblings.splice(f.siblings.indexOf(f.node),1);}
 const target=find(doc.layerTree,targetID),siblings=position==='inside'?target.node.children:target.siblings,index=position==='inside'?siblings.length:siblings.indexOf(target.node)+(position==='after'?1:0);
 siblings.splice(index,0,...nodes);ensure(doc);return nodes.flatMap(ids);
}
function group(doc,layerIDs,name,id){
 if(!idOK(id)||doc.layers.some(l=>l.id===id)||find(tree(doc),id))throw Error('图层组 ID 无效或重复');
 if(typeof name!=='string'||!name.trim()||name.length>200)throw Error('请输入图层组名称');
 if(!Array.isArray(layerIDs)||!layerIDs.length||new Set(layerIDs).size!==layerIDs.length||layerIDs.some(id=>!doc.layers.some(l=>l.id===id)))throw Error('请选择需要分组的图层');
 doc.layerTree=tree(doc);const selected=new Set(layerIDs),ordered=doc.layers.filter(l=>selected.has(l.id)).map(l=>l.id),first=find(doc.layerTree,ordered[0]),siblings=first.siblings,index=siblings.indexOf(first.node);
 for(const id of ordered){const f=find(doc.layerTree,id);f.siblings.splice(f.siblings.indexOf(f.node),1);}
 siblings.splice(index,0,{type:'group',id,name:name.trim(),children:ordered.map(leaf)});ensure(doc);return id;
}
function ungroup(doc,id){doc.layerTree=tree(doc);const f=find(doc.layerTree,id);if(f?.node.type!=='group')throw Error('请选择图层组');const members=ids(f.node);f.siblings.splice(f.siblings.indexOf(f.node),1,...f.node.children);ensure(doc);return members;}
function rename(doc,id,name){const f=find(tree(doc),id);if(f?.node.type!=='group'||typeof name!=='string'||!name.trim()||name.length>200)throw Error('图层组名称无效');f.node.name=name.trim();}
function moveRoot(doc,nodeIDs){doc.layerTree=tree(doc);const requested=new Set(nodeIDs),moving=[];walk(doc.layerTree,n=>{if(requested.has(n.id))moving.push(n);});if(moving.length!==requested.size)throw Error('拖动图层已不存在');const children=new Set();for(const n of moving)if(n.type==='group')walk(n.children,c=>children.add(c.id));const nodes=moving.filter(n=>!children.has(n.id));for(const n of nodes)writable(doc,n);for(const n of nodes){const f=find(doc.layerTree,n.id);f.siblings.splice(f.siblings.indexOf(f.node),1);}doc.layerTree.push(...nodes);ensure(doc);return nodes.flatMap(ids);}
function reorder(doc,layerID,index){if(!Number.isInteger(index)||index<0||index>=doc.layers.length)throw Error('目标顺序超过图层数量');const original=doc.layers.findIndex(l=>l.id===layerID);if(original<0)throw Error('图层已不存在');if(index===original)return;const target=doc.layers[index];move(doc,[layerID],target.id,index<original?'before':'after');}
return {tree,find,ids,walk,validate,ensure,move,moveRoot,group,ungroup,rename,reorder};
});
