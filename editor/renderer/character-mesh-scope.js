/* Alpha support for editor overlays and picking on shared-topology layers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardCharacterMeshScope=api;})(typeof window==='object'?window:globalThis,()=>{
'use strict';
function create(pixels,width,height){
 const stride=width+1,sums=new Uint32Array(stride*(height+1));
 for(let y=0;y<height;y++){let row=0;for(let x=0;x<width;x++){row+=pixels[(y*width+x)*4+3]>8?1:0;sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+row;}}
 const visible=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&pixels[(Math.floor(y)*width+Math.floor(x))*4+3]>8;
 function occupied(x0,y0,x1,y1){const a=Math.max(0,Math.floor(x0)),b=Math.max(0,Math.floor(y0)),c=Math.min(width,Math.ceil(x1)+1),d=Math.min(height,Math.ceil(y1)+1);return a<c&&b<d&&sums[d*stride+c]-sums[b*stride+c]-sums[d*stride+a]+sums[b*stride+a]>0;}
 function indices(mesh,full=false,padding=12){return [...new Set(mesh.triangles)].filter(i=>full||occupied(mesh.uv[i*2]*width-padding,mesh.uv[i*2+1]*height-padding,mesh.uv[i*2]*width+padding,mesh.uv[i*2+1]*height+padding));}
 return {visible,occupied,indices};
}
return {create};
});
