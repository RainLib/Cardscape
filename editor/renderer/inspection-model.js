/* View-only whole-card diagnostics. No layer, mask or animation is rewritten. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardInspection=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const modes={inspect:'内外遮挡检查',rotate:'360° 正背面',move:'整卡移动'};
function config(value={}){return {mode:Object.hasOwn(modes,value.mode)?value.mode:'inspect',period:Number.isFinite(value.period)?Math.max(3,Math.min(30,value.period)):8};}
function sample(value,seconds){const c=config(value),p=((Math.max(0,Number.isFinite(seconds)?seconds:0)/c.period)%1),angle=p*Math.PI*2;
 if(c.mode==='rotate')return {yaw:p*360,pitch:0,x:0,y:0,progress:p};
 if(c.mode==='move')return {yaw:18*Math.sin(angle),pitch:12*Math.sin(angle*2),x:100*Math.sin(angle),y:70*Math.sin(angle*2),progress:p};
 const poses=[[0,0],[28,-16],[-28,16],[90,0],[180,0],[270,0],[360,0],[360,-18],[360,0]],i=Math.floor(p*8),f=p*8-i,t=f*f*(3-2*f),a=poses[i],b=poses[i+1];
 return {yaw:a[0]+(b[0]-a[0])*t,pitch:a[1]+(b[1]-a[1])*t,x:0,y:0,progress:p};
}
return {modes,config,sample};
});
