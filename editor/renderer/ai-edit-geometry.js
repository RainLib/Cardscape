(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AIEditGeometry=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 function outputSize(width,height,padding){
  if(!Array.isArray(padding)||padding.length!==4||padding.some(n=>!Number.isInteger(n)||n<0||n>1024))throw Error('每侧扩展范围为 0–1024 px');
  const w=width+padding[0]+padding[2],h=height+padding[1]+padding[3];
  if(w>8192||h>8192||w*h>16777216)throw Error('扩图超过 16 MP 预算，请缩小扩展范围');
  return {width:w,height:h};
 }
 function layout(viewWidth,viewHeight,width,height,padding=[0,0,0,0],zoom=1,pan={x:0,y:0}){
  const size=outputSize(width,height,padding),scale=Math.max(.001,Math.min(Math.max(1,viewWidth-64)/size.width,Math.max(1,viewHeight-64)/size.height))*zoom;
  const x=(viewWidth-size.width*scale)/2+pan.x,y=(viewHeight-size.height*scale)/2+pan.y;
  return {x,y,scale,width:size.width*scale,height:size.height*scale,sourceX:x+padding[0]*scale,sourceY:y+padding[1]*scale};
 }
 function sourcePoint(point,layout){return {x:(point.x-layout.sourceX)/layout.scale,y:(point.y-layout.sourceY)/layout.scale};}
 function handles(box){const x=box.x,y=box.y,r=x+box.width,b=y+box.height,mx=(x+r)/2,my=(y+b)/2;return [{id:'nw',x,y},{id:'n',x:mx,y},{id:'ne',x:r,y},{id:'e',x:r,y:my},{id:'se',x:r,y:b},{id:'s',x:mx,y:b},{id:'sw',x,y:b},{id:'w',x,y:my}];}
 function hitHandle(point,box){return handles(box).find(h=>Math.abs(point.x-h.x)<=11&&Math.abs(point.y-h.y)<=11)?.id||null;}
 function dragPadding(padding,handle,dx,dy,scale,width,height){
  const next=[...padding],x=Math.round(dx/scale),y=Math.round(dy/scale),limit=n=>Math.max(0,Math.min(1024,n));
  if(handle.includes('w'))next[0]=limit(next[0]-x);if(handle.includes('n'))next[1]=limit(next[1]-y);
  if(handle.includes('e'))next[2]=limit(next[2]+x);if(handle.includes('s'))next[3]=limit(next[3]+y);
  outputSize(width,height,next);return next;
 }
 function tiles(bounds,width,height,size=128){
  const x0=Math.max(0,Math.floor(bounds.x)),y0=Math.max(0,Math.floor(bounds.y)),x1=Math.min(width,Math.ceil(bounds.x+bounds.width)),y1=Math.min(height,Math.ceil(bounds.y+bounds.height)),result=[];
  if(x1<=x0||y1<=y0)return result;
  for(let y=Math.floor(y0/size)*size;y<y1;y+=size)for(let x=Math.floor(x0/size)*size;x<x1;x+=size)result.push({x,y,width:Math.min(size,width-x),height:Math.min(size,height-y)});
  return result;
 }
 return {outputSize,layout,sourcePoint,handles,hitHandle,dragPadding,tiles};
});
