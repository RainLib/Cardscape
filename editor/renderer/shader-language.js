(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ShaderLanguage=api;})(typeof window==='object'?window:this,()=>{
 'use strict';
 const vars={
  uv:{detail:'vec2 · 源图 UV',info:'0–1 的图层 UV 坐标；uv.x 水平，uv.y 垂直。'},
  time:{detail:'float · 动画时间',info:'以秒为单位的预览时间。'},
  angle:{detail:'vec2 · 查看角度',info:'卡片左右 / 上下旋转角度，单位为弧度。'},
  q:{detail:'vec3 · 顶点位置',info:'当前顶点位置；修改 q.xyz，再 return q。'},
  bend:{detail:'float · 整体弯曲',info:'动作及几何面板控制的弯曲强度。'},
  color:{detail:'vec4 · 图层颜色',info:'已采样的 RGBA 颜色；修改 color.rgb / color.a，再 return color。'},
  mask:{detail:'vec4 · 效果通道',info:'r 运动、g 框内外、b 发光、a 流光进度。单独选择的限制区域在函数外混合效果。'},
  customStrength:{detail:'float · 效果强度',info:'GLSL 面板设置的强度。函数外也会用它混合效果；直接乘用会叠加影响。'}
 };
 const functions=[['sin','genType sin(genType x)','正弦，输入弧度。','sin(${x})'],['cos','genType cos(genType x)','余弦，输入弧度。','cos(${x})'],['pow','genType pow(genType x, genType y)','幂次，可收紧扫光。','pow(${x}, ${y})'],['mix','genType mix(x, y, a)','从 x 到 y 线性混合。','mix(${x}, ${y}, ${a})'],['smoothstep','genType smoothstep(edge0, edge1, x)','在两个阈值之间平滑过渡。','smoothstep(${edge0}, ${edge1}, ${x})'],['clamp','genType clamp(x, minVal, maxVal)','限制范围。','clamp(${x}, ${0.0}, ${1.0})'],['fract','genType fract(genType x)','小数部分，适合循环进度。','fract(${x})'],['floor','genType floor(genType x)','向下取整。','floor(${x})'],['abs','genType abs(genType x)','绝对值。','abs(${x})'],['min','genType min(x, y)','最小值。','min(${x}, ${y})'],['max','genType max(x, y)','最大值。','max(${x}, ${y})'],['dot','float dot(x, y)','向量点积。','dot(${x}, ${y})'],['length','float length(genType x)','向量长度。','length(${x})'],['normalize','genType normalize(genType x)','单位向量。','normalize(${x})'],['step','genType step(edge, x)','阈值阶跃。','step(${edge}, ${x})']];
 const snippets=[
  {id:'energy-flow',stage:'fragment',label:'energyFlow',name:'能量流光',info:'按 mask.a 的路径顺序流动；可绑定发光 Mask。',template:'float ${pulse} = pow(0.5 + 0.5 * sin(mask.a * ${30.0} - time * ${3.0}), 3.0);\ncolor.rgb += vec3(${0.05}, ${0.8}, ${1.0}) * ${pulse};'},
  {id:'foil-shine',stage:'fragment',label:'foilShine',name:'角度箔面',info:'反光随卡片旋转角度移动。',template:'float ${shine} = pow(0.5 + 0.5 * sin(uv.x * 18.0 + uv.y * 8.0 + angle.x * 7.0), ${8.0});\ncolor.rgb += vec3(0.7, 0.35, 0.9) * ${shine};'},
  {id:'alpha-fade',stage:'fragment',label:'alphaFade',name:'局部溶解',info:'使用 UV 与时间改变透明度。',template:'float ${threshold} = 0.35 + 0.25 * sin(time);\ncolor.a *= smoothstep(${threshold}, ${threshold} + ${0.06}, uv.y);'},
  {id:'tint-mix',stage:'fragment',label:'tintMix',name:'颜色混合',info:'将原画与指定颜色混合。',template:'color.rgb = mix(color.rgb, vec3(${0.8}, ${0.15}, ${0.1}), ${0.25});'},
  {id:'bend-card',stage:'geometry',label:'bendCard',name:'卡片弯曲',info:'弯曲幅度由 bend 属性控制。',template:'q.z += bend * (q.x * q.x - ${0.25});'},
  {id:'wind-wave',stage:'geometry',label:'windWave',name:'顶点波动',info:'以 UV 控制局部顶点位移；整体卡片网格适用。',template:'float ${wave} = sin(time * ${2.0} + uv.y * ${8.0});\nq.z += ${wave} * ${0.01} * uv.y;'},
  {id:'for-loop',stage:'both',label:'forLoop',name:'常量循环',info:'WebGL 1 使用常量循环上限。',template:'for (int ${i} = 0; ${i} < ${4}; ${i}++) {\n\t${}\n}'},
  {id:'return-result',stage:'fragment',label:'returnColor',name:'返回颜色',info:'材质函数末尾返回 vec4。',template:'return color;'},
  {id:'return-position',stage:'geometry',label:'returnPosition',name:'返回顶点',info:'几何函数末尾返回 vec3。',template:'return q;'}
 ];
 function symbols(stage,code=''){
  const names=stage==='geometry'?['q','uv','time','bend','angle']:['color','uv','time','mask','angle','customStrength'];
  const result=names.map(label=>({label,type:'variable',...vars[label]}));
  for(const [label,detail,info,template] of functions)result.push({label,type:'function',detail,info,template});
  for(const label of ['float','int','bool','vec2','vec3','vec4','mat2','mat3','mat4','if','else','for','return'])result.push({label,type:'keyword'});
  const cleaned=code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,' '),decl=/\b(float|int|bool|vec[234]|mat[234])\s+([A-Za-z_]\w*)/g;let m;
  while((m=decl.exec(cleaned)))if(!result.some(s=>s.label===m[2]))result.push({label:m[2],type:'variable',detail:m[1]+' · 局部变量'});
  return result;
 }
 function memberSymbols(base,stage,code=''){
  if(base==='mask'&&stage==='fragment')return [['r','运动权重'],['g','框内外权重'],['b','发光权重'],['a','流光进度'],['rgba','全部通道']].map(([label,detail])=>({label,type:'property',detail}));
  const type=symbols(stage,code).find(s=>s.label===base)?.detail?.match(/vec([234])/),n=type?Number(type[1]):0;
  return (n?['xyzw'.slice(0,n),'rgba'.slice(0,n)]:[]).flatMap(x=>[...x,x]).map(label=>({label,type:'property',detail:'向量分量'})).filter((s,i,a)=>a.findIndex(x=>x.label===s.label)===i);
 }
 function stageSnippets(stage,custom=[]){return [...snippets,...custom].filter(s=>s.stage===stage||s.stage==='both');}
 function diagnostics(log,lineCount){const result=[];for(const row of String(log).split('\n')){const m=row.match(/(?:ERROR|WARNING):\s*\d+:(\d+)(?::|\((\d+)\))\s*(.*)/i)||row.match(/\d+\((\d+)\)\s*:\s*(.*)/);if(!m)continue;const line=Number(m[1]);if(line<1||line>lineCount)continue;result.push({line,message:m.at(-1).trim(),severity:/WARNING/i.test(row)?'warning':'error'});}return result;}
 return {symbols,memberSymbols,stageSnippets,diagnostics};
});
