// Read-only source coverage for QA mesh culling. No raster is edited or saved.
const {inflateSync}=require('node:zlib');
function decode(source){
 const bytes=Buffer.from(source.split(',')[1],'base64'),chunks=[];let width,height,channels,color,offset=8;
 while(offset<bytes.length){const n=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+n);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);color=data[9];channels={0:1,2:3,4:2,6:4}[color];if(data[8]!==8||!channels||data[12]!==0||width!==1024||height!==1536)throw Error('Real-art QA requires registered noninterlaced 8-bit PNGs');}if(type==='IDAT')chunks.push(data);offset+=n+12;}
 const stride=width*channels,raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*height}),pixels=Buffer.alloc(stride*height);
 function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,left=x>=channels?pixels[i-channels]:0,up=y?pixels[i-stride]:0,corner=y&&x>=channels?pixels[i-stride-channels]:0;pixels[i]=(raw[y*(stride+1)+x+1]+(filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner)))&255;}}
 return {width,height,channels,color,pixels};
}
function alpha(source){const image=decode(source),values=new Uint8Array(image.width*image.height);for(let i=0;i<values.length;i++)values[i]=[4,6].includes(image.color)?image.pixels[i*image.channels+image.channels-1]:255;return values;}
function imageData(source){const image=decode(source),data=new Uint8Array(image.width*image.height*4);for(let i=0;i<image.width*image.height;i++){data[i*4]=image.pixels[i*image.channels];data[i*4+1]=data[i*4+2]=data[i*4];data[i*4+3]=255;}return {width:image.width,height:image.height,data};
}
function occupied(layers){
 const coverage=new Uint8Array(1024*1536);for(const layer of layers){const values=alpha(layer.src);for(let i=0;i<coverage.length;i++)if(values[i])coverage[i]=1;}
 const stride=1025,integral=new Uint32Array(stride*1537);for(let y=0;y<1536;y++){let row=0;for(let x=0;x<1024;x++){row+=coverage[y*1024+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;}}
 return (x0,y0,x1,y1)=>{x0=Math.max(0,Math.floor(x0));y0=Math.max(0,Math.floor(y0));x1=Math.min(1024,Math.ceil(x1)+1);y1=Math.min(1536,Math.ceil(y1)+1);return integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0]>0;};
}
module.exports={occupied,imageData,alpha};
