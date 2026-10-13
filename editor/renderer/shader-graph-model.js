/* Typed, bounded code generation. LiteGraph is only the authoring surface. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardShaderGraph=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const definitions={
 'input/time':{name:'时间',out:'float',expr:()=> 'time'},
 'input/uv':{name:'UV 坐标',out:'vec2',expr:()=> 'uv'},
 'input/angle':{name:'查看角度',out:'vec2',expr:()=> 'angle'},
 'input/color':{name:'原图颜色',out:'vec4',stage:'fragment',expr:()=> 'color'},
 'input/position':{name:'顶点位置',out:'vec3',stage:'geometry',expr:()=> 'q'},
 'input/bend':{name:'弯曲属性',out:'float',stage:'geometry',expr:()=> 'bend'},
 'value/float':{name:'数值',out:'float',properties:{value:1},expr:(a,p)=> number(p.value)},
 'value/color':{name:'颜色',out:'vec3',properties:{color:'#40ccff'},expr:(a,p)=>'vec3('+[1,3,5].map(i=>number(parseInt(p.color.slice(i,i+2),16)/255)).join(', ')+')'},
 'vector/x':{name:'水平分量 X',inputs:[['向量','vec2']],out:'float',expr:a=>'('+a[0]+').x'},
 'vector/y':{name:'垂直分量 Y',inputs:[['向量','vec2']],out:'float',expr:a=>'('+a[0]+').y'},
 'mask/channel':{name:'Mask 通道',out:'float',stage:'fragment',properties:{channel:'b'},expr:(a,p)=>'mask.'+p.channel},
 'math/add':{name:'相加',inputs:[['A','float'],['B','float']],out:'float',expr:a=>a[0]+' + '+a[1]},
 'math/multiply':{name:'相乘',inputs:[['A','float'],['B','float']],out:'float',expr:a=>a[0]+' * '+a[1]},
 'math/sin':{name:'正弦',inputs:[['输入','float']],out:'float',expr:a=>'sin('+a[0]+')'},
 'math/fract':{name:'循环小数',inputs:[['输入','float']],out:'float',expr:a=>'fract('+a[0]+')'},
 'math/pow':{name:'幂次',inputs:[['输入','float'],['指数','float']],out:'float',expr:a=>'pow(max(abs('+a[0]+'), 0.000001), clamp('+a[1]+', -16.0, 16.0))'},
 'math/smoothstep':{name:'平滑渐变',inputs:[['起点','float'],['终点','float'],['输入','float']],out:'float',expr:a=>'smoothstep('+a.join(', ')+')'},
 'effect/emission':{name:'叠加发光',stage:'fragment',inputs:[['原色','vec4'],['光色','vec3'],['强度','float']],out:'vec4',expr:a=>'vec4('+a[0]+'.rgb + '+a[1]+' * '+a[2]+', '+a[0]+'.a)'},
 'effect/tint':{name:'混合颜色',stage:'fragment',inputs:[['原色','vec4'],['颜色','vec3'],['比例','float']],out:'vec4',expr:a=>'vec4(mix('+a[0]+'.rgb, '+a[1]+', clamp('+a[2]+', 0.0, 1.0)), '+a[0]+'.a)'},
 'effect/alpha':{name:'透明度',stage:'fragment',inputs:[['原色','vec4'],['权重','float']],out:'vec4',expr:a=>'vec4('+a[0]+'.rgb, '+a[0]+'.a * clamp('+a[1]+', 0.0, 1.0))'},
 'effect/offset':{name:'顶点 Z 偏移',stage:'geometry',inputs:[['位置','vec3'],['偏移','float'],['权重','float']],out:'vec3',expr:a=>a[0]+' + vec3(0.0, 0.0, '+a[1]+' * clamp('+a[2]+', 0.0, 1.0))'},
 'effect/bend':{name:'卡片弯曲',stage:'geometry',inputs:[['位置','vec3'],['弯曲','float']],out:'vec3',expr:a=>a[0]+' + vec3(0.0, 0.0, '+a[1]+' * ('+a[0]+'.x * '+a[0]+'.x - 0.25))'},
 'output/color':{name:'材质输出',stage:'fragment',inputs:[['颜色','vec4']],output:true},
 'output/position':{name:'几何输出',stage:'geometry',inputs:[['位置','vec3']],output:true}
};
function number(v){if(!Number.isFinite(v)||Math.abs(v)>10000)throw Error('节点数值须在 -10000 至 10000 之间');const s=String(v);return /[.eE]/.test(s)?s:s+'.0';}
function kind(type){return definitions[String(type).replace(/^card\//,'')];}
function validate(g,stage=g?.stage){
 if(!g||g.schema!=='card-shader-graph/1'||!['fragment','geometry'].includes(stage)||g.stage!==stage||!Array.isArray(g.nodes)||g.nodes.length>64||!Array.isArray(g.links)||g.links.length>192||JSON.stringify(g).length>65536)throw Error('节点图无效：最多 64 个节点、192 条连线');
 const nodes=new Map();for(const n of g.nodes){const d=kind(n.type);if(!Number.isSafeInteger(n.id)||n.id<1||nodes.has(n.id)||!d||d.stage&&d.stage!==stage)throw Error('节点类型或编号无效');nodes.set(n.id,n);if(!Array.isArray(n.pos)||n.pos.length!==2||!n.pos.every(Number.isFinite))throw Error('节点位置无效');const p={...d.properties,...n.properties};if(d.properties?.value!==undefined)number(p.value);if(d.properties?.color&&!/^#[\da-f]{6}$/i.test(p.color))throw Error('节点颜色无效');if(d.properties?.channel&&!['r','g','b','a'].includes(p.channel))throw Error('Mask 通道无效');}
 const targets=new Set(),ids=new Set();for(const l of g.links){if(!Array.isArray(l)||l.length!==6||!Number.isSafeInteger(l[0])||ids.has(l[0]))throw Error('节点连线无效');ids.add(l[0]);const a=nodes.get(l[1]),b=nodes.get(l[3]),ad=kind(a?.type),bd=kind(b?.type),key=l[3]+':'+l[4];if(!a||!b||l[2]!==0||!Number.isInteger(l[4])||l[4]<0||!ad.out||bd.inputs?.[l[4]]?.[1]!==ad.out||l[5]!==ad.out||targets.has(key))throw Error('节点连线类型不匹配或输入重复');targets.add(key);}
 return nodes;
}
function compile(g){const nodes=validate(g),outputs=g.nodes.filter(n=>kind(n.type).output);if(outputs.length!==1)throw Error('需要且只能有一个输出节点');const visited=new Set(),stack=new Set(),lines=[],inputs=new Map(g.links.map(l=>[l[3]+':'+l[4],l[1]]));
 function emit(id){const n=nodes.get(id),d=kind(n.type);if(stack.has(id))throw Error('节点连线存在循环');if(visited.has(id))return 'sg'+id;stack.add(id);const a=(d.inputs||[]).map((p,i)=>{const src=inputs.get(id+':'+i);if(!src)throw Error(d.name+'：请连接「'+p[0]+'」');return emit(src);});if(d.output)lines.push('return '+a[0]+';');else lines.push(d.out+' sg'+id+' = '+d.expr(a,{...d.properties,...n.properties})+';');stack.delete(id);visited.add(id);return 'sg'+id;}
 // Detect cycles in disconnected drafts too; only reachable nodes generate code.
 const checked=new Set();function cycle(id,path=new Set()){if(path.has(id))throw Error('节点连线存在循环');if(checked.has(id))return;path.add(id);for(const l of g.links)if(l[3]===id)cycle(l[1],path);path.delete(id);checked.add(id);}for(const id of nodes.keys())cycle(id);
 emit(outputs[0].id);const body=lines.join('\n');if(body.length>4096)throw Error('生成的函数超过 4096 字符，请减少节点');return body;
}
function preset(stage,name='original'){let id=0,lid=0;const nodes=[],links=[];function add(type,x,y,properties={}){const d=kind(type),n={id:++id,type:'card/'+type,pos:[x,y],size:[155,75],properties:{...d.properties,...properties},inputs:(d.inputs||[]).map(([name,type])=>({name,type,link:null})),outputs:d.out?[{name:'输出',type:d.out,links:[]}]:[]};nodes.push(n);return n;}function link(a,b,slot){const l=[++lid,a.id,0,b.id,slot,kind(a.type).out];links.push(l);a.outputs[0].links.push(lid);b.inputs[slot].link=lid;}
 const base=add(stage==='fragment'?'input/color':'input/position',35,80);
 if(name==='original'){let last=base;if(stage==='geometry'){const bend=add('input/bend',35,205),b=add('effect/bend',245,90);link(base,b,0);link(bend,b,1);last=b;}const output=add(stage==='fragment'?'output/color':'output/position',stage==='geometry'?470:290,80);link(last,output,0);}
 else{const time=add('input/time',35,300),speed=add('value/float',35,395,{value:stage==='fragment'?-3:2}),tm=add('math/multiply',230,290);link(time,tm,0);link(speed,tm,1);const input=add(stage==='fragment'?'mask/channel':'input/uv',35,510,stage==='fragment'?{channel:'a'}:{});let phase=input;if(stage==='geometry'){phase=add('vector/y',230,505);link(input,phase,0);}const freq=add('value/float',230,620,{value:stage==='fragment'?24:8}),pm=add('math/multiply',440,470);link(phase,pm,0);link(freq,pm,1);const sum=add('math/add',640,300);link(tm,sum,0);link(pm,sum,1);const sin=add('math/sin',840,300);link(sum,sin,0);
 let strength=sin;if(stage==='fragment'){const half=add('value/float',840,450,{value:.5}),mul=add('math/multiply',1040,300);link(sin,mul,0);link(half,mul,1);strength=add('math/add',1230,300);link(mul,strength,0);link(half,strength,1);}else{const amp=add('value/float',840,450,{value:.01});strength=add('math/multiply',1040,300);link(sin,strength,0);link(amp,strength,1);}
 const effect=add(stage==='fragment'?'effect/emission':'effect/offset',1450,85);link(base,effect,0);if(stage==='fragment'){const tint=add('value/color',1230,180);link(tint,effect,1);link(strength,effect,2);}else{link(strength,effect,1);link(phase,effect,2);}const output=add(stage==='fragment'?'output/color':'output/position',1660,85);link(effect,output,0);}
 if(name!=='original'){
  // Fold the math chain into a readable workbench instead of a long strip.
  const positions=stage==='fragment'?[[650,40],[35,75],[35,180],[240,95],[35,400],[35,505],[240,420],[445,200],[445,330],[650,390],[650,265],[855,420],[855,75],[650,155],[855,235]]:[[650,40],[35,75],[35,180],[240,95],[35,390],[240,390],[240,510],[445,450],[445,200],[650,240],[650,350],[650,480],[855,75],[855,235]];
  nodes.forEach((n,i)=>n.pos=positions[i]);
 }
 return {schema:'card-shader-graph/1',stage,last_node_id:id,last_link_id:lid,nodes,links,groups:[],config:{},version:.4};
}
return {definitions,kind,validate,compile,preset};
});
