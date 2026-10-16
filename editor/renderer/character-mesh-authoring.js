/* Self-owned constrained mesh authoring. No runtime solver dependency.
 * Incremental fill keeps existing vertex IDs, UVs, weights and morph samples.
 * A requested edge is recovered by retriangulating only its crossed cavity. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./character-mesh-tools.js'),require('./character-animation-model.js'),require('./runtime-model.js'));else root.CardCharacterMeshAuthoring=factory(root.CardCharacterMeshTools,root.CardCharacterAnimation,root.CardRuntime);})(typeof window==='object'?window:globalThis,(U,C,R)=>{
'use strict';
const EPS=1e-7,at=(m,i)=>({x:m.vertices[i*2],y:m.vertices[i*2+1]}),key=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const record=m=>(m.topology||={pins:[],edges:[]});
function edges(m){const result=new Map();for(let j=0;j<m.triangles.length;j+=3)for(let k=0;k<3;k++){const a=m.triangles[j+k],b=m.triangles[j+(k+1)%3],id=key(a,b);if(!result.has(id))result.set(id,{a,b,count:0});result.get(id).count++;}return result;}
function onSegment(p,a,b){return Math.abs(cross(a,b,p))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;}
function intersects(a,b,c,d){const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);return x*y<-EPS&&z*w<-EPS||onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d);}
function pin(m,indices,enabled=true){const r=record(m),set=new Set(r.pins);for(const i of indices){if(!Number.isInteger(i)||i<0||i>=m.weights.length)throw Error('关键点索引无效');enabled?set.add(i):set.delete(i);}r.pins=[...set].sort((a,b)=>a-b);}
function budget(doc,group){const own=group.reduce((s,m)=>s+m.weights.length,0),total=(doc.characterRig.meshes||[]).reduce((s,m)=>s+m.weights.length,0);return Math.min(4096,Math.floor((16384-total+own)/Math.max(1,group.length)));}
function fill(m,{spacing=56,features=[],maxVertices=4096,region=null,accept=null}={}){
 if(!Number.isFinite(spacing)||spacing<8||spacing>256||!Number.isInteger(maxVertices)||maxVertices<3||maxVertices>4096)throw Error('补网间距或容量无效');
 if(region&&(!['circle','box'].includes(region.kind)||!['x','y',region.kind==='circle'?'radius':'width',...(region.kind==='box'?['height']:[])].every(k=>Number.isFinite(region[k]))||(region.kind==='circle'?region.radius<=0:region.width<=0||region.height<=0)))throw Error('局部加密区域无效');
 const n=m.weights.length,points=m.weights.map((_,i)=>at(m,i)),inside=p=>!region||(region.kind==='circle'?Math.hypot(p.x-region.x,p.y-region.y)<=region.radius:p.x>=region.x&&p.x<=region.x+region.width&&p.y>=region.y&&p.y<=region.y+region.height);
 let left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
 if(region){left=Math.max(left,region.kind==='circle'?region.x-region.radius:region.x);right=Math.min(right,region.kind==='circle'?region.x+region.radius:region.x+region.width);top=Math.max(top,region.kind==='circle'?region.y-region.radius:region.y);bottom=Math.min(bottom,region.kind==='circle'?region.y+region.radius:region.y+region.height);}
 if(right<=left||bottom<=top)return 0;
 const radius=p=>features.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<spacing*1.4)?spacing*.42:spacing;
 const cells=new Map(),size=spacing,cell=p=>[Math.floor(p.x/size),Math.floor(p.y/size)];
 function add(p){const [x,y]=cell(p),id=x+':'+y;if(!cells.has(id))cells.set(id,[]);cells.get(id).push(p);}
 points.forEach(add);
 // The domain is unchanged by incremental splits. Index its original triangles
 // once, so rejected candidates outside concavities never scan the whole mesh.
 const faces=new Map(),faceSize=96;
 for(let j=0;j<m.triangles.length;j+=3){const tri=m.triangles.slice(j,j+3).map(i=>points[i]);for(let y=Math.floor(Math.min(...tri.map(p=>p.y))/faceSize);y<=Math.floor(Math.max(...tri.map(p=>p.y))/faceSize);y++)for(let x=Math.floor(Math.min(...tri.map(p=>p.x))/faceSize);x<=Math.floor(Math.max(...tri.map(p=>p.x))/faceSize);x++){const id=x+':'+y;if(!faces.has(id))faces.set(id,[]);faces.get(id).push(tri);}}
 const inDomain=p=>(faces.get(Math.floor(p.x/faceSize)+':'+Math.floor(p.y/faceSize))||[]).some(tri=>U.bary(p,...tri)?.every(v=>v>=-EPS));
 function insert(p,force=false){if(m.weights.length>=maxVertices||!inside(p))return;const [x,y]=cell(p),r=radius(p)*.8;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const q of cells.get((x+dx)+':'+(y+dy))||[])if(Math.hypot(p.x-q.x,p.y-q.y)<(force?1e-4:Math.min(r,radius(q)*.8)))return;if(!inDomain(p))return;const undo=checkpoint(m),index=U.insert(m,p,{pin:false});if(accept&&!accept(m,index)){undo();return;}add(p);}
 features.forEach(p=>insert(p,true));
 const halton=(i,b)=>{let v=0,f=1;while(i){f/=b;v+=f*(i%b);i=Math.floor(i/b);}return v;};
 const attempts=Math.min(30000,Math.ceil((right-left)*(bottom-top)/spacing**2*36));
 for(let i=1;i<=attempts&&m.weights.length<maxVertices;i++)insert({x:left+(right-left)*halton(i,2),y:top+(bottom-top)*halton(i,3)});
 // Keep old diagonals too: adding detail must not alter unrelated deformation.
 return m.weights.length-n;
}
function checkpoint(m){const n=m.weights.length,triangles=m.triangles,topology=m.topology&&structuredClone(m.topology),morphs=m.morphs.map(v=>v.deltas.length);return ()=>{m.vertices.length=n*2;m.uv.length=n*2;m.weights.length=n;if(m.depths)m.depths.length=n;m.triangles=triangles;if(topology)m.topology=topology;else delete m.topology;m.morphs.forEach((v,i)=>v.deltas.length=morphs[i]);};}
function fillGroup(meshes,options){
 if(!meshes.length)return 0;const first=meshes[0],signature=JSON.stringify([first.vertices,first.uv,first.triangles]);if(meshes.some(m=>JSON.stringify([m.vertices,m.uv,m.triangles])!==signature))throw Error('同步补网需要相同拓扑');
 return fill(first,{...options,accept(m,index){const undos=[];if(options?.accept&&!options.accept(m,index))return false;const p=at(m,index);for(const other of meshes.slice(1)){undos.push(checkpoint(other));U.insert(other,p,{pin:false});if(options?.accept&&!options.accept(other,index)){undos.reverse().forEach(undo=>undo());return false;}}return true;}});
}
// Check the sampled existing motions, including IK and facial controls. This is
// an authoring guard, not a runtime constraint or a promise about future poses.
function quality(doc,meshes,{steps=24}={}){
 const poses=[];for(const action of doc.actions||[])if(action.id!=='flip'){const times=new Set(Array.from({length:steps+1},(_,i)=>i/steps));for(const field of ['boneTracks','ikTracks','expressionTracks','deformTracks','layerTracks'])for(const tracks of Object.values(action[field]||{}))for(const frames of Object.values(tracks))for(const frame of frames)times.add(frame.at);for(const t of [...times].sort((a,b)=>a-b))poses.push({pose:C.sample(doc,action,t*action.duration,{seek:true}),name:action.name,seconds:t*action.duration});}if(!poses.length)poses.push({pose:C.rest(doc),name:'初始姿势',seconds:0});
 const cache=new Map();for(const m of meshes){const layer=doc.layers.find(l=>l.id===m.layerId),base=R.placement(doc,layer);cache.set(m.layerId,{layer,base,frames:poses.map(({pose})=>Array.from(C.geometry(doc,layer,pose,base).positions))});}
 const accept=(m,index=null)=>{const entry=cache.get(m.layerId);let triangles=[];for(let j=0;j<m.triangles.length;j+=3){const ids=m.triangles.slice(j,j+3);if(index===null||ids.includes(index))triangles.push(ids);}const mini=index===null?null:{layerId:m.layerId,vertices:m.vertices.slice(index*2,index*2+2),weights:[m.weights[index]],uv:[],triangles:[],morphs:m.morphs.map(v=>{const j=v.deltas.length-3;return {expressionId:v.expressionId,deltas:v.deltas[j]===index?[0,v.deltas[j+1],v.deltas[j+2]]:[]};})};
  for(let f=0;f<poses.length;f++){const p=entry.frames[f];if(mini){const g=C.advanced.geometry({characterRig:{meshes:[mini]}},entry.layer,poses[f].pose,entry.base);for(let k=0;k<3;k++)p[index*3+k]=g.positions[k];}for(const [a,b,c] of triangles){const source=cross(at(m,a),at(m,b),at(m,c)),area=(p[b*3]-p[a*3])*(p[c*3+1]-p[a*3+1])-(p[c*3]-p[a*3])*(p[b*3+1]-p[a*3+1]);if(source*area>=-1e-12){accept.issue=`${poses[f].name} ${poses[f].seconds.toFixed(2)}s`;accept.rejected++;return false;}}}return true;
 };accept.rejected=0;accept.issue='';return accept;
}
function outline(points,{spacing=56,maxVertices=4096,boneId='root',features=[]}={}){
 if(!Array.isArray(points)||points.length<3||points.length>1024||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1024||p.y<0||p.y>1536))throw Error('轮廓需要 3–1024 个源图范围内的点');
 const n=points.length;
 for(let i=0;i<n;i++){if(Math.hypot(points[i].x-points[(i+1)%n].x,points[i].y-points[(i+1)%n].y)<.01)throw Error('轮廓包含重合点');for(let j=i+1;j<n;j++)if(j!==i+1&&!(i===0&&j===n-1)&&intersects(points[i],points[(i+1)%n],points[j],points[(j+1)%n]))throw Error('轮廓边不能交叉或相互接触，请调整描边点');}
 const m={vertices:points.flatMap(p=>[p.x,p.y]),uv:points.flatMap(p=>[p.x/1024,p.y/1536]),triangles:U.triangulate(points,points.map((_,i)=>i),{preserveVertices:true}),weights:points.map(()=>[{boneId,weight:1}]),morphs:[],topology:{pins:points.map((_,i)=>i),edges:[]}};
 if(!m.triangles.length)throw Error('轮廓不能共线');if(n>maxVertices)throw Error('轮廓点超出当前容量');fill(m,{spacing,maxVertices,features});U.legalize(m);return m;
}
function recover(m,a,b){
 if(edges(m).has(key(a,b)))return;
 const A=at(m,a),B=at(m,b),removed=new Set(),boundary=new Map();
 for(let j=0;j<m.triangles.length;j+=3){const ids=m.triangles.slice(j,j+3),points=ids.map(i=>at(m,i)),u=U.bary(A,...points),v=U.bary(B,...points);let lo=0,hi=1;
  for(let k=0;k<3;k++){const delta=v[k]-u[k];if(Math.abs(delta)<1e-12){if(u[k]<-EPS){hi=-1;break;}}else if(delta>0)lo=Math.max(lo,-u[k]/delta);else hi=Math.min(hi,-u[k]/delta);}
  if(hi-lo<EPS)continue;const t=(lo+hi)/2;if(u.some((x,k)=>x+(v[k]-x)*t<EPS))continue;
  removed.add(j);for(let k=0;k<3;k++){const x=ids[k],y=ids[(k+1)%3],id=key(x,y);if(boundary.has(id))boundary.delete(id);else boundary.set(id,[x,y]);}
 }
 const links=new Map();for(const [x,y] of boundary.values())for(const [u,v] of [[x,y],[y,x]]){if(!links.has(u))links.set(u,[]);links.get(u).push(v);}
 if(!removed.size||!links.has(a)||!links.has(b)||[...links.values()].some(v=>v.length!==2))throw Error('约束边穿过轮廓外部或无法安全连接');
 const chains=[];for(const start of links.get(a)){const chain=[a];let previous=a,current=start;while(current!==b&&chain.length<=links.size){chain.push(current);const next=links.get(current).find(i=>i!==previous);previous=current;current=next;}if(current!==b)throw Error('约束边无法形成有效邻域');chain.push(b);chains.push(chain);}
 if(new Set(chains.flat()).size!==links.size)throw Error('约束边穿过多个不连通区域');
 const points=m.weights.map((_,i)=>at(m,i)),triangles=[];for(const chain of chains)triangles.push(...U.triangulate(points,chain,{preserveVertices:true}));
 for(let j=0;j<m.triangles.length;j+=3)if(!removed.has(j))triangles.push(...m.triangles.slice(j,j+3));
 if(!edges({triangles}).has(key(a,b)))throw Error('约束边恢复失败');m.triangles=triangles;
}
function connect(m,a,b){
 if(![a,b].every(i=>Number.isInteger(i)&&i>=0&&i<m.weights.length)||a===b)throw Error('请选择两个不同的顶点');
 const next=structuredClone(m),r=record(next),A=at(m,a),B=at(m,b);
 const chain=m.weights.map((_,i)=>i).filter(i=>onSegment(at(m,i),A,B)).sort((i,j)=>Math.hypot(at(m,i).x-A.x,at(m,i).y-A.y)-Math.hypot(at(m,j).x-A.x,at(m,j).y-A.y));
 for(let i=0;i<chain.length-1;i++){const x=chain[i],y=chain[i+1];for(const [u,v] of r.edges)if(![x,y].includes(u)&&![x,y].includes(v)&&intersects(at(m,x),at(m,y),at(m,u),at(m,v)))throw Error('约束边不能相交，请先在交点加点');recover(next,x,y);if(!r.edges.some(e=>key(...e)===key(x,y)))r.edges.push([x,y]);}
 pin(next,chain);m.triangles=next.triangles;m.topology=next.topology;return chain;
}
function disconnect(m,a,b){const r=record(m),A=at(m,a),B=at(m,b);r.edges=r.edges.filter(([u,v])=>!(onSegment(at(m,u),A,B)&&onSegment(at(m,v),A,B)));}
return {edges,pin,budget,fill,fillGroup,quality,outline,connect,disconnect};
});
