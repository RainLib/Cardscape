/* Shared visual components. All distances are card-local units (width = 1). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardComponents=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const materialDefaults={schema:'card-material/1',enabled:false,style:'iridescent',target:'both',strength:.3,speed:.25,frequency:4,color:'#78cfff',accent:'#fa8dde'};
const particleDefaults={schema:'card-particles/1',enabled:false,count:64,lifetime:3,speed:.25,spread:.5,size:.012,color:'#ffcb79',seed:1,z:-.08};
const imageStyles=['environment','texture','foil','pattern','illustration'];
const range=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b,color=x=>/^#[a-fA-F0-9]{6}$/.test(x);
function material(v={}){return {...materialDefaults,...v};}
function particles(v={}){return {...particleDefaults,...v};}
function validateMaterial(v){if(!v||v.schema!=='card-material/1'||typeof v.enabled!=='boolean'||!['iridescent','holographic'].includes(v.style)||!['background','back','both'].includes(v.target)||!range(v.strength,0,1)||!range(v.speed,0,3)||!range(v.frequency,1,20)||!color(v.color)||!color(v.accent))throw Error('幻彩材质组件参数无效');}
function validateParticles(v){if(!v||v.schema!=='card-particles/1'||typeof v.enabled!=='boolean'||!Number.isInteger(v.count)||!range(v.count,1,256)||!range(v.lifetime,.3,12)||!range(v.speed,0,2)||!range(v.spread,0,2)||!range(v.size,.002,.08)||!color(v.color)||!Number.isInteger(v.seed)||!range(v.seed,1,65535)||!range(v.z,-.5,-.03))throw Error('卡后粒子组件参数无效');}
function adjustments(a={},b={}){return {brightness:Math.max(-100,Math.min(100,(a.brightness||0)+(b.brightness||0))),contrast:Math.max(-100,Math.min(100,((1+(a.contrast||0)/100)*(1+(b.contrast||0)/100)-1)*100)),saturation:Math.min(200,(a.saturation??100)*(b.saturation??100)/100),gamma:Math.max(.2,Math.min(3,(a.gamma??1)*(b.gamma??1)))};}
function validate(doc){if(doc.material)validateMaterial(doc.material);if(doc.particles)validateParticles(doc.particles);}
function hash(i,seed){const x=Math.sin((i+1)*127.1+seed*311.7)*43758.5453;return x-Math.floor(x);}
function sample(value,time){const p=particles(value);if(!p.enabled)return [];const result=[];for(let i=0;i<p.count;i++){const r=hash(i,p.seed),phase=((Math.max(0,time)/p.lifetime+r)%1),edge=hash(i+379,p.seed)*4;let x,y,dx,dy;if(edge<1){x=(edge-.5);y=.75;dx=x*.8;dy=1;}else if(edge<2){x=.5;y=.75-(edge-1)*1.5;dx=1;dy=y*.5;}else if(edge<3){x=.5-(edge-2);y=-.75;dx=x*.8;dy=-1;}else{x=-.5;y=-.75+(edge-3)*1.5;dx=-1;dy=y*.5;}const length=Math.hypot(dx,dy),distance=phase*(p.spread+p.speed*p.lifetime);result.push({x:x+dx/length*distance,y:y+dy/length*distance,z:p.z,size:p.size*(.5+.5*r)*(1-.55*phase),alpha:Math.sin(Math.PI*phase)**2});}return result;}
return {materialDefaults,particleDefaults,imageStyles,material,particles,validateMaterial,validateParticles,validate,adjustments,sample};
});
