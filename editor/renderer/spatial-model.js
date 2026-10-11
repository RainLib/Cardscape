/* Registered artwork shares one camera. Z is relative to the flat frame face. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardSpatial=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const roles={far:{name:'背景 · 远景',z:-.18,clip:true},mid:{name:'背景 · 中景',z:-.10,clip:true},near:{name:'环境 · 前景',z:-.02,clip:true},rear:{name:'人物 · 后部',z:.025,clip:false},body:{name:'人物 · 连续主体',z:.075,clip:false},front:{name:'人物 · 前部',z:.12,clip:false},title:{name:'图片字标',z:.20,clip:false},stat:{name:'数值徽章',z:.015,clip:false},surface:{name:'附加素材',z:.10,clip:true}};
const defaults={schema:'card-spatial/1',enabled:true,cameraDistance:2.7};
function enabled(d){return d?.spatial?.enabled===true;}
function camera(d){return enabled(d)?d.spatial.cameraDistance??2.7:2.7;}
function role(l){return l?.spatial?.role||(l?.kind==='foreground'?'body':l?.kind==='background'?'far':l?.titleArt?'title':['cost','power','stat-cost','stat-power'].includes(l?.role)?'stat':'surface');}
function character(l){return l?.kind==='foreground'||['rear','body','front'].includes(l?.spatial?.role);}
function background(l){return l?.kind==='background'||['background-candidate','baseplate'].includes(l?.role)||['far','mid','near'].includes(l?.spatial?.role);}
function connection(d,l){const parent=enabled(d)&&l?.splitSourceId?d.layers?.find(p=>p.id===l.splitSourceId&&p.kind==='foreground'):null;if(!parent)return null;const maxOffset=l.attachment?.maxOffset??.025,blendWidth=l.attachment?.blendWidth??64,parentZ=.045+(parent.spatial?.z??roles.body.z),requested=.045+(l.spatial?.z??roles[role(l)].z);return {parent,parentZ,z:parentZ+Math.max(-maxOffset,Math.min(maxOffset,requested-parentZ)),maxOffset,blendWidth,anchor:l.attachment?.anchor,motion:l.attachment?.motion};}
function resolve(d,l){const preset=roles[role(l)]||roles.surface,link=connection(d,l),requestedZ=.045+(l?.spatial?.z??preset.z),z=link?.z??requestedZ;return {role:role(l),z,requestedZ,relativeZ:z-.045,clip:l?.spatial?.clip??preset.clip,registration:enabled(d)?(camera(d)-z)/(camera(d)-.045):1};}
// Distance from INTERNAL cut boundaries. Silhouette edges remain free.
// This compact CPU field is rebuilt only when ownership/coverage changes.
function attachmentWeights(uv,ownership,coverage,blendWidth=64,anchor){
 const result=new Float32Array(uv.length/2).fill(1);
 // An explicit cloth root does not pin the hem or side edges just because
 // hidden backing now occupies those pixels. Coordinates are source pixels.
 if(anchor&&anchor.edge!=='boundary'){for(let i=0;i<result.length;i++){const x=uv[i*2]*1024,y=uv[i*2+1]*1536,value={top:y,bottom:1536-y,left:x,right:1024-x}[anchor.edge],t=Math.max(0,Math.min(1,(value-anchor.pin)/(anchor.release-anchor.pin)));result[i]=t*t*(3-2*t);}return result;}
 if(!ownership||!coverage)return result;
 const w=128,h=192,n=w*h,inside=new Uint8Array(n),solid=new Uint8Array(n),distance=new Float32Array(n).fill(1e6);
 const sample=(im,x,y)=>{const px=Math.round(x/(w-1)*(im.width-1)),py=Math.round(y/(h-1)*(im.height-1));return im.data[(py*im.width+px)*4]/255;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;inside[i]=sample(ownership,x,y)>.35;solid[i]=sample(coverage,x,y)>.35;}
 let seeds=0;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!inside[i])continue;if([i-1,i+1,i-w,i+w].some(j=>solid[j]&&!inside[j])){distance[i]=0;seeds++;}}
 if(!seeds)return result;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;distance[i]=Math.min(distance[i],x?distance[i-1]+1:1e6,y?distance[i-w]+1:1e6);}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;distance[i]=Math.min(distance[i],x<w-1?distance[i+1]+1:1e6,y<h-1?distance[i+w]+1:1e6);}
 for(let i=0;i<result.length;i++){const x=Math.max(0,Math.min(w-1,Math.round(uv[i*2]*(w-1)))),y=Math.max(0,Math.min(h-1,Math.round(uv[i*2+1]*(h-1))));const t=Math.min(1,distance[y*w+x]*8/blendWidth);result[i]=t*t*(3-2*t);}
 return result;
}
function extent(l,size){const r=l?.sourceWindow;if(!r)return [1,1];if(!size&&l.src?.startsWith('data:image/png;base64,')){try{const b=atob(l.src.slice(22,54)),read=o=>(b.charCodeAt(o)*16777216+b.charCodeAt(o+1)*65536+b.charCodeAt(o+2)*256+b.charCodeAt(o+3));size=[read(16),read(20)];}catch{}}return [(size?.[0]??r.width+2*r.x)/r.width,(size?.[1]??r.height+2*r.y)/r.height];}
function set(d,l,value){if(!l||l.kind==='frame')throw Error('卡框保持固定空间平面');d.spatial={...defaults,...d.spatial,enabled:true};const name=value.role||role(l),preset=roles[name];if(!preset)throw Error('空间角色无效');l.spatial={role:name,z:value.z??preset.z,clip:value.clip??preset.clip};validate(d);}
function validateAttachment(a){if(!Number.isFinite(a.maxOffset)||a.maxOffset<.001||a.maxOffset>.15||!Number.isFinite(a.blendWidth)||a.blendWidth<16||a.blendWidth>192)throw Error('人物连接参数无效');if(a.anchor){const n=a.anchor,limit=['left','right'].includes(n.edge)?1024:1536;if(!['top','bottom','left','right','boundary'].includes(n.edge)||n.edge!=='boundary'&&(!Number.isFinite(n.pin)||!Number.isFinite(n.release)||n.pin<0||n.release>limit||n.release-n.pin<16))throw Error('衣料根部范围无效');}if(a.motion!==undefined&&(!Number.isFinite(a.motion)||a.motion<0||a.motion>2))throw Error('衣料运动强度无效');}
function validate(d){if(d.spatial){const s=d.spatial;if(s.schema!=='card-spatial/1'||typeof s.enabled!=='boolean'||!Number.isFinite(s.cameraDistance)||s.cameraDistance<2.2||s.cameraDistance>4)throw Error('空间相机参数无效');}for(const l of d.layers||[]){if(l.attachment){if(!l.splitSourceId||!d.layers.some(p=>p.id===l.splitSourceId&&p.kind==='foreground'))throw Error('人物连接参数无效');validateAttachment(l.attachment);}if(!l.spatial)continue;const s=l.spatial;if(l.kind==='frame'||!roles[s.role]||!Number.isFinite(s.z)||s.z<-.4||s.z>.4||typeof s.clip!=='boolean')throw Error('图层空间参数无效');if(['rear','front'].includes(s.role)&&l.kind!=='image')throw Error('人物前后部需要独立图片层');}}
function project(point,yaw,pitch,d=2.7){let [x,y,z]=point;const c=Math.cos(yaw),s=Math.sin(yaw),a=Math.cos(pitch),b=Math.sin(pitch);[x,z]=[c*x+s*z,-s*x+c*z];[y,z]=[a*y-b*z,b*y+a*z];return [x/(d-z),y/(d-z)];}
return {roles,defaults,enabled,camera,role,character,background,resolve,extent,set,validate,validateAttachment,project,connection,attachmentWeights};
});
