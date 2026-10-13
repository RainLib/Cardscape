/* One reusable quad buffer; Cosmic shares it across two passes, other particles use one. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardParticleBatch=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const stride=10,corners=[-1,-1,1,-1,-1,1,-1,1,1,-1,1,1],visuals=['dust','glimmer','krackle','streak','ember','snow','confetti','diamond','bubble','sprite','orb','mixed','tech','banana','pixel','heart','leaf','tone','shard','cosmic','wakanda','flower','paw','pizza','starcore','adamantium'];
function pack(samples,count,target,visualOverrides=null){if(target.length<count*6*stride)throw Error('粒子批次缓冲区不足');let k=0;for(let i=0;i<count;i++){const s=i*7;for(let j=0;j<6;j++){target[k++]=samples[s];target[k++]=samples[s+1];target[k++]=samples[s+2];target[k++]=samples[s+3];target[k++]=samples[s+4];target[k++]=samples[s+5];target[k++]=samples[s+6];target[k++]=visualOverrides?.[i]??-1;target[k++]=corners[j*2];target[k++]=corners[j*2+1];}}return k;}
const vertex=`attribute vec4 point;attribute vec4 style;attribute vec2 corner;uniform vec2 angle;uniform vec4 rootTransform;uniform float aspect,cameraDistance,stretch,particleTime,revealStretch,layerOffset;uniform mediump float visual;varying vec2 uv;varying float opacity,hue;varying mediump float particleKind;
void main(){vec3 q=point.xyz+vec3(0.,0.,layerOffset);float c=cos(angle.x),s=sin(angle.x);q=vec3(c*q.x+s*q.z,q.y,-s*q.x+c*q.z);c=cos(angle.y);s=sin(angle.y);q=vec3(q.x,c*q.y-s*q.z,s*q.y+c*q.z);q=q*rootTransform.w+rootTransform.xyz;float a=style.y;float kind=style.w>=0.?style.w:visual;float flutter=kind>15.5&&kind<16.5?.18+.82*abs(cos(particleTime*1.1+style.z*6.283)):1.;float cometStretch=kind>18.5&&kind<19.5&&style.z>.78?8.:1.;vec2 v=corner*vec2((style.w>=0.?revealStretch:stretch)*flutter*cometStretch,kind>19.5&&kind<20.5&&style.z>=.58&&style.z<.82?8.:1.)*point.w*rootTransform.w;q.xy+=mat2(cos(a),sin(a),-sin(a),cos(a))*v;float fit=min(1.,aspect/.85);gl_Position=vec4(q.x*2.9*fit/aspect,q.y*2.9*fit,-q.z*.3,max(.15,cameraDistance-q.z));uv=corner;opacity=style.x;hue=style.z;particleKind=kind;}`;
const fragment=`precision mediump float;uniform sampler2D spriteTex;uniform vec3 color;uniform float rootOpacity,visual,rainbow,spriteTint,cosmicPass;uniform highp float particleTime;uniform float particleSpeed;varying vec2 uv;varying float opacity,hue;varying mediump float particleKind;
// Shared faceted gold crystal: eight projected faces, not a shaded flat rhombus.
vec3 diamondTurn(vec3 p,vec2 yaw,vec2 pitch){
 p=vec3(p.x,p.y*pitch.x-p.z*pitch.y,p.y*pitch.y+p.z*pitch.x);
 return vec3(p.x*yaw.x+p.z*yaw.y,p.y,-p.x*yaw.y+p.z*yaw.x);
}
vec4 diamondFace(vec2 p,vec3 a,vec3 b,vec3 c,vec3 tint){
 vec2 u=b.xy-a.xy,v=c.xy-a.xy,q=p-a.xy;
 float det=u.x*v.y-u.y*v.x;
 if(abs(det)<.00001)return vec4(0.,0.,0.,-2.);
 float x=(q.x*v.y-q.y*v.x)/det,y=(u.x*q.y-u.y*q.x)/det;
 float edge=min(x,min(y,1.-x-y));
 if(edge<-.012)return vec4(0.,0.,0.,-2.);
 vec3 n=normalize(cross(b-a,c-a)),light=normalize(vec3(-.45,.65,1.));
 float diffuse=max(0.,dot(n,light)),specular=pow(max(0.,dot(reflect(-light,n),vec3(0.,0.,1.))),12.);
 vec3 rgb=tint*(.30+1.32*diffuse)+vec3(1.,.94,.70)*specular*1.05;
 return vec4(rgb,a.z+x*(b.z-a.z)+y*(c.z-a.z));
}
vec4 diamondSurface(vec2 p,float clock,float seed,vec3 tint){
 float yawAngle=clock*.785398*(1.+floor(seed*3.))+seed*6.283185;
 float pitchAngle=.45+.18*sin(clock*.785398+seed*6.283185);
 vec2 yaw=vec2(cos(yawAngle),sin(yawAngle)),pitch=vec2(cos(pitchAngle),sin(pitchAngle));
 vec3 top=diamondTurn(vec3(0.,.82,0.),yaw,pitch),bottom=diamondTurn(vec3(0.,-.82,0.),yaw,pitch);
 vec4 result=vec4(0.,0.,0.,-2.);
 for(int i=0;i<4;i++){
  float a=float(i)*1.570796,b=a+1.570796;
  vec3 first=diamondTurn(vec3(.62*cos(a),0.,.62*sin(a)),yaw,pitch);
  vec3 second=diamondTurn(vec3(.62*cos(b),0.,.62*sin(b)),yaw,pitch);
  vec4 upper=diamondFace(p,top,second,first,tint),lower=diamondFace(p,bottom,first,second,tint);
  if(upper.a>result.a)result=upper;
  if(lower.a>result.a)result=lower;
 }
 return vec4(result.rgb,step(-1.5,result.a));
}
// Shared neon trail: a thin white core, colored halo and tapered ends.
vec4 trailSurface(vec2 p,vec3 tint){
 float ends=1.-smoothstep(.85,1.,abs(p.x));
 float core=1.-smoothstep(.16,.22,abs(p.y)),halo=exp(-p.y*p.y*10.)*.42;
 return vec4(mix(tint,vec3(1.),core*.85),min(1.,core+halo)*ends);
}
// Shared bubble surface: tinted film, thin reflection rim and lower-left glint.
vec4 bubbleSurface(vec2 p,vec3 tint){
 float d=length(p),disk=1.-smoothstep(.82,.855,d);
 float rim=exp(-pow((d-.80)*32.,2.)),fresnel=pow(clamp(d/.82,0.,1.),6.);
 vec2 q=(p-vec2(-.03,-.32))*vec2(5.,5.5);
 float glint=exp(-dot(q,q));
 vec3 film=tint*vec3(.56,.82,.86),edge=tint*vec3(.90,.96,1.);
 vec3 rgb=mix(film,edge,clamp(rim*.85+fresnel*.12,0.,1.))+tint*glint*.45;
 return vec4(rgb,min(1.,disk*(.52+.12*fresnel+.12*rim)+glint*.14));
}
// Shared illustrated banana: thick crescent, inner ridge, brown tips and fixed freckles.
float bananaHash(vec2 p){return fract(sin(dot(p,vec2(12.7,31.1)))*137.7);}
float bananaSegment(vec2 p,vec2 a,vec2 b){vec2 q=p-a,v=b-a;return length(q-v*clamp(dot(q,v)/dot(v,v),0.,1.));}
vec4 bananaSurface(vec2 p,vec3 tint){
 float cap=sqrt(max(0.,1.-p.x*p.x/.6889)),curve=.50*p.x*p.x-.19,width=.17*cap+.012;
 float body=max(abs(p.y-curve)-width,abs(p.x)-.83);
 float stem=bananaSegment(p,vec2(.79,.115),vec2(.87,.235))-.027;
 float shape=min(body,stem),alpha=1.-smoothstep(-.008,.015,shape);
 float rim=smoothstep(-.035,-.005,body),ridge=exp(-pow((p.y-curve-.058)*19.,2.));
 vec3 rgb=tint*(.84+.16*ridge);
 rgb=mix(rgb,vec3(1.,.89,.62),ridge*.24);
 rgb=mix(rgb,tint*vec3(.54,.48,.34),rim*.52);
 vec2 grid=p*vec2(26.,16.),cell=fract(grid)-.5;
 float fleck=step(.89,bananaHash(floor(grid)))*(1.-smoothstep(.11,.23,length(cell)));
 rgb=mix(rgb,vec3(.30,.16,.045),fleck*.65);
 float tips=smoothstep(.72,.81,abs(p.x));
 rgb=mix(rgb,vec3(.32,.19,.055),tips*.78);
 return vec4(rgb,alpha);
}
// Shared Cosmic surface; the card cloud and front comets share one buffer.
float cosmicHash(vec2 p){return fract(sin(dot(p,vec2(12.7,31.1)))*137.7);}
float cosmicNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(cosmicHash(i),cosmicHash(i+vec2(1.,0.)),f.x),mix(cosmicHash(i+vec2(0.,1.)),cosmicHash(i+vec2(1.,1.)),f.x),f.y);}
vec4 cosmicSurface(vec2 p,float clock,float seed,vec3 tint,float pass){
 bool comet=seed>.78;
 if((pass<-.5&&comet)||(pass>.5&&!comet))return vec4(0.);
 if(comet){float tail=smoothstep(-1.,-.8,p.x)*(1.-smoothstep(.5,.9,p.x));float line=exp(-p.y*p.y*49.)*tail*smoothstep(-1.,.42,p.x);float head=exp(-pow((p.x-.42)*7.,2.)-p.y*p.y*70.);vec3 spectral=.55+.45*cos(6.283*(seed+vec3(0.,.33,.67)));return vec4(mix(spectral,vec3(1.),head*.75),min(1.,line*.85+head*.4));}
 vec2 drift=vec2(clock*.045,-clock*.028)+seed*13.7;
 float field=.67*cosmicNoise(p*2.9+drift)+.33*cosmicNoise(p*7.6-drift*.7);
 float haze=exp(-dot(p,p)*3.3)*smoothstep(.14,.78,field)*.6;
 vec2 grid=p*8.,cell=fract(grid)-.5;float star=step(.91,cosmicHash(floor(grid)+seed*9.))*exp(-dot(cell,cell)*170.);
 vec3 clouds=mix(tint,vec3(.18,.34,.78),.5+.5*sin(seed*6.283));
 return vec4(clouds+vec3(.5,.65,.95)*star*.3,min(1.,haze+star*.08));
}
// Shared Wakandan-style silhouettes: outlined hexagons, narrow shafts and solid nodes.
vec4 wakandaSurface(vec2 p,float seed,vec3 tint){
 float hex=max(abs(p.y)*.866025+abs(p.x)*.5,abs(p.x));
 float body=0.,light=0.;
 if(seed<.58){float edge=abs(hex-.57);body=1.-smoothstep(.018,.040,edge);light=exp(-edge*edge*90.)*.26;}
 else if(seed<.82){float taper=smoothstep(-1.,-.75,p.y)*(1.-smoothstep(.2,1.,p.y));body=exp(-p.x*p.x*130.)*taper;light=exp(-p.x*p.x*20.)*taper*.18;}
 else{body=1.-smoothstep(.50,.62,hex);light=exp(-dot(p,p)*5.)*.2;}
 float haze=exp(-dot(p,p)*2.8)*.14;
 return vec4(mix(tint,vec3(1.,.58,1.),body*.16),min(1.,body*.95+light+haze));
}
// Shared illustrated particles: cutout petals, four toes and a colored pizza slice.
float iconEllipse(vec2 p,vec2 center,vec2 radius){return length((p-center)/radius)-1.;}
vec4 iconSurface(vec2 p,float kind,vec3 tint){
 float shape=1.;vec3 rgb=tint;
 if(kind<21.5){
  for(int i=0;i<5;i++){float angle=float(i)*1.256637+.314159;shape=min(shape,length(p-vec2(cos(angle),sin(angle))*.38)-.28);}
  float petals=1.-smoothstep(-.012,.018,shape);
  return vec4(rgb,petals*smoothstep(.13,.17,length(p)));
 }
 if(kind<22.5){
  shape=iconEllipse(p,vec2(-.45,.29),vec2(.14,.19));
  shape=min(shape,iconEllipse(p,vec2(-.17,.52),vec2(.145,.19)));
  shape=min(shape,iconEllipse(p,vec2(.17,.52),vec2(.145,.19)));
  shape=min(shape,iconEllipse(p,vec2(.45,.29),vec2(.14,.19)));
  float pad=min(iconEllipse(p,vec2(-.16,-.25),vec2(.24,.25)),iconEllipse(p,vec2(.16,-.25),vec2(.24,.25)));
  pad=min(pad,iconEllipse(p,vec2(0.,-.08),vec2(.29,.25)));
  return vec4(rgb,1.-smoothstep(-.025,.075,min(shape,pad)));
 }
 float radius=length(vec2(p.x,p.y+.72));
 shape=max((abs(p.x)*1.85-p.y-.72)/2.103,radius-1.32);
 float alpha=1.-smoothstep(-.012,.018,shape);
 float crust=smoothstep(1.16,1.20,radius);
 vec3 cheese=vec3(1.,.72,.18),bread=vec3(.68,.29,.065)+vec3(.20,.12,.03)*(.5+.5*sin(p.x*17.));
 rgb=mix(cheese,bread,crust);
 float topping=min(length(p-vec2(-.30,.30))-.115,length(p-vec2(.29,.29))-.115);
 topping=min(topping,length(p-vec2(0.,.06))-.12);
 topping=min(topping,length(p-vec2(-.10,.41))-.085);
 topping=min(topping,length(p-vec2(.07,-.29))-.085);
 rgb=mix(rgb,vec3(.72,.075,.06),1.-smoothstep(-.012,.018,topping));
 return vec4(rgb*tint,alpha);
}
// Shared Adamantium emblem: blue rim, yellow disk, black fins and white eyes.
vec4 adamantiumSurface(vec2 p,vec3 tint){
 vec2 q=vec2(abs(p.x),p.y);
 float disk=length(p-vec2(0.,-.015));
 float rim=1.-smoothstep(.65,.675,disk);
 float yellow=1.-smoothstep(.585,.605,disk);
 float outside=.045+.70*smoothstep(-.50,.20,q.y)+.125*smoothstep(.10,.85,q.y);
 float inside=.055+.07*smoothstep(-.46,.12,q.y)+.74*smoothstep(.05,.85,q.y);
 float fin=max(max(inside-q.x,q.x-outside),max(-.50-q.y,q.y-.86));
 float black=1.-smoothstep(-.008,.008,fin);
 vec2 eye=q-vec2(.365,.073);eye=mat2(vec2(.93,-.3676),vec2(.3676,.93))*eye;
 float lens=max(length(eye-vec2(0.,.22)),length(eye+vec2(0.,.22)))-.27;
 float white=(1.-smoothstep(-.004,.008,lens))*black;
 vec3 rgb=mix(vec3(.012,.015,.025),mix(vec3(.055,.25,.59),tint,yellow),rim);
 rgb=mix(rgb,vec3(.012,.015,.025),black);
 rgb=mix(rgb,vec3(.98,.99,1.),white);
 return vec4(rgb,max(rim,black));
}
// Original P01: soft-edged solid cores, dark satellites and tiny four-point stars.
vec4 starcoreSurface(vec2 p,float seed,vec3 tint){
 float d=length(p);
 if(seed<.65){
  float disk=1.-smoothstep(.74,.82,d),halo=exp(-d*d*4.)*.11;
  float light=seed<.30?.30:.85;
  vec3 core=mix(tint*light,vec3(.87,.96,1.),exp(-dot(p-vec2(-.18,.20),p-vec2(-.18,.20))*6.)*.16);
  return vec4(core,min(1.,disk+halo*(1.-disk)));
 }
 float core=exp(-d*d*25.);
 float ray=exp(-abs(p.x)*26.)*pow(max(0.,1.-abs(p.y)),2.)+exp(-abs(p.y)*26.)*pow(max(0.,1.-abs(p.x)),2.);
 return vec4(mix(tint,vec3(1.),.65),min(1.,core+ray*.72));
}
void main(){float d=length(uv),a=0.,shade=1.;vec3 rgb=color;float kind=particleKind<-.5?visual:particleKind;if(kind>10.5&&kind<11.5)kind=hue>.82?10.:1.;
if(kind<.5)a=exp(-d*d*5.5)*(1.-smoothstep(.85,1.,d));
else if(kind<1.5){float core=pow(max(0.,1.-d),4.);float rays=exp(-abs(uv.x)*25.)*pow(max(0.,1.-abs(uv.y)),2.)+exp(-abs(uv.y)*25.)*pow(max(0.,1.-abs(uv.x)),2.);a=min(1.,core+rays*.6+exp(-d*d*6.)*.12);rgb=mix(color,vec3(1.),core*.65*smoothstep(.15,.3,max(color.r,max(color.g,color.b))));}
else if(kind<2.5){float body=1.-smoothstep(.76,.81,d);float glow=exp(-pow(max(0.,d-.78),2.)*80.)*.16*step(.55,hue);a=body+(1.-body)*glow*(1.-smoothstep(.92,1.,d));shade=.16+.84*smoothstep(.18,.83,hue);}
else if(kind<3.5){vec4 effect=trailSurface(uv,mix(color,.55+.45*cos(6.283*(hue+vec3(0.,.33,.67))),rainbow));a=effect.a;rgb=effect.rgb;}
else if(kind<4.5)a=pow(max(0.,1.-abs(uv.y)),2.)*pow(max(0.,1.-abs(uv.x)),2.);
else if(kind<5.5){float theta=atan(uv.y,uv.x);a=exp(-pow(sin(theta*3.)*d*20.,2.))*smoothstep(1.,.6,d);a+=exp(-pow((d-.45)*24.,2.))*pow(abs(cos(theta*3.)),12.);}
else if(kind<6.5)a=(1.-smoothstep(.55,.7,abs(uv.x)))*(1.-smoothstep(.25,.4,abs(uv.y)));
else if(kind<7.5){vec4 effect=diamondSurface(uv,mod(particleTime*min(1.,particleSpeed*20.),8.),hue,mix(color,.55+.45*cos(6.283*(hue+vec3(0.,.33,.67))),rainbow));a=effect.a;rgb=effect.rgb;}
else if(kind<8.5){vec4 effect=bubbleSurface(uv,color);a=effect.a;rgb=effect.rgb;}
else if(kind<9.5){vec4 sprite=texture2D(spriteTex,vec2(uv.x*.5+.5,.5-uv.y*.5));a=sprite.a;rgb=sprite.rgb*mix(vec3(1.),color,spriteTint);}
else if(kind<11.5){a=1.-smoothstep(.76,.96,d);}
else if(kind<12.5){float hex=max(abs(uv.x)*.866025+abs(uv.y)*.5,abs(uv.y));float shell=1.-smoothstep(.028,.065,abs(hex-.65));float circuits=(1.-smoothstep(.025,.055,abs(uv.x)))*(1.-smoothstep(.45,.55,abs(uv.y)));a=max(shell,circuits);float node=1.-smoothstep(.06,.11,length(uv-vec2(0.,.35)));a=max(a,node);rgb=mix(color,vec3(1.),node*.4);}
else if(kind<13.5){vec4 effect=bananaSurface(uv,color);a=effect.a;rgb=effect.rgb;}
else if(kind<14.5){a=1.-smoothstep(.50,.55,max(abs(uv.x),abs(uv.y)));}
else if(kind<15.5){float lobes=min(length(uv-vec2(-.28,.25)),length(uv-vec2(.28,.25)))-.33;float tip=max(uv.y-.26,(abs(uv.x)*1.6-uv.y-.66)/1.887);float heart=min(lobes,tip);a=1.-smoothstep(-.02,.025,heart);shade=.18+.82*(1.-smoothstep(-.06,-.025,heart));}
else if(kind<16.5){float leaf=max(length(uv-vec2(-.42,0.)),length(uv-vec2(.42,0.)))-.78;a=1.-smoothstep(-.012,.02,leaf);float stem=(1.-smoothstep(.02,.045,abs(uv.x)))*(1.-smoothstep(.72,.82,-uv.y))*step(uv.y,-.45);a=max(a,stem);float vein=(1.-smoothstep(.02,.05,abs(uv.x)))*(1.-smoothstep(.5,.65,abs(uv.y)));shade=.65+.35*vein;}
else if(kind<17.5){vec2 grid=uv*vec2(9.,5.);vec2 cell=fract(grid)-.5;float taper=(1.-smoothstep(.25,1.,abs(uv.x)))*(1.-smoothstep(.45,1.,abs(uv.y)));float dots=1.-smoothstep(.16*taper,.16*taper+.025,length(cell));a=dots*taper;}
else if(kind<18.5){float chip=max(abs(uv.x)*.58+abs(uv.y)*1.65-.52,abs(uv.x)-.78);float dot=1.-step(.24,hue);float body=(1.-smoothstep(-.07,.08,chip))*(1.-dot);float glow=exp(-d*d*mix(6.5,4.8,dot));a=min(1.,body*.8+glow*.65);rgb=mix(color,vec3(1.),glow*.65*smoothstep(.15,.3,max(color.r,max(color.g,color.b))));}
else if(kind<19.5){vec4 effect=cosmicSurface(uv,particleTime,hue,color,cosmicPass);a=effect.a;rgb=effect.rgb;}
else if(kind<20.5){vec4 effect=wakandaSurface(uv,hue,color);a=effect.a;rgb=effect.rgb;}
else if(kind<23.5){vec4 effect=iconSurface(uv,kind,color);a=effect.a;rgb=effect.rgb;}
else if(kind<24.5){vec4 effect=starcoreSurface(uv,hue,color);a=effect.a;rgb=effect.rgb;}
else{vec4 effect=adamantiumSurface(uv,color);a=effect.a;rgb=effect.rgb;}
if(cosmicPass>.5&&kind<18.5&&kind>3.5)discard;if(cosmicPass<-.5&&kind>2.5&&kind<3.5)discard;
vec3 spectral=.55+.45*cos(6.283*(hue+vec3(0.,.33,.67)));if(kind>20.5&&kind<22.5)spectral=.5+.5*cos(6.283*(hue+particleTime*.12+vec3(0.,.33,.67)));rgb=mix(rgb,spectral,(kind>2.5&&kind<3.5||kind>6.5&&kind<7.5)?0.:rainbow)*shade;if(a<.01)discard;gl_FragColor=vec4(rgb,a*opacity*rootOpacity);}`;
return {stride,corners,visuals,pack,vertex,fragment};
});
