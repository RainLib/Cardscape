/* Authoring data stays intact; level previews derive a cheap render document. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./component-model.js'):root.CardComponents,typeof module==='object'&&module.exports?require('./frame-model.js'):root.CardFrame);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardCosmetics=api;})(typeof window==='object'?window:this,(C,F)=>{
'use strict';
const levels=[['authored','原始设置','保留制作效果'],['common','普通','平面原画'],['uncommon','不凡','人物破框'],['rare','稀有','空间视差'],['epic','史诗','人物与武器动态'],['legendary','传说','字标扫光'],['ultra','超稀有','动态边框'],['infinity','无限','幻彩动态边框']].map(([id,name,feature],rank)=>({id,name,feature,rank:rank-1}));
const finishes=[['original','原画'],['foil','幻彩箔面'],['prism','棱镜箔面'],['gold','金色底'],['ink','黑白墨绘']].map(([id,name])=>({id,name}));
const presets={
adamantium:{name:'Adamantium 面具',visual:'adamantium',color:'#ffb729',palette:'solid',count:40,size:.08,speed:.35,spread:1,lifetime:.5,radius:.09,opacity:1,blend:'normal',placement:'front',trajectory:'halo',z:.25,emitter:{target:'card',shape:'perimeter',side:'front'}},
 starcore:{name:'星核交叠 · 原创',visual:'starcore',color:'#80d7ff',palette:'solid',count:32,size:.075,speed:.035,spread:.4,lifetime:7,radius:.055,opacity:.88,stretch:1,blend:'normal',trajectory:'halo',placement:'behind',z:-.08,emitter:{target:'frame',shape:'perimeter',side:'front'}},
 tone:{name:'半调网点',visual:'tone',count:22,size:.055,speed:.012,spread:.45,lifetime:7,radius:.035,opacity:.82,blend:'normal',stretch:1.8,emitter:{target:'frame',shape:'perimeter',side:'front'}},
 cosmic:{name:'宇宙星云与流星',visual:'cosmic',color:'#9261df',palette:'solid',count:72,size:.08,speed:.028,spread:.65,lifetime:5,radius:.065,opacity:.72,stretch:1,trajectory:'halo',placement:'behind',z:-.10,emitter:{target:'card',shape:'perimeter',side:'front'}},
 stardust:{name:'星尘',visual:'dust',count:72,size:.005,speed:.055,spread:.6,lifetime:7,radius:.055,opacity:.6},
 glimmer:{name:'Glimmer 闪片',visual:'shard',count:56,size:.018,speed:.055,spread:.55,lifetime:2.8,radius:.065,opacity:1,stretch:1.2,trajectory:'field',placement:'front',z:.23,reveal:{enabled:true,duration:.24,count:44,size:.025,travel:.18,stretch:8},emitter:{target:'card',shape:'rect',side:'front'}},
 krackle:{name:'克拉克大光点',visual:'krackle',count:72,size:.052,speed:.018,spread:.8,lifetime:2.1,radius:.07,opacity:1,blend:'normal'},
 trails:{name:'Neon Trails 放射光束',visual:'streak',palette:'rainbow',count:28,size:.010,speed:.075,spread:.5,lifetime:5,stretch:3,radius:.04,opacity:1,placement:'behind',z:-.08,reveal:{enabled:true,only:true,visual:'streak',profile:'trails',stagger:.5,duration:1.6,count:32,size:.0525,travel:2.8,stretch:8},emitter:{target:'card',shape:'rect',side:'front'}},
 embers:{name:'余烬',visual:'ember',count:48,size:.008,speed:.065,spread:.65,lifetime:6,stretch:1.6,radius:.06,opacity:.65},
 snow:{name:'六角雪花',visual:'snow',count:28,size:.014,speed:.04,spread:.45,lifetime:8,radius:.06,opacity:.6},
 confetti:{name:'彩色纸屑',visual:'confetti',count:32,size:.012,speed:.055,spread:.65,lifetime:7,blend:'normal',radius:.06,opacity:.75},
 diamond:{name:'金色钻石',visual:'diamond',palette:'gold',count:32,size:.045,speed:.055,spread:.3,lifetime:2.2,radius:.06,opacity:1,blend:'normal',placement:'behind',z:-.08,reveal:{enabled:true,visual:'source',duration:.7,count:56,size:.045,travel:.5,stretch:1},emitter:{target:'card',shape:'perimeter',direction:'outward',side:'front'}},
 bubbles:{name:'透明气泡',visual:'bubble',color:'#53b4e8',palette:'solid',count:12,size:.08,speed:.24,spread:.45,lifetime:3.8,radius:.07,opacity:.9,blend:'normal',placement:'behind',trajectory:'halo',z:-.08,emitter:{target:'card',shape:'perimeter',direction:'up',side:'front'}},
 orbs:{name:'纯色大圆点',visual:'orb',count:18,size:.046,speed:.04,spread:.7,lifetime:8,radius:.045,opacity:.75,blend:'normal'},
 wakanda:{name:'紫色科技光环',visual:'wakanda',color:'#b44df0',palette:'solid',count:52,size:.06,speed:.07,spread:.45,lifetime:3.5,radius:.06,opacity:.8,blend:'normal',stretch:1,trajectory:'halo',placement:'behind',z:-.08,emitter:{target:'card',shape:'perimeter',side:'front'}},
 tech:{name:'科技六角符号',visual:'tech',count:22,size:.025,speed:.03,spread:.5,lifetime:7,radius:.04,opacity:.8,blend:'normal'},
 bananas:{name:'香蕉',visual:'banana',color:'#f1b83d',palette:'solid',count:20,size:.08,speed:.24,spread:.5,lifetime:1.7,radius:.07,opacity:1,blend:'normal',trajectory:'halo',placement:'behind',z:-.08,emitter:{target:'card',shape:'perimeter',direction:'outward',side:'front'}},
 pixels:{name:'像素方块',visual:'pixel',count:48,size:.020,speed:.055,spread:.3,lifetime:3,radius:.04,opacity:.95,blend:'normal',placement:'front',trajectory:'float',z:.23,emitter:{target:'card',shape:'rect',direction:'up',side:'front'}},
 hearts:{name:'彩色心形',visual:'heart',count:32,size:.038,speed:.045,spread:.35,lifetime:4,radius:.05,opacity:1,blend:'normal',placement:'front',trajectory:'float',z:.25,emitter:{target:'card',shape:'rect',direction:'up',side:'front'}},
 leaves:{name:'细叶飘动',visual:'leaf',count:48,size:.020,speed:.040,spread:.6,lifetime:4,radius:.05,opacity:.95,blend:'normal',placement:'front',trajectory:'float',z:.20,emitter:{target:'card',shape:'rect',direction:'angle',angle:135,side:'front'}},
 flowers:{name:'彩虹花朵',visual:'flower',color:'#ffffff',palette:'rainbow',count:44,size:.055,speed:.035,spread:.75,lifetime:1.6,radius:.07,opacity:1,blend:'normal',placement:'front',trajectory:'halo',z:.23,emitter:{target:'card',shape:'perimeter',side:'front'}},
 paws:{name:'彩虹爪印',visual:'paw',color:'#ffffff',palette:'rainbow',count:32,size:.045,speed:.03,spread:.7,lifetime:2,radius:.065,opacity:1,blend:'normal',placement:'front',trajectory:'halo',z:.23,emitter:{target:'card',shape:'perimeter',side:'front'}},
 pizza:{name:'披萨切片',visual:'pizza',color:'#ffffff',palette:'solid',count:24,size:.065,speed:.028,spread:.7,lifetime:2.6,radius:.07,opacity:1,blend:'normal',placement:'front',trajectory:'halo',z:.23,emitter:{target:'card',shape:'perimeter',side:'front'}},
 mixed:{name:'圆点与星芒',visual:'mixed',count:40,size:.015,speed:.025,spread:.65,lifetime:7,radius:.035,opacity:.92,blend:'normal'}
};
const borders={common:['#888c95','#b9bec6'],uncommon:['#279b54','#7dffa0'],rare:['#2864cb','#8bd5ff'],epic:['#8039b9','#dab1ff'],legendary:['#b47414','#ffe196'],ultra:['#c82832','#ffaea1'],infinity:['#6436a7','#a2edff']};
const defaults={schema:'card-cosmetics/1',level:'authored',finish:'original',flare:'authored',border:'grade',quality:'balanced'};
const qualities={low:{name:'省电',particles:48,dpr:1,fps:24},balanced:{name:'均衡',particles:128,dpr:1.5,fps:30},high:{name:'精细',particles:256,dpr:1.75,fps:30}};
function config(v={}){return {...defaults,...v};}
function budget(quality='balanced',visibleCards=1){const q=qualities[quality]||qualities.balanced,n=Math.max(1,Math.floor(visibleCards)||1);return {...q,particles:Math.max(8,Math.floor(q.particles/n))};}
function validate(v){const c=config(v);if(!v||c.schema!==defaults.schema||!levels.some(x=>x.id===c.level)||!finishes.some(x=>x.id===c.finish)||!['authored','none',...Object.keys(presets)].includes(c.flare)||!['grade','custom'].includes(c.border)||!qualities[c.quality])throw Error('卡片等级或外观预设无效');}
function particlePreset(id,current={}){const p=presets[id];if(!p)throw Error('粒子预设不存在');const {name,...values}=p;return C.particles({...current,...values,reveal:C.reveal(values.reveal),enabled:true,preset:id,trajectory:values.trajectory||'halo',placement:values.placement||'behind',z:values.z??-.08,stretch:values.stretch||1,blend:values.blend||'add',emitter:C.emitter(current.emitter?.regionId||current.emitter?.layerId?current.emitter:values.emitter||current.emitter||{target:'frame'})});}
function border(level,current={}){const colors=borders[level];if(!colors)throw Error('边框等级无效');return {...F.resolve({frameStyle:current}),name:levels.find(l=>l.id===level).name+' · 切角边框',color:colors[0],accent:colors[1],finish:['ultra','infinity'].includes(level)?'glow':level==='common'?'flat':'metal',animation:level==='infinity'?'infinity':level==='ultra'?'flow':'none',animationSpeed:.6};}
function resolve(source,options={}){
 const c=config(source.cosmetics),level=options.level||c.level,tier=levels.find(l=>l.id===level)||levels[0],rank=tier.rank;
 const d={...source,cosmetics:c,cosmeticPreview:{level:tier.id,parallax:rank<0||rank>=2,motion:rank<0||rank>=3,title:rank<0||rank>=4,border:rank<0||rank>=5}};
 if(rank>=0){d.frameStyle=c.border==='custom'&&(!options.level||options.level===c.level)?F.resolve(source):border(level,source.frameStyle);if(rank<5)d.frameStyle={...d.frameStyle,animation:'none'};d.effects={...source.effects,cape:rank>=3&&source.effects?.cape!==false,flow:rank>=3&&source.effects?.flow!==false,background:rank>=2?(source.effects?.background??1):0,depth:rank>=2?(source.effects?.depth??1):0};d.composition=rank>=1?{top:true,right:true,bottom:false,left:true,...source.composition}:{top:false,right:false,bottom:false,left:false};
 if(rank<2){d.spatial={schema:'card-spatial/1',...source.spatial,enabled:true};d.layers=source.layers.map(l=>l.kind==='frame'?l:{...l,spatial:{...l.spatial,role:l.spatial?.role||(['background','image'].includes(l.kind)?'mid':'body'),z:.04}});}
 if(rank<3){d.deformation={...source.deformation,bend:0,wind:0};d.shader={...source.shader,fragmentStrength:0};d.armor={...source.armor,enabled:false};}
 }
 if(c.finish!=='original'){const gold=c.finish==='gold';d.material=C.material({...source.material,enabled:true,style:c.finish,target:c.finish==='ink'?'artwork':'background',strength:c.finish==='ink'||gold?1:.5,backgroundMode:gold?'overlay':source.material?.backgroundMode||'overlay',color:gold?'#bc951e':'#72d9ff',accent:gold?'#f5dc78':'#fd91f5'});}
 if(c.flare==='none')d.particles=C.particles({...source.particles,enabled:false});else if(c.flare!=='authored')d.particles=particlePreset(c.flare,source.particles);
 const q=budget(c.quality,options.visibleCards);if(d.particles)d.particles=C.particles({...d.particles,count:Math.min(d.particles.count,q.particles)});
 // The applied frame component is a render copy, so changing grades never edits the shared asset.
 if(rank>=0&&source.componentScenes?.frame?.document){const frame=source.componentScenes.frame;d.componentScenes={...source.componentScenes,frame:{...frame,document:{...frame.document,frameStyle:d.frameStyle,cosmetics:{...defaults,quality:c.quality}}}};}
 if(source.componentScenes?.material?.document){const value=source.componentScenes.material;d.componentScenes={...d.componentScenes,material:{...value,document:{...value.document,material:d.material,cosmetics:{...defaults,quality:c.quality}}}};}
 if(source.componentScenes?.particles&&(c.flare!=='authored'||source.particles))d.componentScenes={...d.componentScenes,particles:{...source.componentScenes.particles,document:{...source.componentScenes.particles.document,particles:d.particles,cosmetics:{...defaults,quality:c.quality}}}};
 return d;
}
function requirements(d){return [!d.layers?.some(l=>l.visible&&l.kind==='foreground')&&'人物透明图层',!d.masks?.inset&&'框内 / 破框 Mask',!d.masks?.motion&&'运动 Mask',!d.masks?.emission&&'发光 Mask',!d.masks?.phase&&'流光进度 Mask',!d.layers?.some(l=>l.titleArt)&&'图片字标',!d.masks?.foil&&'盔甲反光 Mask'].filter(Boolean);}
function dynamic(d,front=true){
 if(!d)return false;const c=d.cosmeticPreview||{},m=C.material(d.material),p=C.particles(d.particles),f=F.resolve(d),ls=(d.layers||[]).filter(l=>l.visible!==false);
 if(p.enabled&&C.resolveEmitter(p,d).ok)return true;
 if(front||d.assetKind==='back'){
  if(ls.some(l=>l.kind==='frame')&&(f.animation!=='none'||['cosmic','fire','fire-iridescent','ice','glyphs','refraction','neonnights','orbit-silver','twin-aurora','pax','brains','halloween-stickers'].includes(f.finish))&&f.animationSpeed>0)return true;
  if(m.enabled&&(m.target!=='back'||d.assetKind==='back')&&m.style!=='ink'&&m.speed>0)return true;
  if(c.motion!==false&&(d.effects?.cape&&d.deformation?.wind>0||d.effects?.flow&&ls.some(l=>l.kind==='foreground')||d.armor?.enabled&&d.armor.strength>0||d.shader?.fragmentStrength>0&&d.shader.fragmentBody!=='return color;'||(d.slots||[]).some(s=>s.effect!=='none'&&s.strength>0&&s.speed>0)))return true;
  if(c.title!==false&&ls.some(l=>l.titleArt&&l.titleArt.sweep?.enabled!==false&&(l.titleArt.sweep?.strength??1)>0))return true;
  if(Object.entries(d.componentScenes||{}).some(([kind,s])=>kind!=='particles'&&(kind!=='material'||m.enabled)&&(kind!=='effect'||c.motion!==false)&&s.document&&dynamic(s.document,true)))return true;
 }else{if(d.backScene?.document)return dynamic(d.backScene.document,true);const b=C.material(d.backScene?.material||d.material);if(b.enabled&&b.style!=='ink'&&b.speed>0)return true;}
 return false;
}
return {dynamic,levels,finishes,presets,borders,defaults,qualities,config,budget,validate,particlePreset,border,resolve,requirements};
});
