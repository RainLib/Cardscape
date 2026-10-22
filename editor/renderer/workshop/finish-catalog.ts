/* Editable recipes. Reference media never becomes a game asset. */
import importedCardFrameArtwork from '../editing/frame-artwork.ts';
import importedCardComponents from './component-model.ts';
import importedCardCosmetics from '../editing/cosmetics-model.ts';
import importedCardFrame from '../editing/frame-model.ts';

export interface FinishEntry {
 id: string; kind: 'material' | 'frame' | 'particles'; name: string; group: string;
 recipe: Record<string, string | number | boolean> & { color?: string; accent?: string; backgroundMode?: string; style?: string; finish?: string };
 preset?: string; artwork?: boolean; designId?: string; referenceStatus?: string;
}

const api = (()=>{
'use strict';

const materials:FinishEntry[]=[
 ['foil','幻彩箔面','反射','overlay','#72d9ff','#fd91f5'],['prism','彩虹棱镜','反射','overlay','#799dff','#ff8ee4'],
 ['gold','金色底','金属','overlay','#bc951e','#f5dc78'],['ink','黑白墨绘','灰度','overlay','#242424','#ffffff'],
 ['copper','铜金属','金属','replace','#602c14','#f4bf8d'],['steel','银钢金属','金属','replace','#263443','#e4edff'],
 ['goldprism','金色棱镜','反射','replace','#70471b','#ffdb80'],['blackprism','黑色棱镜','反射','replace','#060a16','#818ac5'],
 ['cosmic','宇宙星云','背景','replace','#111335','#ac77ed'],['glass','磨砂玻璃','反射','overlay','#74c7e3','#e2f9ff'],
 ['fire','火焰流动','背景','replace','#5b0b07','#ffcf53'],['water','水面波纹','背景','overlay','#174564','#a6f3ff'],
 ['rays','紫色旋涡放射','背景','replace','#090712','#aa51ee'],
 ['refraction','云彩折光','反射','replace','#94b7d4','#ecf3ff'],['psychedelic','迷幻流纹','背景','replace','#635ce2','#d8e8ff'],
 ['foilmetallic','幻彩金属','金属','replace','#5f6c91','#edf3ff'],['goldmetallic','鎏金金属','金属','replace','#936012','#fff1bb'],
 ['gildedprism','鎏金棱镜','反射','replace','#4c407e','#f6d58c'],['glasscircuits','玻璃电路','背景','replace','#244659','#a4eeff'],
 ['wakandanglass','瓦坎达玻璃','反射','overlay','#423085','#d57cda'],['galacticstorm','银河风暴','背景','replace','#0b122c','#b49bea'],['bananas','香蕉纹样','背景','replace','#6d4817','#ffe48a']
].map(([id,name,group,backgroundMode,color,accent])=>({id:'material-'+id,kind:'material',name,group,recipe:{enabled:true,style:id==='rays'?'rayspurple':id,target:['ink','wakandanglass'].includes(id)?'artwork':'background',backgroundMode,color,accent,strength:['ink','gold'].includes(id)?1:['prism','wakandanglass'].includes(id)?.85:id==='rays'?1:['water','glass','foil'].includes(id)?.55:.7,speed:id==='ink'?0:['rays','wakandanglass'].includes(id)?.35:id==='fire'?.35:['foil','prism','gold','copper','steel','goldprism','blackprism','foilmetallic','goldmetallic','gildedprism'].includes(id)?.65:.14,frequency:['prism','goldprism','blackprism'].includes(id)?5:4}}));
const frames:FinishEntry[]=[
 ['silver','银色金属','#647283','#f0f7ff','metal','none'],['gold','金色金属','#c7941a','#ffdf71','metal','none'],
 ['neon-blue','冰蓝霓虹','#188acb','#bceeff','glow','none'],['neon-red','绯红霓虹','#e13758','#ffe2ec','glow','none'],
 ['infinity','无限幻彩','#645acd','#effbff','glow','infinity']
].map(([id,name,color,accent,finish,animation])=>({id:'frame-'+id,kind:'frame',name,group:'边框',recipe:{name,shape:'rect',width:id.startsWith('neon-')?42:18,corner:48,depth:16,bevel:3,color,accent,finish,animation,animationSpeed:.55}}));
const frameReferences:FinishEntry[]=[
 ['neon-white','白色霓虹','#a7c7d7','#ffffff','glow'],['neon-yellow','黄色霓虹','#e7b328','#fff8bc','glow'],['neon-green','绿色霓虹','#35c677','#daffe7','glow'],['neon-purple','紫色霓虹','#9051df','#f3e3ff','glow'],
 ['copper','铜金属','#99592d','#fbd5a4','metal'],
 ['cosmic-blue','蓝色宇宙闪晶','#143e86','#96daff','cosmic'],['cosmic-gold','金色宇宙闪晶','#79601d','#fff2a1','cosmic'],['cosmic-green','绿色宇宙闪晶','#265217','#bcff87','cosmic'],['cosmic-orange','橙色宇宙闪晶','#6c330b','#ffc678','cosmic'],['cosmic-pink','粉色宇宙闪晶','#63274d','#ffbde8','cosmic'],['cosmic-red','红色宇宙闪晶','#6f1726','#ffb2b9','cosmic'],['cosmic-black','黑色宇宙闪晶','#0b0c10','#e2e7f2','cosmic'],['cosmic-rainbow','幻彩宇宙闪晶','#362154','#ddecff','cosmic'],
 ['matte-black','黑色哑光','#19191c','#454954','flat'],['matte-red','红色哑光','#9b2331','#de455b','flat'],['distressed-blue','蓝色磨损','#2836c8','#ece7e2','distressed'],['distressed-red','红色磨损','#9b2532','#e4ded7','distressed'],
 ['distressed-grey','灰色磨损','#565759','#e3e4e2','distressed'],['distressed-purple','紫色磨损','#6b267f','#dddade','distressed'],['distressed-pink','粉色磨损','#aa426f','#ece1e6','distressed'],['distressed-orange','橙色磨损','#9b5b13','#e8e3d6','distressed'],['distressed-gold','金色磨损','#b39815','#f0edc8','distressed'],['distressed-green','绿色磨损','#286847','#e0e6df','distressed'],
 ['web-black','黑色蛛网','#111419','#e6e8ea','web'],['web-red','红色蛛网','#b51c26','#f6e8e6','web'],['web-pink','粉色蛛网','#b75089','#f6ddeb','web'],
 ['distressed-copper','铜绿磨损','#744f35','#54c6b4','distressed-copper'],['distressed-rainbow','幻彩磨损','#274055','#c1f4ec','distressed-rainbow'],['neon-nights','Neon Nights 霓虹字牌','#283e4b','#ff48cf','neonnights'],
 ['chains-silver','银色链环','#1c2029','#eef2f7','chains'],['glyphs-green','翡翠符文','#008b78','#67ff31','glyphs'],['refraction-rainbow','幻彩折光','#092bac','#ebfcff','refraction'],['overloaded','Overdrive 充能','#f39b14','#fff8ac','overloaded'],
 ['pax-2025','Penny Arcade 彩绘喷溅','#481148','#fffdf5','pax'],
 ['brains','Brains 银白脑回','#413d46','#e4e3e9','brains'],
 ['candy-halloween','Halloween 紫橙糖果','#ac18d0','#ff672a','candy-halloween'],
 ['halloween-stickers','Halloween 绿光贴纸','#16bd06','#d2ff13','halloween-stickers'],
 ['snow-blue','蓝色雪花','#27528d','#e0f3ff','snow'],['snow-red','红色雪花','#95323d','#fff2ed','snow'],['wrapping','绿金包装纸','#244b36','#dfb578','wrapping'],['candy','红白糖果','#d72e44','#fff4f2','candy'],['ice','蓝色冰晶','#2c79c3','#c1edff','ice'],
 ['fire','橙色火焰','#f3470c','#ffce50','fire'],['fire-blue','蓝色火焰','#0757eb','#68f4ff','fire'],
 ['fire-gold','金色火焰','#d8a41d','#fff1a8','fire'],['fire-green','绿色火焰','#24b925','#c4ff54','fire'],
 ['fire-pink','粉色火焰','#e0469c','#ffdeee','fire'],['fire-purple','紫色火焰','#6924c9','#ca8cff','fire'],
 ['fire-rainbow','银白幻彩火焰','#b1c9d7','#f6f9ff','fire-iridescent'],['fire-red','红色火焰','#b80a20','#ff8790','fire'],
 ['fire-white','白色火焰','#9b9c9c','#fafcff','fire']
].map(([id,name,color,accent,finish])=>({id:'frame-'+id,kind:'frame',name,group:'边框',referenceStatus:'prototype',recipe:{name,shape:'rect',width:finish==='halloween-stickers'?32:finish==='glow'?42:finish==='chains'?40:finish==='distressed'?40:finish.startsWith('distressed-')?28:finish==='candy-halloween'?38:finish==='brains'?72:finish==='pax'?32:finish==='refraction'?32:finish==='overloaded'?24:finish==='neonnights'?24:18,corner:48,depth:16,bevel:3,color,accent,finish,animation:id==='cosmic-rainbow'?'infinity':'none',animationSpeed:['pax','halloween-stickers'].includes(finish)?1:.55}}));
const particles:FinishEntry[]=Object.entries(importedCardCosmetics.presets).filter(([id])=>!['wakanda','starcore'].includes(id)).map(([id,p])=>({id:'particles-'+id,kind:'particles',name:p.name,group:'粒子',preset:id,recipe:{palette:['confetti','hearts','flowers','paws'].includes(id)?'rainbow':['glimmer','diamond','embers','mixed'].includes(id)?'gold':'solid',color:id==='adamantium'?'#ffb729':['flowers','paws','pizza'].includes(id)?'#ffffff':id==='bubbles'?'#53b4e8':id==='snow'?'#d9f6ff':id==='pixels'?'#188ece':id==='leaves'?'#2c5926':id==='cosmic'?'#9261df':id==='orbs'?'#74baff':id==='bananas'?'#f1b83d':'#ffcb79'}}));
const colors=[['blue','蓝色','#3fe7ff'],['green','绿色','#77e587'],['purple','紫色','#b080ff'],['red','红色','#f36a7a'],['white','白色','#f0f8ff'],['black','黑色','#191a23'],['gold','金色','#ffd44b'],['copper','铜色','#ce8956'],['silver','银色','#bcc7d9'],['teal','青色','#36d1b8'],['orange','橙色','#ff9f3a'],['pink','粉色','#ff8bcb'],['rainbow','彩虹','#ffffff']];
const referenceParticles:FinishEntry[]=colors.flatMap(([id,name,color])=>['tone','stardust','glimmer','krackle','pixels'].map(preset=>({id:'particles-'+id+'-'+preset,kind:'particles',name:name+' · '+importedCardCosmetics.presets[preset].name,group:'粒子',preset,referenceStatus:'prototype',recipe:{color:preset==='pixels'&&id==='blue'?'#128de3':preset==='tone'&&id==='blue'?'#5b86c8':color,palette:id==='rainbow'?'rainbow':'solid',blend:id==='black'||['krackle','pixels','tone'].includes(preset)?'normal':'add'}})));
const specialParticles:FinishEntry[]=[
 ['rainbow-hearts','彩虹心形','hearts','#ffffff','rainbow'],['green-leaves','绿色叶片','leaves','#2c5926','solid'],['autumn-leaves','秋色叶片','leaves','#c76f2c','solid'],
 ['blue-embers','蓝色余烬','embers','#66b9ff','solid'],['green-embers','绿色余烬','embers','#8beea3','solid'],['fire-embers','火焰余烬','embers','#ff9c32','solid'],
 ['galactic-storm','银河风暴星芒','mixed','#9ad7ff','solid'],['neon-trails','霓虹拖尾','trails','#74ddff','rainbow'],
 ['gold-diamond-flare','金色钻石闪光','diamond','#ffcb79','gold'],['gold-wakandan-tech','金色科技符号','tech','#ffcb79','gold'],['purple-wakandan-tech','紫色科技光环','wakanda','#b44df0','solid'],
 ['bananas','香蕉','bananas','#f1b83d','solid'],['rainbow-confetti','彩虹纸屑','confetti','#ffffff','rainbow']
].filter(([id])=>!particles.some(p=>p.id==='particles-'+id)).map(([id,name,preset,color,palette])=>({id:'particles-'+id,kind:'particles',name,group:'粒子',preset,referenceStatus:'prototype',recipe:{color,palette}}));
const rayColors=[['pink','粉色','#713061','#f2a8df'],['black-and-white','黑白','#090b11','#cbd0db'],['red','红色','#571e28','#ef8292'],['blue','蓝色','#122e56','#77b8ef'],['green','绿色','#163e2f','#90d6ae'],['orange','橙色','#683c1d','#ffc58d']];
rayColors.push(['purple','紫色','#090712','#aa51ee']);
const rayReferences:FinishEntry[]=rayColors.map(([id,name,color,accent])=>({id:'material-'+id+'-rays',kind:'material',name:name+'放射光束',group:'背景',referenceStatus:'prototype',recipe:{...materials.find(m=>m.id==='material-rays').recipe,style:id==='purple'?'rayspurple':'rays',color,accent}}));
const symbioteReferences:FinishEntry[]=[['black','黑色','#0b1420','#d7dce2'],['red','红色','#681525','#e3dcdf'],['purple','紫色','#544063','#ded7e3'],['green','绿纹','#63182a','#82bd48'],['white','白色','#ced0d2','#20252a'],['yellow','黄色','#c6a537','#6f2420']].map(([id,name,color,accent])=>({id:'material-symbiote-'+id,kind:'material',name:name+'共生蛛网',group:'背景',referenceStatus:'prototype',recipe:{enabled:true,style:'symbiote',target:'background',backgroundMode:'replace',color,accent,strength:1,speed:.35,frequency:4}}));
const surfaceReferences:FinishEntry[]=[
 {id:'material-prism-replacement',kind:'material',name:'棱镜切面背景',group:'背景',referenceStatus:'prototype',recipe:{enabled:true,style:'prism',target:'background',backgroundMode:'replace',color:'#799dff',accent:'#ff8ee4',strength:1,speed:.65,frequency:5}},
 {id:'material-circuits',kind:'material',name:'绿金反射电路',group:'反射',referenceStatus:'prototype',recipe:{enabled:true,style:'circuits',target:'background',backgroundMode:'overlay',color:'#164755',accent:'#c2ec7b',strength:.85,speed:.35,frequency:4}},
 {id:'material-frosted',kind:'material',name:'漫反射磨砂',group:'反射',referenceStatus:'prototype',recipe:{enabled:true,style:'frosted',target:'background',backgroundMode:'overlay',color:'#94aaba',accent:'#edf2f4',strength:.85,speed:.35,frequency:4}},
 {id:'material-rainbow-rays',kind:'material',name:'幻彩旋涡放射',group:'背景',referenceStatus:'prototype',recipe:{enabled:true,style:'raysrainbow',target:'background',backgroundMode:'replace',color:'#070b13',accent:'#e5edf2',strength:1,speed:.35,frequency:4}}
];
const gradeFrames:FinishEntry[]=importedCardCosmetics.levels.filter(l=>l.rank>=0).map(l=>({id:'frame-grade-'+l.id,kind:'frame',name:l.name+'等级边框',group:'边框',referenceStatus:'prototype',recipe:importedCardCosmetics.border(l.id,importedCardFrame.defaults)}));
// Original designs have their own geometry and motion; they are not reference variants.
const originalDesigns:FinishEntry[]=[
 {id:'original-frame-stellar-art',designId:'F21',kind:'frame',name:'星辉能量 · 原稿素材',group:'原创',referenceStatus:'original',artwork:true,recipe:{name:'星辉能量 · 原稿素材',shape:'rect',width:36,corner:64,depth:16,bevel:4,color:'#93a3b2',accent:'#e9f8ff',finish:'metal',animation:'none',animationSpeed:1}},
 {id:'original-frame-f01',designId:'F01',kind:'frame',name:'星轨银环',group:'原创',referenceStatus:'original',recipe:{name:'星轨银环',shape:'rect',width:22,corner:48,depth:16,bevel:3,color:'#243744',accent:'#bce9ff',finish:'orbit-silver',animation:'none',animationSpeed:1}},
 {id:'original-frame-f02',designId:'F02',kind:'frame',name:'双生极光',group:'原创',referenceStatus:'original',recipe:{name:'双生极光',shape:'rect',width:24,corner:48,depth:16,bevel:3,color:'#183343',accent:'#6cfff3',finish:'twin-aurora',animation:'none',animationSpeed:1}},
 {id:'original-particles-p01',designId:'P01',kind:'particles',name:'星核交叠',group:'原创',referenceStatus:'original',preset:'starcore',recipe:{enabled:true,visual:'starcore',count:32,size:.075,speed:.035,spread:.4,lifetime:7,radius:.055,opacity:.88,color:'#80d7ff',palette:'solid',stretch:1,blend:'normal',trajectory:'halo',placement:'behind',z:-.08}},
 {id:'original-material-b05',designId:'B05',kind:'material',name:'深海焦散',group:'背景',referenceStatus:'original',recipe:{enabled:true,style:'caustics',target:'background',backgroundMode:'replace',color:'#07344c',accent:'#91f5e5',strength:1,speed:1,frequency:4}}
];
const entries:FinishEntry[]=[...materials,...rayReferences,...symbioteReferences,...surfaceReferences,...frames,...frameReferences,...gradeFrames,...particles,...referenceParticles,...specialParticles,...originalDesigns];
function find(id){const e=entries.find(e=>e.id===id);if(!e)throw Error('效果配方不存在');return e;}
function value(id,current: any={}){const e=find(id);if(e.kind==='frame'){if(e.artwork)return importedCardFrameArtwork.value({...importedCardFrame.defaults,...e.recipe},importedCardFrameArtwork.current());if(current.document?.id==='stellar-frame-art')current={};const style={...importedCardFrame.resolve({frameStyle:current.style||current}),...e.recipe};return {...(current.schema==='card-frame/1'?current:{}),schema:'card-frame/1',style,...(current.document?{document:{...current.document,frameStyle:style}}:{})};}return e.kind==='material'?importedCardComponents.material({...current,...e.recipe}):importedCardComponents.particles({...importedCardCosmetics.particlePreset(e.preset,current),...e.recipe});}
function apply(d,id){const e=find(id);if(e.kind==='frame'){const v=value(id,d.componentScenes?.frame||d.frameStyle);if(d.assetKind==='frame'&&e.artwork){const identity={id:d.id,name:d.name};Object.assign(d,v.document,identity);delete d.componentScenes;}else{d.frameStyle=v.style;if(v.document)d.componentScenes={...d.componentScenes,frame:v};else if(d.componentScenes?.frame){d.componentScenes={...d.componentScenes};delete d.componentScenes.frame;}}d.cosmetics={...importedCardCosmetics.config(d.cosmetics),border:'custom'};return d;}d[e.kind]=value(id,d[e.kind]);d.cosmetics={...importedCardCosmetics.config(d.cosmetics),[e.kind==='material'?'finish':'flare']:e.kind==='material'?'original':'authored'};if(d.componentScenes?.[e.kind])d.componentScenes={...d.componentScenes,[e.kind]:{...d.componentScenes[e.kind],...d[e.kind]}};return d;}
return {entries,find,value,apply};
})();

export default api;
