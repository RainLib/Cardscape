/* One shortcut contract for Electron's accelerator filter and the renderer. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CardShortcuts=factory();})(typeof window!=='undefined'?window:this,()=>{
'use strict';
function editable(target){
 const el=target?.closest?.('input,textarea,select,[contenteditable]');
 if(!el)return false;
 if(el.tagName==='INPUT')return !['button','submit','reset','checkbox','radio','range','color','file','hidden'].includes(el.type);
 return el.tagName==='TEXTAREA'||el.tagName==='SELECT'||el.isContentEditable;
}
function resolve(e,{editing=false}={}){
 if(e.isComposing||e.getModifierState?.('AltGraph'))return null;
 const key=String(e.key||'').toLowerCase(),primary=e.metaKey||e.ctrlKey;
 let cmd=null;
 if(primary){
  if(e.altKey){if(key==='i'&&!e.shiftKey)cmd='import';}
  else if(key==='z')cmd=e.shiftKey?'redo':'undo';
  else if(key==='y'&&!e.shiftKey)cmd='redo';
  else if(key==='s')cmd=e.shiftKey?'save-as':'save';
  else if(key==='g')cmd=e.shiftKey?'ungroup-layers':'group-layers';
  else if(key==='i'&&e.shiftKey)cmd='invert-selection';
  else if(!e.shiftKey)cmd={n:'new',o:'open',a:'select-all',d:'deselect',t:'transform',j:'duplicate',0:'fit',1:'actual','=':'zoom-in','-':'zoom-out'}[key]||null;
  if(!e.altKey&&key==='+')cmd='zoom-in';
 }else if(!e.altKey&&!e.shiftKey&&(key==='delete'||key==='backspace'))cmd='delete-layer';
 else if(!e.altKey&&!e.ctrlKey&&!e.metaKey&&(key==='f1'||key==='?'))cmd='shortcuts';
 if(editing&&['undo','redo','select-all'].includes(cmd))return 'text-'+cmd;
 if(editing&&!['save','save-as','open','new','import','fit','actual','zoom-in','zoom-out'].includes(cmd))return null;
 return cmd;
}
function fromElectron(input){return {key:input.key,metaKey:input.meta,ctrlKey:input.control,altKey:input.alt,shiftKey:input.shift,isComposing:input.isComposing};}
const help=[
 ['撤销','⌘ Z','Ctrl Z'],['重做','⌘ ⇧ Z / ⌘ Y','Ctrl Shift Z / Ctrl Y'],
 ['保存 / 另存为','⌘ S / ⌘ ⇧ S','Ctrl S / Ctrl Shift S'],['打开 / 新建','⌘ O / ⌘ N','Ctrl O / Ctrl N'],
 ['导入图像','⌘ ⌥ I','Ctrl Alt I'],['全选画幅','⌘ A','Ctrl A'],['取消选区','⌘ D / Esc','Ctrl D / Esc'],
 ['编组 / 取消编组','⌘ G / ⌘ ⇧ G','Ctrl G / Ctrl Shift G'],['反选','⌘ ⇧ I','Ctrl Shift I'],['复制图层 / 选区','⌘ J','Ctrl J'],['删除普通图层','Delete / Backspace','Delete / Backspace'],
 ['自由变换 / 应用 / 取消','⌘ T / Enter / Esc','Ctrl T / Enter / Esc'],
 ['适合窗口 / 100%','⌘ 0 / ⌘ 1','Ctrl 0 / Ctrl 1'],['放大 / 缩小','⌘ + / ⌘ −','Ctrl + / Ctrl −'],
 ['移动 / 选区 / 套索','V / M / L','V / M / L'],['磁性套索 / 智能对象 / 魔棒','⇧ L / S / W','Shift L / S / W'],
 ['画笔 / 文字 / 抓手 / 缩放','B / T / H / Z','B / T / H / Z'],['临时抓手 / 微调图层','空格 / 方向键；⇧ 10px','Space / 方向键；Shift 10px'],
 ['画笔尺寸 / 黑白','[ ] / X','[ ] / X'],['隐藏面板 / 折叠右侧','Tab / ⇧ Tab','Tab / Shift Tab'],['快捷键说明','? / F1','? / F1']
];
return {resolve,editable,fromElectron,help};
});
