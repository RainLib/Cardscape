import {EditorState,Compartment,Transaction} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine,highlightActiveLineGutter,drawSelection,hoverTooltip} from '@codemirror/view';
import {StreamLanguage,bracketMatching,indentOnInput,indentUnit,foldGutter,foldService} from '@codemirror/language';
import {shader} from '@codemirror/legacy-modes/mode/clike';
import {autocompletion,completionKeymap,closeBrackets,closeBracketsKeymap,snippetCompletion,snippet,startCompletion,nextSnippetField,prevSnippetField,hasNextSnippetField,hasPrevSnippetField} from '@codemirror/autocomplete';
import {defaultKeymap,history,historyKeymap,indentWithTab,undo,redo,toggleComment} from '@codemirror/commands';
import {searchKeymap,highlightSelectionMatches} from '@codemirror/search';
import {setDiagnostics,lintGutter} from '@codemirror/lint';
import {oneDark} from '@codemirror/theme-one-dark';

const $=id=>document.getElementById(id),L=window.ShaderLanguage,editors=new Map();
let custom=[],focused='fragment-code';
try{const stored=JSON.parse(localStorage.getItem('atelier-glsl-snippets-v1')||'[]');if(Array.isArray(stored))custom=stored.filter(s=>typeof s.id==='string'&&['geometry','fragment'].includes(s.stage)&&typeof s.name==='string'&&s.name.length<=60&&typeof s.template==='string'&&s.template.length<=4096).slice(0,64);}catch{}
function completionSource(stage){return context=>{
 const member=context.matchBefore(/\b[A-Za-z_]\w*\.[A-Za-z_]*$/),word=context.matchBefore(/[A-Za-z_]\w*$/),doc=context.state.doc.toString();
 if(!context.explicit&&!word&&!member)return null;
 if(member){const [base,part]=member.text.split('.');return {from:context.pos-part.length,options:L.memberSymbols(base,stage,doc),validFor:/^[A-Za-z_]*$/};}
 const options=L.symbols(stage,doc).map(x=>x.template?snippetCompletion(x.template,x):x);
 for(const s of L.stageSnippets(stage,custom))options.push(snippetCompletion(s.template,{label:s.label||s.name,type:'text',detail:'片段 · '+s.name,info:s.info||'自定义代码片段'}));
 return {from:word?.from??context.pos,options,validFor:/^[A-Za-z_]\w*$/};
};}
function tooltip(stage){return hoverTooltip((view,pos)=>{
 const line=view.state.doc.lineAt(pos),a=pos-line.from;let start=a,end=a;while(start>0&&/[\w.]/.test(line.text[start-1]))start--;while(end<line.length&&/[\w.]/.test(line.text[end]))end++;
 const word=line.text.slice(start,end),[base,part]=word.split('.'),s=part?L.memberSymbols(base,stage,view.state.doc.toString()).find(x=>x.label===part):L.symbols(stage,view.state.doc.toString()).find(x=>x.label===word);
 if(!s)return null;return {pos:line.from+start,end:line.from+end,above:true,create(){const dom=document.createElement('div');dom.className='glsl-symbol-help';const b=document.createElement('b');b.textContent=word+' · '+(s.detail||s.type);dom.append(b);if(s.info){const p=document.createElement('p');p.textContent=s.info;dom.append(p);}return {dom};}};
});}
// Stream languages have no syntax-tree folds; fold only balanced braces while
// excluding comment braces. GPU compilation remains the syntax authority.
const braces=foldService.of((state,start,end)=>{
 const line=state.doc.sliceString(start,end),open=line.indexOf('{');if(open<0)return null;
 let depth=0,comment=false,block=false;
 for(let p=start+open;p<state.doc.length;p++){const ch=state.doc.sliceString(p,p+1),next=state.doc.sliceString(p,p+2);if(ch==='\n')comment=false;if(comment)continue;if(block){if(next==='*/'){block=false;p++;}continue;}if(next==='//'){comment=true;p++;continue;}if(next==='/*'){block=true;p++;continue;}if(ch==='{')depth++;if(ch==='}'&&!--depth)return p>end?{from:start+open+1,to:p}:null;}
 return null;
});
const theme=EditorView.theme({
 '&':{fontSize:'12px',backgroundColor:'#202124'},'.cm-scroller':{fontFamily:'Menlo, Consolas, monospace',overflow:'auto'},'.cm-content':{minHeight:'160px'},'.cm-gutters':{backgroundColor:'#242424',borderRight:'1px solid #3d3d3d'},'.cm-tooltip':{zIndex:'100',maxWidth:'360px'},'.cm-tooltip-autocomplete > ul':{maxHeight:'210px'},'.cm-completionInfo':{maxWidth:'280px'},'&.cm-focused':{outline:'1px solid #789ec3'}
},{dark:true});
function menu(stage){const select=$(stage+'-snippet'),old=select.value;select.replaceChildren(new Option('选择代码片段…',''));for(const s of L.stageSnippets(stage,custom))select.add(new Option(s.name,s.id));select.value=old;$(stage+'-snippet-delete').disabled=!custom.some(s=>s.id===select.value);}
function status(id){const e=editors.get(id),p=e.view.state.selection.main,pos=e.view.state.doc.lineAt(p.head);$(e.stage+'-code-status').textContent=`行 ${pos.number}，列 ${p.head-pos.from+1} · ${e.view.state.doc.length}/4096`;}
for(const [id,stage] of [['geometry-code','geometry'],['fragment-code','fragment']]){
 const source=$(id),parent=$(stage+'-code-editor'),editable=new Compartment();let syncing=false;
 const extensions=[lineNumbers(),highlightActiveLineGutter(),highlightActiveLine(),drawSelection(),history(),indentOnInput(),indentUnit.of('  '),bracketMatching(),closeBrackets(),foldGutter(),braces,StreamLanguage.define(shader),oneDark,theme,lintGutter(),highlightSelectionMatches(),EditorView.lineWrapping,EditorView.cspNonce.of(document.querySelector('meta[name="atelier-style-nonce"]').content),EditorView.contentAttributes.of({'aria-label':source.getAttribute('aria-label'),'data-glsl-stage':stage,spellcheck:'false'}),editable.of(EditorView.editable.of(true)),autocompletion({override:[completionSource(stage)],activateOnTyping:true}),tooltip(stage),keymap.of([
  {key:'Mod-Enter',run:()=>{$('shader-apply').click();return true;}},
  {key:'Mod-y',run:redo},{key:'Mod-/',run:toggleComment},
  {key:'Tab',run:v=>hasNextSnippetField(v.state)?nextSnippetField(v):false},{key:'Shift-Tab',run:v=>hasPrevSnippetField(v.state)?prevSnippetField(v):false},
  ...closeBracketsKeymap,...completionKeymap,...defaultKeymap,...historyKeymap,...searchKeymap,indentWithTab
 ]),EditorView.domEventHandlers({focus(){focused=id;return false;}}),EditorView.updateListener.of(update=>{
  if(update.docChanged){source.value=update.state.doc.toString();if(!syncing){source.dispatchEvent(new Event('input',{bubbles:true}));queueMicrotask(()=>update.view.dispatch(setDiagnostics(update.view.state,[])));}}
  if(update.docChanged||update.selectionSet)status(id);
 })];
 const view=new EditorView({state:EditorState.create({doc:source.value,extensions}),parent});
 editors.set(id,{view,stage,editable,extensions,set(value,reset=false){if(value===view.state.doc.toString()&&!reset)return;syncing=true;try{if(reset)view.setState(EditorState.create({doc:value,extensions}));else view.dispatch({changes:{from:0,to:view.state.doc.length,insert:value},annotations:Transaction.addToHistory.of(false)});source.value=value;status(id);}finally{syncing=false;}}});
 source.hidden=true;menu(stage);status(id);
 $(stage+'-complete').onclick=()=>{view.focus();startCompletion(view);};
 $(stage+'-snippet').onchange=()=>menu(stage);
 $(stage+'-snippet-insert').onclick=()=>{const selected=L.stageSnippets(stage,custom).find(s=>s.id===$(stage+'-snippet').value);if(!selected)return;view.focus();const r=view.state.selection.main;snippet(selected.template+(selected.template.includes('\n')?'\n':''))(view,null,r.from,r.to);};
 $(stage+'-snippet-save').onclick=()=>{focused=id;const r=view.state.selection.main;$('snippet-name').value='';$('snippet-body').value=r.empty?view.state.doc.toString():view.state.doc.sliceString(r.from,r.to);$('snippet-error').textContent='';$('snippet-dialog').showModal();$('snippet-name').focus();};
 $(stage+'-snippet-delete').onclick=()=>{custom=custom.filter(s=>s.id!==$(stage+'-snippet').value);localStorage.setItem('atelier-glsl-snippets-v1',JSON.stringify(custom));menu('geometry');menu('fragment');};
}
$('snippet-close').onclick=()=>$('snippet-dialog').close();
$('snippet-save').onclick=()=>{const stage=editors.get(focused).stage,name=$('snippet-name').value.trim(),template=$('snippet-body').value;if(!name||!template.trim()){$('snippet-error').textContent='请输入名称和代码';return;}if(name.length>60||template.length>4096||custom.length>=64){$('snippet-error').textContent='名称最多 60 字，片段最多 4096 字符，最多保存 64 个';return;}const s={id:'user-'+crypto.randomUUID(),stage,name,label:name,template,info:'本机自定义片段'};custom.push(s);localStorage.setItem('atelier-glsl-snippets-v1',JSON.stringify(custom));menu(stage);$(stage+'-snippet').value=s.id;menu(stage);$('snippet-dialog').close();};
$('shader-edit-expand').onclick=()=>{document.body.classList.toggle('shader-wide');const on=document.body.classList.contains('shader-wide');$('shader-edit-expand').textContent=on?'收起代码区':'加宽代码区';$('shader-edit-expand').setAttribute('aria-pressed',String(on));requestAnimationFrame(()=>window.cardEditorHost.fit());};
window.atelierShaderEditors={
 set(id,value,options={}){editors.get(id)?.set(value,options.reset);},
 clearDiagnostics(){for(const e of editors.values())e.view.dispatch(setDiagnostics(e.view.state,[]));},
 error(error){this.clearDiagnostics();const e=editors.get(error.stage==='geometry'?'geometry-code':error.stage==='fragment'?'fragment-code':null);if(!e)return;$(e.stage+'-code').closest('details').open=true;const marks=L.diagnostics(error.message,e.view.state.doc.lines).map(d=>{const l=e.view.state.doc.line(d.line);return {from:l.from,to:l.to,severity:d.severity,message:d.message};});e.view.dispatch(setDiagnostics(e.view.state,marks));if(marks.length)e.view.dispatch({selection:{anchor:marks[0].from},scrollIntoView:true});},
 readonly(value){for(const e of editors.values())e.view.dispatch({effects:e.editable.reconfigure(EditorView.editable.of(!value))});},
 textCommand(command){const e=[...editors.values()].find(x=>x.view.hasFocus);if(!e)return false;if(command==='undo')undo(e.view);else if(command==='redo')redo(e.view);else if(command==='select-all')e.view.dispatch({selection:{anchor:0,head:e.view.state.doc.length}});else return false;return true;}
};
