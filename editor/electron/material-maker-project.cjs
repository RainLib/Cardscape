const PROFILE='Cardscape/Live';
const clone=value=>JSON.parse(JSON.stringify(value));
function outputModel(){
 const inputs=[['source','rgba','vec4(0.0)','原图'],['effect','rgba','vec4(0.0)','动态效果'],...['motion','emission','phase','foil','inset','rigid'].map(name=>[name,'f','0.0',name+' Mask'])].map(([name,type,value,label])=>({name,type,default:value,label}));
 const preview=['shader_type spatial;','render_mode unshaded;','uniform float elapsed_time = 0.0;','$definitions','void fragment() {','$begin_generate','vec4 original = $source(UV);','vec4 effect = $effect(UV);','ALBEDO = original.rgb + effect.rgb;','ALPHA = max(original.a, effect.a);','$end_generate','}'];
 const code='$definitions,float_uniform_to_const\nvec4 csMMEffect(vec2 UV) {\n$begin_generate\nreturn $effect(UV);\n$end_generate\n}\n';
 const outputs=[{type:'rgba',rgba:'$source($uv)'},{type:'rgba',rgba:'$effect($uv)'},...inputs.slice(2).map(({name})=>({type:'f',f:'$'+name+'($uv)'}))];
 return {name:'Cardscape Output',shortdesc:'保存后回传卡牌工坊',longdesc:'动态效果输出为 Shader；图片和灰度 Mask 输出为贴图。',parameters:[{name:'size',type:'size',default:9,first:6,last:11,label:'预览分辨率'}],inputs,outputs,global:'',instance:'',code:'',preview_shader:preview,exports:{[PROFILE]:{export_extension:'glsl',files:[{type:'template',file_name:'$(path_prefix).glsl',template:code},...inputs.map(({name},output)=>({type:'texture',file_name:'$(path_prefix)_'+name+'.png',output,conditions:'$(connected:'+name+')'}))]}}};
}
function sweep(){return {name:'Sweep',type:'shader',node_position:{x:30,y:20},parameters:{speed:3,frequency:24,width:12},shader_model:{name:'流光函数',shortdesc:'可编辑 GLSL / 可复用函数',parameters:[{name:'speed',type:'float',label:'速度',default:3,min:0,max:10,step:.1},{name:'frequency',type:'float',label:'频率',default:24,min:1,max:64,step:1},{name:'width',type:'float',label:'锐度',default:12,min:1,max:32,step:1}],inputs:[],outputs:[{type:'rgba',rgba:'vec4(vec3(csSweep($uv,$time,$speed,$frequency,$width))*vec3(0.1,0.55,1.0),csSweep($uv,$time,$speed,$frequency,$width))'}],global:'float csSweep(vec2 uv,float time,float speed,float frequency,float width) { return pow(max(0.0,0.5+0.5*sin(uv.y*frequency-time*speed)),width); }',instance:'',code:''}};}
function validateProject(value){if(!value||value.type!=='graph'||!Array.isArray(value.nodes)||value.nodes.length>256||!Array.isArray(value.connections)||value.connections.length>1024||JSON.stringify(value).length>2*1024*1024)throw Error('Material Maker 工程无效或过大');const names=new Set();for(const n of value.nodes){if(typeof n.name!=='string'||!n.name||names.has(n.name))throw Error('Material Maker 节点名称重复');names.add(n.name);}for(const c of value.connections)if(!names.has(c.from)||!names.has(c.to))throw Error('Material Maker 连线目标不存在');if(value.nodes.filter(n=>n.shader_model?.exports?.[PROFILE]).length!==1)throw Error('保留唯一的 Cardscape Output 输出节点');return value;}
function prepare(project,files){
 const value=project?clone(validateProject(project)):{type:'graph',name:'Cardscape Material',label:'Cardscape Material',node_position:{x:0,y:0},parameters:{},nodes:[sweep(),{name:'Cardscape',type:'material_export',node_position:{x:420,y:20},parameters:{size:9},shader_model:outputModel()}],connections:[{from:'Sweep',from_port:0,to:'Cardscape',to_port:1}]};
 const output=value.nodes.find(n=>n.shader_model?.exports?.[PROFILE]);output.shader_model=outputModel();
 for(const [name,file] of Object.entries(files)){
  const nodeName='CardscapeInput_'+name;let n=value.nodes.find(n=>n.name===nodeName);
  if(!n){const index=Object.keys(files).indexOf(name);n={name:nodeName,type:'image',node_position:{x:-380+(index%2)*190,y:20+Math.floor(index/2)*170},parameters:{fix_ar:false,clamp:true}};value.nodes.push(n);if(name==='source')value.connections.push({from:nodeName,from_port:0,to:output.name,to_port:0});}
  n.parameters={...n.parameters,image:file};
 }
 return validateProject(value);
}
function portable(project){const value=clone(validateProject(project));for(const n of value.nodes)if(n.name.startsWith('CardscapeInput_'))n.parameters.image=n.name.slice(15)+'.png';return value;}
module.exports={PROFILE,prepare,portable,validateProject,outputModel};
