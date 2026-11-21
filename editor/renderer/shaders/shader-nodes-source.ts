import type { ShaderStage } from '../../shared/render-models';
import i18n from '../localization/ui-i18n.ts';
import importedCardShaderGraph from './shader-graph-model.ts';
import {LiteGraph,LGraph,LGraphCanvas} from 'litegraph.js/build/litegraph.core.js';
import 'litegraph.js/css/litegraph.css';
const $=id=>(document.getElementById(id) as any),M=importedCardShaderGraph,host=window.cardEditorHost;
const ui=(label:string)=>i18n.text(label,i18n.language(document.documentElement.lang));
for(const [key,d] of Object.entries<any>(M.definitions)){
 function Node(){for(const [name,type] of d.inputs||[])this.addInput(name,type);if(d.out)this.addOutput('输出',d.out);this.properties={...d.properties};this.size=[155,75];this.mode=LiteGraph.NEVER;}
 Node.title=d.name;
 Node.prototype.getTitle=function(){return this.title&&this.title!==d.name?this.title:ui(d.name);};
 Node.prototype.onDrawForeground=function(ctx){
  if(this.flags.collapsed)return;
  for(const slot of [...(this.inputs||[]),...(this.outputs||[])]){
   if(!Object.hasOwn(slot,'label'))Object.defineProperty(slot,'label',{get:()=>ui(slot.name),configurable:true});
  }
  const value=this.properties.value??this.properties.color??this.properties.channel;
  if(value!==undefined){ctx.fillStyle='#a9bac8';ctx.font='12px system-ui';ctx.fillText(String(value),10,this.size[1]-12);}
 };
 LiteGraph.registerNodeType('card/'+key,Node);
}
let graph=null,view=null,stage: ShaderStage='fragment',token='',mode='glsl',graphs: Record<string, any>={},applying=false,loading=false,timer: any=0,selected=null,lastShader='',draftSignature='';
const clone=x=>JSON.parse(JSON.stringify(x));
const shaderIdentity=s=>JSON.stringify([s.editorMode,s.graphs,s.geometryBody,s.fragmentBody,s.fragmentPrelude]);
function pack(){return {...graph.serialize(),schema:'card-shader-graph/1',stage};}
function report(text,error=false){$('shader-node-status').textContent=text;$('shader-node-status').classList.toggle('error',error);}
function fit(){if(!view||$('shader-node-workbench').hidden)return;const el=$('shader-node-canvas'),rect=el.parentElement.getBoundingClientRect();el.width=Math.max(300,Math.floor(rect.width));el.height=Math.max(180,Math.floor(rect.height));const ns=graph._nodes;if(ns.length){const minX=Math.min(...ns.map(n=>n.pos[0]))-30,minY=Math.min(...ns.map(n=>n.pos[1]))-50,maxX=Math.max(...ns.map(n=>n.pos[0]+n.size[0]))+30,maxY=Math.max(...ns.map(n=>n.pos[1]+n.size[1]))+30;view.ds.scale=Math.min(1.15,el.width/(maxX-minX),el.height/(maxY-minY));view.ds.offset=[-minX+(el.width/view.ds.scale-(maxX-minX))/2,-minY+(el.height/view.ds.scale-(maxY-minY))/2];}view.setDirty(true,true);}
function renderSelection(){
 const ns=graph?graph._nodes:[];if(selected&&!ns.includes(selected))selected=null;const picker=$('shader-node-selection');picker.replaceChildren(new Option('选择节点…',''),...ns.map(n=>new Option(n.title+' #'+n.id,String(n.id))));picker.value=selected?String(selected.id):'';
 const panel=$('shader-node-properties');panel.replaceChildren();$('shader-node-delete').disabled=!selected||host.state().busy;
 if(!selected){$('shader-node-target').replaceChildren(new Option('连到节点…',''));ports();return;}const d=M.kind(selected.type);for(const [key,value] of Object.entries<any>(d.properties||{})){const label=document.createElement('label');label.textContent={value:'数值',color:'颜色',channel:'通道'}[key]||key;let input;if(key==='channel'){input=document.createElement('select');for(const [v,n] of [['r','运动'],['g','框内外'],['b','发光'],['a','相位']] as const)input.add(new Option(n,v));}else{input=document.createElement('input');input.type=key==='color'?'color':'number';if(input.type==='number'){input.step='any';input.min='-10000';input.max='10000';}}input.setAttribute('aria-label','节点'+label.textContent);input.value=selected.properties[key]??value;input.disabled=host.state().busy;input.oninput=input.onchange=()=>{if(input.validity&&!input.validity.valid)return;selected.properties[key]=key==='value'?Number(input.value):input.value;graph.afterChange();view.setDirty(true,true);};label.append(input);panel.append(label);}
 $('shader-node-target').replaceChildren(new Option('连到节点…',''),...ns.filter(n=>M.kind(n.type).inputs?.length&&n!==selected).map(n=>new Option(n.title+' #'+n.id,String(n.id))));ports();
}
function ports(){const target=graph?.getNodeById(Number($('shader-node-target').value));$('shader-node-port').replaceChildren(...(M.kind(target?.type)?.inputs||[]).map(([name,type]: any,i)=>new Option(name+' · '+type,String(i))));$('shader-node-connect').disabled=!selected||!M.kind(selected.type)?.out||!target;}
function load(value){loading=true;try{graph.configure(clone(value));for(const n of graph._nodes)n.mode=LiteGraph.NEVER;selected=null;draftSignature=JSON.stringify(pack());renderSelection();fit();}finally{loading=false;}}
function init(){if(graph)return;graph=new LGraph();view=new LGraphCanvas('#shader-node-canvas',graph);view.background_image=null;view.clear_background_color='#171b20';view.render_shadows=false;view.show_info=false;view.render_canvas_border=false;view.allow_searchbox=false;view.allow_reconnect_links=true;view.onSelectionChange=nodes=>{selected=Object.values<any>(nodes)[0]||null;renderSelection();};graph.onAfterChange=changed;new ResizeObserver(()=>fit()).observe($('shader-node-canvas').parentElement);load(graphs[stage]||M.preset(stage));if($('shader-node-workbench').hidden)view.stopRendering();}
function changed(){if(loading||applying)return;graphs[stage]=pack();const signature=JSON.stringify(graphs[stage]);if(signature===draftSignature)return;draftSignature=signature;if(!$('shader-node-properties').contains(document.activeElement))renderSelection();report('节点草稿');clearTimeout(timer);if($('shader-node-live').checked)timer=setTimeout(apply,250);}
function config(){const current=host.state().document.shader;const value=pack();return {...current,editorMode:'nodes',fragmentPrelude:stage==='fragment'?'':current.fragmentPrelude,graphs:{...current.graphs,[stage]:value},[stage==='fragment'?'fragmentBody':'geometryBody']:M.compile(value)};}
function apply(){clearTimeout(timer);if(host.state().busy)return;init();try{const next=config();if(JSON.stringify(next)===JSON.stringify(host.state().document.shader)){report('已应用 · 无新增变更');return;}applying=true;host.compile(next);graphs[stage]=clone(next.graphs[stage]);lastShader=shaderIdentity(host.state().document.shader);window.atelierShaderEditors.set(stage==='fragment'?'fragment-code':'geometry-code',next[stage==='fragment'?'fragmentBody':'geometryBody']);report('已编译并应用 · 可撤销');$('shader-status').textContent='节点编译成功';}catch(e){report('保留之前效果：'+e.message,true);}finally{applying=false;}}
function close(){clearTimeout(timer);$('shader-node-workbench').hidden=true;view?.stopRendering();}
function reset(){init();load(M.preset(stage));graphs[stage]=pack();apply();}
function setMode(value){clearTimeout(timer);mode=value==='nodes'?'nodes':'glsl';$('shader-mode-nodes').setAttribute('aria-pressed',String(mode==='nodes'));$('shader-mode-glsl').setAttribute('aria-pressed',String(mode==='glsl'));$('shader-node-launch').hidden=mode!=='nodes';$('shader-code-fields').hidden=mode==='nodes';if(mode==='glsl')close();}
function open(){setMode('nodes');$('shader-node-workbench').hidden=false;init();view.startRendering();view.read_only=host.state().busy;requestAnimationFrame(fit);}
$('shader-mode-nodes').onclick=()=>{setMode('nodes');open();};$('shader-mode-glsl').onclick=()=>setMode('glsl');$('shader-node-open').onclick=open;$('shader-node-close').onclick=close;$('shader-node-expand').onclick=()=>{const open=$('shader-node-workbench').classList.toggle('expanded');$('shader-node-expand').textContent=open?'还原工作台':'扩大工作台';$('shader-node-expand').setAttribute('aria-pressed',String(open));fit();};
$('shader-node-stage').onchange=()=>{clearTimeout(timer);if(graph)graphs[stage]=pack();stage=$('shader-node-stage').value;load(graphs[stage]||M.preset(stage));refresh(host.state());};
$('shader-node-preset').onclick=()=>{load(M.preset(stage,$('shader-node-template').value));graphs[stage]=pack();report('模板草稿 · 编译后应用');};
$('shader-node-add').onclick=()=>{const type=$('shader-node-kind').value;const n=LiteGraph.createNode(type);if(!n)return;n.pos=[20-view.ds.offset[0],40-view.ds.offset[1]];graph.add(n);view.selectNode(n);};
$('shader-node-delete').onclick=()=>{if(selected)graph.remove(selected);selected=null;renderSelection();};$('shader-node-fit').onclick=fit;for(const [id,amount] of [['shader-node-zoom-in',1.25],['shader-node-zoom-out',.8]] as const)$(id).onclick=()=>{view.ds.changeScale(Math.min(2,Math.max(.15,view.ds.scale*amount)),[view.canvas.width/2,view.canvas.height/2]);view.setDirty(true,true);};$('shader-node-apply').onclick=apply;
$('shader-node-selection').onchange=()=>{const n=graph.getNodeById(Number($('shader-node-selection').value));view.deselectAllNodes();if(n)view.selectNode(n);};$('shader-node-target').onchange=ports;
$('shader-node-connect').onclick=()=>{const target=graph.getNodeById(Number($('shader-node-target').value)),slot=Number($('shader-node-port').value);if(selected&&target){if(M.kind(selected.type).out!==M.kind(target.type).inputs[slot][1]){report('连线类型不匹配',true);return;}selected.connect(0,target,slot);graph.afterChange();}};
$('shader-node-code').onclick=()=>{try{const next=config();window.atelierShaderEditors.set(stage==='fragment'?'fragment-code':'geometry-code',next[stage==='fragment'?'fragmentBody':'geometryBody']);$(stage==='fragment'?'fragment-code':'geometry-code').dispatchEvent(new Event('input',{bubbles:true}));setMode('glsl');}catch(e){report(e.message,true);}};
$('shader-node-live').onchange=()=>{if($('shader-node-live').checked)apply();else clearTimeout(timer);};
$('shader-node-canvas').addEventListener('keydown',e=>{if(host.state().busy)return;if(['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(selected)graph.remove(selected);renderSelection();}});
function refresh(next){if(!next.document)return;const nextToken=next.documentToken||next.document.id,s=next.document.shader,signature=shaderIdentity(s);if(nextToken!==token){token=nextToken;clearTimeout(timer);graphs=clone(s.graphs||{});setMode(s.editorMode||'glsl');if(graph)load(graphs[stage]||M.preset(stage));lastShader=signature;}else if(!applying&&signature!==lastShader){graphs=clone(s.graphs||{});setMode(s.editorMode||'glsl');if(graph)load(graphs[stage]||M.preset(stage));lastShader=signature;}if(view)view.read_only=next.busy;for(const id of ['shader-node-add','shader-node-preset','shader-node-apply'] as const)$(id).disabled=next.busy;const picker=$('shader-node-kind'),key=stage;if(picker.dataset.stage!==key){picker.dataset.stage=key;picker.replaceChildren(...Object.entries<any>(M.definitions).filter(([,d]: any)=>!d.stage||d.stage===stage).map(([k,d]: any)=>new Option(d.name,'card/'+k)));}}
window.atelierShaderNodes={refresh,apply,reset,mode:()=>mode,configuration:config};refresh(host.state());

window.addEventListener('cardscape-language-change',()=>view?.setDirty(true,true));
