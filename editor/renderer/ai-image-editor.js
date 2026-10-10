/* Source-space mask painting and expansion; these drafts never alter the card. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),G=window.AIEditGeometry,canvas=$('ai-source-canvas'),ctx=canvas.getContext('2d');
 const mask=document.createElement('canvas'),mc=mask.getContext('2d',{willReadFrequently:true}),tint=document.createElement('canvas'),tc=tint.getContext('2d');
 const fields=['ai-left','ai-top','ai-right','ai-bottom'];
 let image=null,source=null,mode='edit',readOnly=false,tool='paint',zoom=1,pan={x:0,y:0},gesture=null,cursor=null,space=false,pixels=0,loadId=0,frame=0,overlayDirty=true;
 let padding=[128,128,128,128],history={mask:{undo:[],redo:[]},padding:{undo:[],redo:[]}};
 const loadImage=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('源图或选区无法读取'));im.src=src;});
 const currentHistory=()=>history[mode==='outpaint'?'padding':'mask'];
 function fieldValues(){if(fields.some(id=>$(id).value===''||!$(id).validity.valid))throw Error('请输入 0–1024 的整数扩展像素');return fields.map(id=>Number($(id).value));}
 function state(){let error=null,size=null;try{if(image){size=G.outputSize(image.width,image.height,mode==='outpaint'?padding:[0,0,0,0]);if(mode==='outpaint')G.outputSize(image.width,image.height,fieldValues());}}catch(e){error=e.message;}return {ready:!!image&&!gesture,hasMask:pixels>0,pixels,width:image?.width,height:image?.height,padding:[...padding],size,error};}
 function notify(){updateControls();window.atelierAI?.draftChanged();}
 function updateControls(){
  const h=currentHistory(),editing=!readOnly&&!!image;
  $('ai-source-tools').hidden=mode!=='inpaint';$('ai-expansion-tools').hidden=mode!=='outpaint';
  for(const b of document.querySelectorAll('[data-ai-source-tool]')){b.classList.toggle('active',tool===b.dataset.aiSourceTool);b.setAttribute('aria-pressed',String(tool===b.dataset.aiSourceTool));b.disabled=!editing;}
  $('ai-mask-undo').disabled=!editing||!h.undo.length;$('ai-mask-redo').disabled=!editing||!h.redo.length;
  $('ai-mask-clear').disabled=!editing||!pixels;$('ai-padding-reset').disabled=!editing;
  for(const id of ['ai-mask-size','ai-mask-feather','ai-mask-import'])$(id).disabled=!editing;
  const s=state();$('ai-source-instruction').textContent=readOnly?'任务源图已固定，创建新任务后可继续编辑':mode==='inpaint'?'在原图上涂抹粉色区域，再在下方描述修改；Alt 临时擦除，空格拖动，滚轮缩放':mode==='outpaint'?'拖动蓝色边界或角点扩画；原图位置固定，下面可输入精确像素':'切换“局部重绘”涂抹区域，或切换“扩图”拖动边界';
  $('ai-mask-summary').textContent=mode==='inpaint'?(pixels?'已涂抹 '+pixels.toLocaleString()+' px · '+(pixels/(image.width*image.height)*100).toFixed(2)+'%':'尚未涂抹区域'):mode==='outpaint'?(s.error||'输出 '+s.size?.width+' × '+s.size?.height+' px'):'原图保留，生成结果先预览';
  canvas.setAttribute('aria-label',mode==='outpaint'?'AI 扩图边界画布':'AI 源图编辑画布');canvas.dataset.mode=mode;canvas.dataset.maskPixels=String(pixels);canvas.dataset.readonly=String(readOnly);
 }
 function box(){if(!image)return null;const p=mode==='outpaint'?padding:[0,0,0,0];try{return G.layout(canvas.clientWidth,canvas.clientHeight,image.width,image.height,p,zoom,pan);}catch{return null;}}
 function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
 function draw(){
  const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const ratio=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);if(!image)return;
  let b=box();if(gesture?.type==='expand'){const old=gesture.box,p=gesture.padding;b={...old,x:old.sourceX-padding[0]*old.scale,y:old.sourceY-padding[1]*old.scale,width:(image.width+padding[0]+padding[2])*old.scale,height:(image.height+padding[1]+padding[3])*old.scale};}
  if(!b)return;
  if(mode==='outpaint'){ctx.fillStyle='#6494c533';ctx.fillRect(b.x,b.y,b.width,b.height);ctx.strokeStyle='#6687a344';ctx.lineWidth=1;for(let x=b.x;x<b.x+b.width;x+=24){ctx.beginPath();ctx.moveTo(x,b.y);ctx.lineTo(x,b.y+b.height);ctx.stroke();}for(let y=b.y;y<b.y+b.height;y+=24){ctx.beginPath();ctx.moveTo(b.x,y);ctx.lineTo(b.x+b.width,y);ctx.stroke();}}
  ctx.drawImage(image,b.sourceX,b.sourceY,image.width*b.scale,image.height*b.scale);
  ctx.lineWidth=1;ctx.strokeStyle='#777';ctx.strokeRect(b.sourceX,b.sourceY,image.width*b.scale,image.height*b.scale);
  if(mode==='inpaint'){
   if(overlayDirty){tc.clearRect(0,0,tint.width,tint.height);tc.globalCompositeOperation='source-over';tc.drawImage(mask,0,0);tc.globalCompositeOperation='source-in';tc.fillStyle='#fa578c';tc.fillRect(0,0,tint.width,tint.height);tc.globalCompositeOperation='source-over';overlayDirty=false;}
   ctx.globalAlpha=.5;ctx.drawImage(tint,b.sourceX,b.sourceY,image.width*b.scale,image.height*b.scale);ctx.globalAlpha=1;
   if(gesture?.type==='rectangle'){const a=gesture.start,c=gesture.last;ctx.fillStyle=gesture.erase?'#3338':'#fa578c55';ctx.fillRect(b.sourceX+Math.min(a.x,c.x)*b.scale,b.sourceY+Math.min(a.y,c.y)*b.scale,Math.abs(c.x-a.x)*b.scale,Math.abs(c.y-a.y)*b.scale);}
   if(cursor&&!readOnly&&['paint','erase'].includes(tool)){ctx.strokeStyle=tool==='erase'?'#eee':'#ffc6d7';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cursor.x,cursor.y,Math.max(2,brushSize()*b.scale/2),0,Math.PI*2);ctx.stroke();}
  }
  if(mode==='outpaint'){
   ctx.strokeStyle=readOnly?'#777':'#9fcfff';ctx.lineWidth=1.5;ctx.strokeRect(b.x,b.y,b.width,b.height);
   if(!readOnly)for(const handle of G.handles(b)){ctx.fillStyle='#c2dcf4';ctx.fillRect(handle.x-4,handle.y-4,8,8);ctx.strokeStyle='#2e4a64';ctx.strokeRect(handle.x-4,handle.y-4,8,8);}
  }
  $('ai-source-zoom').textContent=Math.round(b.scale*100)+'%';
 }
 function count(){const d=mc.getImageData(0,0,mask.width,mask.height).data;pixels=0;for(let i=3;i<d.length;i+=4)if(d[i])pixels++;}
 function snapshotTiles(bounds,map){for(const t of G.tiles(bounds,mask.width,mask.height)){const key=t.x+','+t.y;if(!map.has(key))map.set(key,{...t,before:mc.getImageData(t.x,t.y,t.width,t.height)});}}
 function commitTiles(map){
  const changes=[];let bytes=0;for(const t of map.values()){const after=mc.getImageData(t.x,t.y,t.width,t.height);if(t.before.data.some((n,i)=>n!==after.data[i])){changes.push({...t,after});bytes+=after.data.byteLength*2;}}
  if(changes.length){const h=history.mask;h.undo.push({changes,bytes});h.redo=[];while(h.undo.length>1&&(h.undo.length>24||h.undo.reduce((n,x)=>n+x.bytes,0)>32*1024*1024))h.undo.shift();count();}
  overlayDirty=true;notify();schedule();
 }
 function brushSize(){return Math.max(1,Math.min(512,Number($('ai-mask-size').value)||96));}
 function brush(a,b,erase,map){const r=brushSize()/2;snapshotTiles({x:Math.min(a.x,b.x)-r-2,y:Math.min(a.y,b.y)-r-2,width:Math.abs(a.x-b.x)+r*2+4,height:Math.abs(a.y-b.y)+r*2+4},map);mc.globalCompositeOperation=erase?'destination-out':'source-over';mc.strokeStyle=mc.fillStyle='white';mc.lineWidth=r*2;mc.lineCap='round';mc.lineJoin='round';mc.beginPath();mc.moveTo(a.x,a.y);mc.lineTo(b.x,b.y);mc.stroke();mc.beginPath();mc.arc(b.x,b.y,r,0,Math.PI*2);mc.fill();mc.globalCompositeOperation='source-over';overlayDirty=true;schedule();}
 function setPadding(next,record=false){G.outputSize(image.width,image.height,next);if(record&&padding.join()!==next.join()){history.padding.undo.push({before:[...padding],after:[...next]});history.padding.undo=history.padding.undo.slice(-24);history.padding.redo=[];}padding=[...next];fields.forEach((id,i)=>$(id).value=padding[i]);notify();schedule();}
 function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 function finish(cancel=false){
  const g=gesture;if(!g)return;gesture=null;
  if(g.type==='stroke'||g.type==='rectangle'){
   if(cancel){for(const t of g.tiles.values())mc.putImageData(t.before,t.x,t.y);overlayDirty=true;notify();schedule();return;}
   if(g.type==='rectangle'){const a=g.start,b=g.last,r={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};snapshotTiles(r,g.tiles);mc.globalCompositeOperation=g.erase?'destination-out':'source-over';mc.fillStyle='white';mc.fillRect(r.x,r.y,r.width,r.height);mc.globalCompositeOperation='source-over';}
   commitTiles(g.tiles);
  }else if(g.type==='expand'){const next=[...padding];padding=g.padding;setPadding(cancel?g.padding:next,!cancel);}else{notify();schedule();}
 }
 canvas.onpointerdown=e=>{
  if(e.button!==0||!image||readOnly||gesture)return;const p=point(e),b=box();if(!b)return;
  canvas.focus();canvas.setPointerCapture(e.pointerId);e.preventDefault();
  if(space||(mode==='inpaint'&&tool==='hand')){gesture={type:'pan',start:p,pan:{...pan}};return;}
  if(mode==='outpaint'){const handle=G.hitHandle(p,b);if(handle)gesture={type:'expand',handle,start:p,box:b,padding:[...padding]};return;}
  if(mode!=='inpaint')return;const local=G.sourcePoint(p,b);if(local.x<0||local.y<0||local.x>image.width||local.y>image.height)return;
  gesture={type:tool==='rectangle'?'rectangle':'stroke',start:local,last:local,erase:tool==='erase'||e.altKey,tiles:new Map(),box:b};
  if(gesture.type==='stroke')brush(local,local,gesture.erase,gesture.tiles);notify();
 };
 canvas.onpointermove=e=>{
  const p=point(e);cursor=p;if(!gesture){const handle=mode==='outpaint'&&box()?G.hitHandle(p,box()):null;canvas.style.cursor=readOnly?'default':space||tool==='hand'?'grab':handle?({n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize'}[handle]):mode==='inpaint'?'crosshair':'default';schedule();return;}
  const g=gesture;if(g.type==='pan'){pan={x:g.pan.x+p.x-g.start.x,y:g.pan.y+p.y-g.start.y};schedule();return;}
  if(g.type==='expand'){try{setPadding(G.dragPadding(g.padding,g.handle,p.x-g.start.x,p.y-g.start.y,g.box.scale,image.width,image.height));}catch(error){$('ai-mask-summary').textContent=error.message;}return;}
  const local=G.sourcePoint(p,g.box);if(g.type==='stroke')brush(g.last,local,g.erase,g.tiles);g.last=local;schedule();
 };
 canvas.onpointerup=e=>{finish();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};canvas.onpointercancel=()=>finish(true);canvas.onlostpointercapture=()=>{if(gesture)finish(true);};canvas.onpointerleave=()=>{cursor=null;schedule();};
 canvas.onwheel=e=>{if(!image||gesture)return;e.preventDefault();zoom=Math.max(.5,Math.min(4,zoom*(e.deltaY<0?1.12:1/1.12)));schedule();};
 function undo(redo=false){if(readOnly||gesture)return;const h=currentHistory(),entry=(redo?h.redo:h.undo).pop();if(!entry)return;(redo?h.undo:h.redo).push(entry);if(mode==='outpaint')setPadding(entry[redo?'after':'before']);else{for(const t of entry.changes)mc.putImageData(t[redo?'after':'before'],t.x,t.y);count();overlayDirty=true;notify();schedule();}}
 canvas.onkeydown=e=>{if(e.key===' '){space=true;e.preventDefault();return;}if(e.key==='Escape'&&gesture){e.preventDefault();e.stopPropagation();finish(true);return;}if((e.metaKey||e.ctrlKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();undo(e.shiftKey||e.key.toLowerCase()==='y');}if(['[',']'].includes(e.key)&&mode==='inpaint'){$('ai-mask-size').value=Math.max(1,Math.min(512,Number($('ai-mask-size').value)+(e.key===']'?8:-8)));schedule();}};
 canvas.onkeyup=e=>{if(e.key===' ')space=false;};canvas.onblur=()=>{space=false;finish(true);};
 document.querySelectorAll('[data-ai-source-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.aiSourceTool;updateControls();schedule();});
 $('ai-source-fit').onclick=()=>{zoom=1;pan={x:0,y:0};schedule();};$('ai-mask-undo').onclick=()=>undo();$('ai-mask-redo').onclick=()=>undo(true);
 $('ai-source-zoom-in').onclick=()=>{zoom=Math.min(4,zoom*1.4);schedule();};$('ai-source-zoom-out').onclick=()=>{zoom=Math.max(.5,zoom/1.4);schedule();};
 $('ai-mask-clear').onclick=()=>{if(readOnly||gesture)return;const map=new Map();snapshotTiles({x:0,y:0,width:mask.width,height:mask.height},map);mc.clearRect(0,0,mask.width,mask.height);commitTiles(map);};
 $('ai-mask-size').oninput=schedule;$('ai-mask-feather').oninput=notify;
 let fieldEdit=null;
 for(const id of fields){
  $(id).onfocus=()=>fieldEdit={id,entry:null};$(id).onblur=()=>fieldEdit=null;
  $(id).oninput=$(id).onchange=()=>{try{const next=fieldValues();G.outputSize(image.width,image.height,next);if(fieldEdit?.id===id&&fieldEdit.entry){fieldEdit.entry.after=[...next];setPadding(next);}else{const changed=padding.join()!==next.join();setPadding(next,true);if(changed&&fieldEdit?.id===id)fieldEdit.entry=history.padding.undo.at(-1);}}catch(e){notify();schedule();}};
 }
 $('ai-padding-reset').onclick=()=>setPadding([0,0,0,0],true);
 new ResizeObserver(schedule).observe(canvas);
 async function importMask(src,record=false){const im=await loadImage(src);if(im.width!==mask.width||im.height!==mask.height)throw Error('选区尺寸与源图不一致');const map=new Map();if(record)snapshotTiles({x:0,y:0,width:mask.width,height:mask.height},map);mc.clearRect(0,0,mask.width,mask.height);mc.drawImage(im,0,0);const d=mc.getImageData(0,0,mask.width,mask.height);for(let i=0;i<d.data.length;i+=4){d.data[i+3]=Math.round(d.data[i]*d.data[i+3]/255);d.data[i]=d.data[i+1]=d.data[i+2]=255;}mc.putImageData(d,0,0);if(record)commitTiles(map);else{count();overlayDirty=true;notify();schedule();}}
 window.atelierSourceEditor={
  state,configure(options){mode=options.mode;readOnly=options.readOnly;if(readOnly&&gesture)finish(true);updateControls();schedule();},
  clear(){loadId++;image=null;source=null;pixels=0;gesture=null;history={mask:{undo:[],redo:[]},padding:{undo:[],redo:[]}};schedule();},
  async load(value,nextMode,{preserve=false,padding:nextPadding=null}={}){
   if(preserve&&source?.source===value.source&&source?.layerId===value.layerId&&source?.revision===value.revision&&source?.documentToken===value.documentToken){mode=nextMode;notify();schedule();return;}
   const generation=++loadId,im=await loadImage(value.source);if(generation!==loadId)return;
   image=im;source=value;mode=nextMode;mask.width=tint.width=im.width;mask.height=tint.height=im.height;pixels=0;history={mask:{undo:[],redo:[]},padding:{undo:[],redo:[]}};zoom=1;pan={x:0,y:0};padding=nextPadding||fields.map(id=>Number($(id).value));fields.forEach((id,i)=>$(id).value=padding[i]);if(value.mask)await importMask(value.mask);overlayDirty=true;notify();schedule();
  },
  importMask,
  maskPNG(){if(!image||gesture)throw Error('请先结束源图操作');const out=document.createElement('canvas');out.width=mask.width;out.height=mask.height;const c=out.getContext('2d');c.fillStyle='black';c.fillRect(0,0,out.width,out.height);c.drawImage(mask,0,0);return out.toDataURL('image/png');},
  readPadding(){const next=fieldValues();G.outputSize(image.width,image.height,next);return next;},
  resume(){schedule();}
 };
})();
