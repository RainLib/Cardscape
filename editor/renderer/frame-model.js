/* Shared outline, aperture and bevel geometry for 2D, WebGL and exported cards. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardFrame=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const defaults={name:'Snap 切角卡框',shape:'rect',width:24,corner:48,depth:26,bevel:5,color:'#88734f',accent:'#d4ba87',finish:'metal'};
const shapes=['rect'],finishes=['flat','metal','glow'];
// Read earlier projects without rewriting their source; every active frame is rectangular.
const legacyShapes=['rect','rounded','cut','arch','oval','circle'];
const resolve=doc=>({...defaults,...doc?.frameStyle,shape:'rect'});
function validateStyle(s){if(!s||typeof s!=='object'||Array.isArray(s)||typeof s.name!=='string'||!s.name.trim()||s.name.length>80||!legacyShapes.includes(s.shape)||!finishes.includes(s.finish)||![s.color,s.accent].every(c=>typeof c==='string'&&/^#[a-fA-F0-9]{6}$/.test(c))||![[s.width,4,100],[s.corner,0,300],[s.depth,8,180],[s.bevel,0,16]].every(([v,a,b])=>Number.isFinite(v)&&v>=a&&v<=b))throw Error('边框样式参数无效');}
function validate(doc){if(doc.frameStyle!==undefined)validateStyle(doc.frameStyle);if(doc.frameStyles!==undefined){if(!Array.isArray(doc.frameStyles)||doc.frameStyles.length>24)throw Error('边框样式数量超限');const ids=new Set();for(const s of doc.frameStyles){validateStyle(s);if(!/^[\w-]{1,100}$/.test(s.id)||ids.has(s.id))throw Error('边框样式 ID 无效');ids.add(s.id);}}}
// Coordinates are master-image pixels. Inner apertures are inset from the same outline.
function contains(style,x,y,inset=0){const cut=Math.max(0,style.corner-(2-Math.SQRT2)*inset),epsilon=1e-7;return x>=inset-epsilon&&x<=1024-inset+epsilon&&y>=inset-epsilon&&y<=1536-inset+epsilon&&Math.min(x+y,1024-x+y,x+1536-y,2560-x-y)>=2*inset+cut-epsilon;}
function contour(style,inset=0){const cut=Math.max(0,style.corner-(2-Math.SQRT2)*inset),l=inset,r=1024-inset,t=inset,b=1536-inset;return [[r,b-cut],[r-cut,b],[l+cut,b],[l,b-cut],[l,t+cut],[l+cut,t],[r-cut,t],[r,t+cut]];}
function path(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
function clip(ctx,style,inset=style.width){path(ctx,contour(style,inset));ctx.clip();}
function draw(ctx,style){const outer=contour(style),inner=contour(style,style.width);ctx.save();path(ctx,outer);inner.slice().reverse().forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
 let fill=style.color;if(style.finish!=='flat'){const g=ctx.createLinearGradient(0,0,1024,1536);g.addColorStop(0,style.accent);g.addColorStop(.28,style.color);g.addColorStop(.52,style.accent);g.addColorStop(.62,style.color);g.addColorStop(1,style.accent);fill=g;}ctx.fillStyle=fill;ctx.fill('evenodd');
 ctx.strokeStyle=style.accent;ctx.lineWidth=Math.max(1,Math.min(style.bevel,style.width/3));path(ctx,contour(style,Math.max(1,style.bevel/2)));ctx.stroke();path(ctx,contour(style,style.width-Math.max(1,style.bevel/2)));ctx.stroke();ctx.restore();}
function depths(style){const front=.045,back=front-style.depth/1024,inset=front-Math.min(style.depth/1024*.35,.04);return {front,back,inset,background:back+(inset-back)*.2};}
function geometry(style){const bevel=Math.min(style.bevel,style.width*.4),{front,back}=depths(style),outer=contour(style),top=contour(style,bevel),bottom=contour(style,style.width-bevel),inner=contour(style,style.width),rim={positions:[],uv:[],weights:[],indices:[]},sides={positions:[],uv:[],weights:[],indices:[]};
 function band(g,left,right,z0,z1,shade0,shade1){const start=g.positions.length/3;for(let i=0;i<left.length;i++){for(const [p,z,shade] of [[left[i],z0,shade0],[right[i],z1,shade1]]){g.positions.push(p[0]/1024-.5,.75-p[1]/1024,z);g.uv.push(p[0]/1024,p[1]/1536);g.weights.push(0,0,shade,0);}}for(let i=0;i<left.length;i++){const a=start+i*2,b=start+((i+1)%left.length)*2;g.indices.push(a,b,a+1,a+1,b,b+1);}}
 band(rim,outer,top,front-bevel/1024,front,.3,1);band(rim,top,bottom,front,front,.75,.75);band(rim,bottom,inner,front,front-bevel/1024,1,.3);
 band(sides,outer,outer,back,front-bevel/1024,.22,.5);band(sides,inner,inner,back,front-bevel/1024,.22,.5);const rear={...rim,positions:rim.positions.map((v,i)=>i%3===2?front+back-v:v)};return {rim,rear,sides,back,front};
}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
return {defaults,shapes,finishes,resolve,validate,contains,contour,path,clip,draw,geometry,depths,rgb};
});
