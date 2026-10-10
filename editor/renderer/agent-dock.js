/* Independent, persistent dock. Pointer dragging never changes document data. */
(() => {
'use strict';
const $=id=>document.getElementById(id),dock=$('agent-dock'),splitter=$('agent-resize'),header=$('agent-dock-header');
let prefs={position:'right',width:340,height:620,x:0,y:95,open:true,collapsed:false};try{Object.assign(prefs,JSON.parse(localStorage.getItem('atelier-agent-dock')||'{}'));}catch{}
if(!['left','right','float'].includes(prefs.position))prefs.position='right';
let drag=null,fitTimer;
const limit=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||a));
function save(){localStorage.setItem('atelier-agent-dock',JSON.stringify(prefs));}
function fit(){clearTimeout(fitTimer);fitTimer=setTimeout(()=>window.cardEditorHost.fit(),70);}
function layout(){
 const available=Math.max(280,innerWidth-450-(document.body.classList.contains('dock-collapsed')?0:260));
 prefs.width=limit(prefs.width,280,Math.min(600,available));prefs.height=limit(prefs.height,380,innerHeight-90);prefs.x=limit(prefs.x,0,innerWidth-prefs.width);prefs.y=limit(prefs.y,64,innerHeight-prefs.height-23);
 document.body.dataset.agentDock=prefs.open?prefs.position:'closed';document.body.classList.toggle('agent-collapsed',prefs.collapsed);
 document.body.classList.toggle('ai-chat-active',prefs.open);dock.hidden=!prefs.open;
 document.documentElement.style.setProperty('--agent-width',prefs.width+'px');dock.style.setProperty('--float-x',prefs.x+'px');dock.style.setProperty('--float-y',prefs.y+'px');dock.style.setProperty('--float-height',prefs.height+'px');
 $('agent-dock-position').value=prefs.position;$('agent-collapse').textContent=prefs.collapsed?'«':'»';$('agent-collapse').title=prefs.collapsed?'展开 AI 面板':'折叠 AI 面板';$('agent-collapse').setAttribute('aria-expanded',String(!prefs.collapsed));
 splitter.setAttribute('aria-valuenow',String(Math.round(prefs.width)));splitter.setAttribute('aria-valuemax',String(Math.round(Math.min(600,available))));
 for(const button of document.querySelectorAll('#agent-open,[data-agent-toggle]')){const shown=prefs.open&&!prefs.collapsed&&!document.body.classList.contains('panels-hidden');button.classList.toggle('active',shown);button.setAttribute('aria-expanded',String(shown));button.setAttribute('aria-pressed',String(shown));}
 save();fit();window.atelierWorkspace?.syncLayout();
}
function open(){prefs.open=true;prefs.collapsed=false;document.body.classList.remove('panels-hidden');layout();}
function close(){prefs.open=false;layout();}
function toggle(){if(prefs.open&&!prefs.collapsed&&!document.body.classList.contains('panels-hidden'))close();else open();return prefs.open;}
function position(value){prefs.position=value;prefs.collapsed=false;prefs.open=true;if(value==='float'&&!prefs.x)prefs.x=innerWidth-prefs.width-20;layout();}
function resize(width){prefs.width=width;layout();}
window.atelierAgentDock={open,close,toggle,position,resize,layout,state:()=>({...prefs})};
 $('agent-dock-position').onchange=()=>position($('agent-dock-position').value);
 $('agent-close').onclick=close;$('agent-collapse').onclick=()=>{prefs.collapsed=!prefs.collapsed;layout();};
 splitter.onpointerdown=e=>{if(prefs.collapsed||prefs.position==='float')return;drag={type:'resize',x:e.clientX,width:prefs.width,position:prefs.position};splitter.setPointerCapture(e.pointerId);e.preventDefault();};
 splitter.onpointermove=e=>{if(drag?.type==='resize')resize(drag.width+(e.clientX-drag.x)*(drag.position==='left'?1:-1));};
 splitter.onpointerup=splitter.onpointercancel=()=>{drag=null;};splitter.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();resize(e.key==='Home'?340:prefs.width+(e.key==='ArrowRight'?10:-10)*(prefs.position==='left'?1:-1));}};splitter.ondblclick=()=>resize(340);
 header.onpointerdown=e=>{if(e.target.closest('button,select')||prefs.collapsed)return;const r=dock.getBoundingClientRect();drag={type:'move',x:e.clientX,y:e.clientY,left:r.left,top:r.top,started:prefs.position==='float'};header.setPointerCapture(e.pointerId);e.preventDefault();};
 header.onpointermove=e=>{if(drag?.type!=='move')return;if(!drag.started&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<8)return;drag.started=true;prefs.position='float';prefs.x=drag.left+e.clientX-drag.x;prefs.y=drag.top+e.clientY-drag.y;layout();document.body.dataset.agentDrop=e.clientX<50?'left':e.clientX>innerWidth-50?'right':'';};
 function drop(e){if(drag?.type==='move'&&drag.started){if(e.clientX<50)prefs.position='left';else if(e.clientX>innerWidth-50)prefs.position='right';}drag=null;delete document.body.dataset.agentDrop;layout();}
 header.onpointerup=drop;header.onpointercancel=()=>{drag=null;delete document.body.dataset.agentDrop;layout();};
 $('agent-float-resize').onpointerdown=e=>{drag={type:'corner',x:e.clientX,y:e.clientY,width:prefs.width,height:prefs.height};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();};
 $('agent-float-resize').onpointermove=e=>{if(drag?.type==='corner'){prefs.width=drag.width+e.clientX-drag.x;prefs.height=drag.height+e.clientY-drag.y;layout();}};
 $('agent-float-resize').onpointerup=$('agent-float-resize').onpointercancel=()=>{drag=null;};
 window.addEventListener('resize',layout);layout();
})();
