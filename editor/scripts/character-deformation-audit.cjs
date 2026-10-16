// Real asset audit: source topology, cut registration and rigid hand/gun regions.
const assert=require('node:assert/strict'),C=require('../renderer/character-animation-model.js'),R=require('../renderer/runtime-model.js');
function audit(doc){
 const meshes=doc.characterRig.meshes,layers=new Map(doc.layers.map(l=>[l.id,l])),grips=[{layer:'near-grip',points:[[258,329],[212,177]]},{layer:'far-grip',points:[[742,353],[838,311]]}];
 const placed=(layer,x,y)=>{const p=R.placement(doc,layer);return C.point(C.matrix(512+p.x,768+p.y,p.rotation*180/Math.PI,p.scale),x-512,y-768);};
 const at=(m,positions,x,y)=>{for(let i=0;i<m.triangles.length;i+=3){const ids=m.triangles.slice(i,i+3),v=ids.map(i=>[m.vertices[i*2],m.vertices[i*2+1]]),[a,b,c]=v,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]),u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,w=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;if(u<-.00001||w<-.00001||u+w>1.00001)continue;return [0,1,2].map(k=>positions[ids[0]*3+k]*u+positions[ids[1]*3+k]*w+positions[ids[2]*3+k]*(1-u-w));}throw Error('Grip point outside topology');};
 const result={samples:0,flippedTriangles:0,maxCutRegistrationPixelError:0,maxGripLengthPixelError:0};
 for(const a of doc.actions.filter(a=>a.id!=='flip'))for(let sample=0;sample<=48;sample++){
  const pose=C.sample(doc,a,a.duration*sample/48,{seek:true}),geometries=new Map();
  for(const m of meshes){const layer=layers.get(m.layerId),base=R.placement(doc,layer),g=C.geometry(doc,layer,pose,base);geometries.set(m.layerId,g.positions);
   for(let i=0;i<m.triangles.length;i+=3){const [a,b,c]=m.triangles.slice(i,i+3),source=(m.vertices[b*2]-m.vertices[a*2])*(m.vertices[c*2+1]-m.vertices[a*2+1])-(m.vertices[c*2]-m.vertices[a*2])*(m.vertices[b*2+1]-m.vertices[a*2+1]),area=(g.positions[b*3]-g.positions[a*3])*(g.positions[c*3+1]-g.positions[a*3+1])-(g.positions[c*3]-g.positions[a*3])*(g.positions[b*3+1]-g.positions[a*3+1]);if(source*area>=0)result.flippedTriangles++;}
  }
  const body=meshes.find(m=>m.layerId==='hero-body'),parent=geometries.get('hero-body');
  for(const m of meshes)for(let i=0;i<m.weights.length;i++){if(m.vertices[i*2+1]<400)continue;const own=geometries.get(m.layerId),p=placed(layers.get(m.layerId),512+own[i*3]*1024,768-own[i*3+1]*1024),q=placed(layers.get(body.layerId),512+parent[i*3]*1024,768-parent[i*3+1]*1024);result.maxCutRegistrationPixelError=Math.max(result.maxCutRegistrationPixelError,Math.hypot(p.x-q.x,p.y-q.y));}
  for(const grip of grips){const layer=layers.get(grip.layer),m=meshes.find(m=>m.layerId===grip.layer),points=grip.points.map(([x,y])=>{const p=at(m,geometries.get(grip.layer),x,y);return placed(layer,512+p[0]*1024,768-p[1]*1024);}),rest=grip.points.map(([x,y])=>placed(layer,x,y));result.maxGripLengthPixelError=Math.max(result.maxGripLengthPixelError,Math.abs(Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)-Math.hypot(rest[1].x-rest[0].x,rest[1].y-rest[0].y)));}
  result.samples++;
 }
 assert.equal(result.flippedTriangles,0);assert.ok(result.maxCutRegistrationPixelError<.01,JSON.stringify(result));assert.ok(result.maxGripLengthPixelError<.01,JSON.stringify(result));return result;
}
module.exports={audit};
