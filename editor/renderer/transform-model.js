/* Visual bounds and anchored uniform scaling. Registered artwork stays intact. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardTransform=api;})(typeof window==='object'?window:this,()=>{
'use strict';
function alphaBounds(alpha,width=1024,height=1536){let x0=width,y0=height,x1=0,y1=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(alpha[y*width+x]>10){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}return x1>x0&&y1>y0?{x:x0,y:y0,w:x1-x0,h:y1-y0}:null;}
function world(point,placement){const x=(point.x-512)*placement.scale,y=(point.y-768)*placement.scale,c=Math.cos(placement.rotation||0),s=Math.sin(placement.rotation||0);return {x:512+placement.x+c*x-s*y,y:768+placement.y+s*x+c*y};}
function corners(bounds,placement){return [[bounds.x,bounds.y],[bounds.x+bounds.w,bounds.y],[bounds.x+bounds.w,bounds.y+bounds.h],[bounds.x,bounds.y+bounds.h]].map(([x,y])=>world({x,y},placement));}
function scaleAt(layer,placement,anchor,scale){scale=Math.max(.01,Math.min(10,scale));const fixed=world(anchor,placement),after=world(anchor,{...placement,scale:placement.scale*scale/layer.scale});return {scale,x:layer.x+fixed.x-after.x,y:layer.y+fixed.y-after.y};}
function dragScale(layer,placement,bounds,corner,pointer){const points=corners(bounds,placement),anchor=points[(corner+2)%4],start=points[corner],dx=start.x-anchor.x,dy=start.y-anchor.y,factor=((pointer.x-anchor.x)*dx+(pointer.y-anchor.y)*dy)/Math.max(1,dx*dx+dy*dy),local=[[bounds.x,bounds.y],[bounds.x+bounds.w,bounds.y],[bounds.x+bounds.w,bounds.y+bounds.h],[bounds.x,bounds.y+bounds.h]][(corner+2)%4];return scaleAt(layer,placement,{x:local[0],y:local[1]},layer.scale*factor);}
return {alphaBounds,world,corners,scaleAt,dragScale};
});
