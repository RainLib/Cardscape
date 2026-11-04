shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;
uniform sampler2D attachment_tex : filter_linear, repeat_disable;
uniform bool attached = false;
uniform bool rigid_part = false;
uniform mat4 attachment_transform;
uniform sampler2D art : source_color, filter_linear, repeat_disable;
uniform sampler2D motion_tex : filter_linear, repeat_disable;
uniform sampler2D inset_tex : filter_linear, repeat_disable;
uniform sampler2D emission_tex : filter_linear, repeat_disable;
uniform sampler2D phase_tex : filter_linear, repeat_disable;
uniform sampler2D foil_tex : filter_linear, repeat_disable;
uniform sampler2D custom_mask_tex : filter_linear, repeat_disable;
uniform vec2 background_extent = vec2(1.18);
uniform vec4 _cardscape_source_alpha_bounds = vec4(0.0,0.0,1.0,1.0);
uniform vec4 source_rect = vec4(0.0,0.0,1.0,1.0);
uniform vec4 adjustment = vec4(0.0,1.0,1.0,1.0);
uniform vec4 contour_edges[64];
uniform vec2 contour_counts = vec2(0.0);
uniform sampler2D contour_field : filter_nearest, repeat_disable;
uniform float contour_texture = 0.0;
uniform vec4 contour_field_info=vec4(2016.,1856.,1.,160.);
uniform bool contour_wall = false;
uniform mat4 layer_transform;
uniform vec3 card_eye = vec3(0.0,0.0,2.7);
uniform vec3 surfaceEye = vec3(0.0,0.0,2.7);
uniform float surfaceChannel = 0.0;
uniform bool surfaceTransparent = false;
uniform vec4 metrics = vec4(.0234375,.046875,.025390625,.0048828125);
uniform vec4 pop_sides = vec4(1.0,1.0,0.0,1.0);
uniform vec3 frame_color : source_color = vec3(.53,.45,.31);
uniform vec3 frame_accent : source_color = vec3(.83,.73,.53);
uniform float frame_finish = 1.0;
uniform vec2 frame_animation = vec2(0.0,.6);
uniform float clock = 0.0;
uniform float opacity = 1.0;
uniform float root_opacity = 1.0;
uniform float motion_gain = 1.0;
uniform float flow_gain = 1.0;
uniform float flow_speed = 1.0;
uniform float wind_speed = 1.0;
uniform float geometry_bend = 0.0;
uniform vec3 slot_effect = vec3(0.0,0.0,1.0);
uniform float depth = 1.0;
uniform float foreground_pass = 0.0;
uniform float frame_part = 0.0;
uniform bool background = false;
uniform bool back_side = false;
uniform bool clipped = false;
uniform bool front_visible = true;
uniform int face_mode = 0;
uniform bool custom_effect = false;
uniform bool custom_masked = true;
uniform float custom_strength = 1.0;
uniform vec4 armor_sweep = vec4(0.0,2.0,6.0,.09);
uniform vec3 armor_color : source_color = vec3(.73,.87,1.0);
uniform vec4 title_sweep = vec4(0.0,2.0,6.0,.09);
uniform vec3 title_color : source_color = vec3(1.0,.9,.7);
uniform vec2 title_bounds = vec2(0.0,1.0);
uniform vec4 component_material = vec4(0.0,.25,4.0,0.0);
uniform vec3 material_color : source_color = vec3(.47,.81,1.0);
uniform vec3 material_accent : source_color = vec3(.98,.55,.87);
uniform bool holographic = false;
uniform int material_style = 0;
uniform float material_replace = 0.0;
varying vec3 card_point;
varying vec2 registered_uv;
// Portable fragment hook: sample raw source RGBA using the hook's UV space.
vec4 sampleSource(vec2 uv){
	vec2 registered=background?(uv-.5)*background_extent+.5:uv;
	vec2 coord=source_rect.xy+registered*source_rect.zw;
	if(back_side){coord.x=1.0-coord.x;}
	return texture(art,coord);
}
// __FRAGMENT_PRELUDE__
vec3 deformCard(vec3 q, vec2 uv, float time, float bend) {
// __GEOMETRY__
return q;
}
vec4 surfaceEffect(vec4 color, vec2 uv, float time, vec4 mask) {
// __SURFACE__
return color;
}
void vertex(){
	registered_uv=UV;
	if(background){VERTEX.xy*=background_extent;registered_uv=(UV-.5)*background_extent+.5;}
	if(foreground_pass>0.0&&!rigid_part){float weight=UV2.x;float wave=sin(clock*1.3*wind_speed+UV.x*11.0+UV.y*8.0);VERTEX.z+=wave*.016*weight*motion_gain*depth;VERTEX.x+=wave*.005*weight*motion_gain*depth;VERTEX=mix(VERTEX,deformCard(VERTEX,UV,clock,geometry_bend),weight*(1.0-UV2.y));}
	card_point=(layer_transform*vec4(VERTEX,1.0)).xyz;
	if(attached&&!rigid_part){float weight=texture(attachment_tex,UV).r;card_point=mix((attachment_transform*vec4(VERTEX,1.0)).xyz,card_point,weight);VERTEX=(inverse(layer_transform)*vec4(card_point,1.0)).xyz;}
}
vec2 contour_pixel(vec2 p){return (vec2(p.x+.5,.75-p.y)*1024.+contour_field_info.w)/contour_field_info.z;}
vec2 contour_decode(vec2 pixel){vec2 size=contour_field_info.xy,domain=vec2(size.x*(contour_field_info.w>.5?1./1.5:1.),size.y);vec3 c=floor(texture(contour_field,clamp(pixel,vec2(.5),domain-.5)/size).rgb*255.+.5);return vec2(c.r*16.+floor(c.g/16.),mod(c.g,16.)*256.+c.b)*((contour_field_info.w>.5?384.:128.)/4095.)-(contour_field_info.w>.5?192.:64.);}
vec2 contour_read(vec2 p,out vec2 gradient){vec2 pixel=contour_pixel(p),domain=vec2(contour_field_info.x*(contour_field_info.w>.5?1./1.5:1.),contour_field_info.y);gradient=vec2(0.);
 if(any(lessThan(pixel,vec2(0.)))||any(greaterThan(pixel,domain)))return vec2(-192.);
 vec2 q=pixel-.5,base=floor(q),f=fract(q),a=contour_decode(base+.5),b=contour_decode(base+vec2(1.5,.5)),c=contour_decode(base+vec2(.5,1.5)),d=contour_decode(base+1.5);
 vec2 distance=mix(mix(a,b,f.x),mix(c,d,f.x),f.y),dx=mix(b-a,d-c,f.y)/contour_field_info.z,dy=mix(c-a,d-b,f.x)/contour_field_info.z;
 gradient=distance.x< -distance.y?vec2(dx.x,dy.x):-vec2(dx.y,dy.y);return distance;}
vec2 contour_distance(vec2 p){vec2 gradient;return contour_read(p,gradient);}
vec2 contour_arc_decode(vec2 pixel){vec2 size=contour_field_info.xy,domain=vec2(size.x/3.,size.y);vec3 c=floor(texture(contour_field,(vec2(size.x/1.5,0.)+clamp(pixel,vec2(.5),domain-.5))/size).rgb*255.+.5);return vec2((c.r*256.+c.g)/65536.,c.b);}
float contour_arc(vec2 p,out float window){vec2 q=contour_pixel(p)*vec2(.5,1.)-.5,base=floor(q),f=fract(q),
 a=contour_arc_decode(base+.5),b=contour_arc_decode(base+vec2(1.5,.5)),c=contour_arc_decode(base+vec2(.5,1.5)),d=contour_arc_decode(base+1.5),anchor=mix(mix(a,b,step(.5,f.x)),mix(c,d,step(.5,f.x)),step(.5,f.y));
 if(abs(a.y-anchor.y)>.5)a=anchor;if(abs(b.y-anchor.y)>.5)b=anchor;if(abs(c.y-anchor.y)>.5)c=anchor;if(abs(d.y-anchor.y)>.5)d=anchor;
 vec4 phase=vec4(a.x,b.x,c.x,d.x);phase+=floor(vec4(anchor.x)-phase+.5);window=mod(anchor.y,2.);return fract(mix(mix(phase.x,phase.y,f.x),mix(phase.z,phase.w,f.x),f.y));}
vec2 contour_at(vec2 p){bool outer=false;bool inner=false;
 if(contour_texture>.5)return step(vec2(0.0),contour_distance(p));
 for(int i=0;i<64;i++){if(float(i)>=contour_counts.y)break;
  vec4 edge=contour_edges[i];vec2 a=edge.xy,b=edge.zw;
  if((a.y>p.y)!=(b.y>p.y)){float x=a.x+(b.x-a.x)*(p.y-a.y)/(b.y-a.y);if(p.x<x){if(float(i)<contour_counts.x)outer=!outer;else inner=!inner;}}
 }return vec2(outer?1.0:0.0,inner?1.0:0.0);
}
bool in_outline(vec2 p,float inset){if(contour_counts.y>.5){vec2 c=contour_at(p);return inset>0.0?c.y>.5:c.x>.5;}vec2 a=abs(p);float cut=max(0.0,metrics.y-(2.0-sqrt(2.0))*inset);return all(lessThanEqual(a,vec2(.5,.75)-inset))&&a.x+a.y<=1.25-2.0*inset-cut+.000001;}
vec2 at_plane(vec3 p,float z){float d=p.z-card_eye.z;return card_eye.xy+(p.xy-card_eye.xy)*(z-card_eye.z)/(abs(d)<.00001?-.00001:d);}
float sweep(float x,vec4 s){float cycle=mod(clock,max(s.z,.3));float head=-.25+1.6*clamp(cycle/max(s.y,.3),0.0,1.0);return exp2(-3.0*pow((x-head)/max(s.w,.02),2.0))*step(cycle,s.y)*s.x;}

vec2 contourRead(vec2 p,out vec2 gradient){return contour_read(p,gradient);}
vec2 contourDistance(vec2 p){return contour_distance(p);}
float contourArc(vec2 p,out float window){return contour_arc(p,window);}
bool contourHasMaterial(){return contour_field_info.w>.5;}
// Shared procedural finish and rim functions; mirrored in the Godot shader.
float finishHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float finishNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(finishHash(i),finishHash(i+vec2(1.,0.)),f.x),mix(finishHash(i+vec2(0.,1.)),finishHash(i+vec2(1.,1.)),f.x),f.y);}
float finishCloud(vec2 p){mat2 spin=mat2(vec2(.8,.6),vec2(-.6,.8));float n=.57*finishNoise(p);p=spin*p*2.03+7.1;n+=.28*finishNoise(p);p=spin*p*2.01+3.7;return n+.15*finishNoise(p);}
vec3 finishSpectrum(float p){return .53+.47*cos(6.283185*(p+vec3(0.,.33,.67)));}
// Static tensioned silk network. Time and view only move the reflection.
float finishStrand(vec2 location,vec2 strand_start,vec2 strand_end,float strand_width,float bend){
 vec2 span=strand_end-strand_start;
 float span2=dot(span,span);
 vec2 normal=vec2(-span.y,span.x)*inversesqrt(span2);
 float along=clamp(dot(location-strand_start,span)/span2,0.,1.);
 vec2 point=strand_start+span*along+normal*(bend*4.*along*(1.-along));
 vec2 tangent=span+normal*(bend*4.*(1.-2.*along));
 // One bounded closest-point refinement, never a fragment ray march.
 along=clamp(along+dot(location-point,tangent)/dot(tangent,tangent),0.,1.);
 point=strand_start+span*along+normal*(bend*4.*along*(1.-along));
 float taper=.62+5.4*pow(1.-along,12.)+1.2*pow(along,14.);
 return length(location-point)-strand_width*taper;
}
vec2 finishWeb(vec2 location,float cells){
 vec2 q=(location-vec2(.5,.75))*clamp(cells/4.,.65,3.)+vec2(.5,.75);
 float edge=100.;
 edge=min(edge,finishStrand(q,vec2(.032,.81),vec2(.205,-.04),.0045,-.065));
 edge=min(edge,finishStrand(q,vec2(.032,.81),vec2(-.09,.49),.0042,.030));
 edge=min(edge,finishStrand(q,vec2(.032,.81),vec2(.410,.585),.0041,-.024));
 edge=min(edge,finishStrand(q,vec2(.032,.81),vec2(.550,.300),.0044,.035));
 edge=min(edge,finishStrand(q,vec2(.032,.81),vec2(.150,1.105),.0040,0.));
 edge=min(edge,finishStrand(q,vec2(.032,.81),vec2(-.025,1.070),.0038,-.028));
 edge=min(edge,finishStrand(q,vec2(.550,.300),vec2(.205,-.040),.0040,-.112));
 edge=min(edge,finishStrand(q,vec2(.550,.300),vec2(.575,-.08),.0037,.034));
 edge=min(edge,finishStrand(q,vec2(.550,.300),vec2(1.025,.250),.0034,.046));
 edge=min(edge,finishStrand(q,vec2(.550,.300),vec2(.915,.595),.0036,.030));
 edge=min(edge,finishStrand(q,vec2(.915,.595),vec2(1.030,.460),.0037,.008));
 edge=min(edge,finishStrand(q,vec2(.915,.595),vec2(.967,1.004),.0038,.012));
 edge=min(edge,finishStrand(q,vec2(.915,.595),vec2(.610,.680),.0038,-.025));
 edge=min(edge,finishStrand(q,vec2(.800,1.010),vec2(.915,.595),.0038,-.025));
 edge=min(edge,finishStrand(q,vec2(.800,1.010),vec2(1.070,1.430),.0042,.030));
 edge=min(edge,finishStrand(q,vec2(.800,1.010),vec2(.770,1.610),.0036,.055));
 edge=min(edge,finishStrand(q,vec2(.800,1.010),vec2(.150,1.105),.0032,-.050));
 edge=min(edge,finishStrand(q,vec2(.800,1.010),vec2(.330,1.290),.0035,.022));
 edge=min(edge,finishStrand(q,vec2(.150,1.105),vec2(-.035,1.067),.0034,-.010));
 edge=min(edge,finishStrand(q,vec2(.150,1.105),vec2(-.010,1.610),.0037,-.032));
 edge=min(edge,finishStrand(q,vec2(.150,1.105),vec2(.350,1.390),.0032,-.020));
 float thread=1.-smoothstep(0.,.0022,edge);
 float relief=(1.-smoothstep(.0022,.008,edge))-thread;
 return vec2(thread,relief);
}
float finishSegment(vec2 q,vec2 a,vec2 b){vec2 d=b-a;return length(q-a-d*clamp(dot(q-a,d)/dot(d,d),0.,1.));}
// Keep the glass pattern independent from reference circuit-board routing.
vec2 finishCircuit(vec2 location,float density){
 vec2 grid=location*max(4.,density*1.5),cell=floor(grid*.5),q=mod(grid,2.);
 float seed=finishHash(cell);
 if(seed>.5)q.x=2.-q.x;if(fract(seed*7.)>.5)q.y=2.-q.y;
 float trace=finishSegment(q,vec2(0.,.26),vec2(.74,.26));
 trace=min(trace,finishSegment(q,vec2(.74,.26),vec2(1.18,.70)));
 trace=min(trace,finishSegment(q,vec2(1.18,.70),vec2(1.18,1.44)));
 trace=min(trace,finishSegment(q,vec2(0.,.55),vec2(.55,.55)));
 trace=min(trace,finishSegment(q,vec2(.55,.55),vec2(.90,.90)));
 trace=min(trace,finishSegment(q,vec2(.90,.90),vec2(.90,1.72)));
 trace=min(trace,finishSegment(q,vec2(0.,.85),vec2(.34,.85)));
 trace=min(trace,finishSegment(q,vec2(.34,.85),vec2(.62,1.13)));
 trace=min(trace,finishSegment(q,vec2(.62,1.13),vec2(.62,2.)));
 trace=min(trace,finishSegment(q,vec2(2.,1.20),vec2(1.60,1.20)));
 trace=min(trace,finishSegment(q,vec2(1.60,1.20),vec2(1.60,.34)));
 trace=min(trace,finishSegment(q,vec2(1.60,.34),vec2(1.38,.12)));
 float node=min(abs(length(q-vec2(1.18,1.44))-.055),min(abs(length(q-vec2(.90,1.72))-.055),abs(length(q-vec2(1.38,.12))-.055)));
 float wire=1.-smoothstep(.012,.026,min(trace,node));
 return vec2(wire,1.-smoothstep(.025,.065,trace));
}
// Fixed long buses. Time and view change the metal reflection, never routing.
float finishCircuitBus(vec2 q,vec2 a,vec2 b,vec2 c,vec2 d){
 // Flat endpoints avoid concentric loops around the end of a distance field.
 if(dot(q-a,b-a)<0.||dot(d-q,d-c)<0.)return 10.;
 return min(finishSegment(q,a,b),min(finishSegment(q,b,c),finishSegment(q,c,d)));
}
vec2 finishCircuitBuses(vec2 location,float density){
 vec2 q=(location-vec2(.5,.75))*clamp(density/4.,.65,3.)+vec2(.5,.75);
 float route=finishCircuitBus(q,vec2(.19,-.10),vec2(.325,.065),vec2(.325,.27),vec2(.37,.33));
 route=min(route,finishCircuitBus(q,vec2(1.07,.13),vec2(.85,.37),vec2(.85,.46),vec2(.63,.69)));
 route=min(route,finishCircuitBus(q,vec2(-.10,.83),vec2(.18,.83),vec2(.32,.69),vec2(.50,.69)));
 route=min(route,finishCircuitBus(q,vec2(.68,.90),vec2(.87,1.09),vec2(.87,1.31),vec2(1.06,1.50)));
 route=min(route,finishCircuitBus(q,vec2(-.10,1.48),vec2(.23,1.12),vec2(.29,1.12),vec2(.40,1.01)));
 float lane=floor(route/.020+.5);
 float trace=abs(route-lane*.020)+(1.-step(route,.081));
 float pad=abs(length(q-vec2(.982,.262))-.018);
 pad=min(pad,abs(length(q-vec2(.914,.302))-.014));
 pad=min(pad,abs(length(q-vec2(.421,.187))-.012));
 pad=min(pad,abs(length(q-vec2(.033,.882))-.013));
 pad=min(pad,abs(length(q-vec2(.366,1.226))-.016));
 trace=min(trace,pad);
 float wire=1.-smoothstep(.0010,.0025,trace);
 return vec2(wire,1.-smoothstep(.0025,.0065,trace));
}
vec2 finishRay(vec2 location,float density){
 vec2 q=location-vec2(.35,.90);float r=length(q);
 float theta=atan(q.y,q.x)-r*1.10;
 float count=max(12.,floor(density*8.+.5));
 return vec2(smoothstep(-.06,.08,cos(theta*count)),theta);
}
// Calibrated purple rays; legacy palettes keep their own formula.
vec2 finishRayMotion(vec2 location,float density,float ray_time){
 vec2 q=location-vec2(0.54045,0.77825);float r=length(q);
 float theta=atan(q.y,q.x)-r*0.71275+ray_time*0.23690;
 float count=max(12.,floor(density*7.75000+.5));
 return vec2(smoothstep(-.06,.08,cos(theta*count+-0.95193)),theta);
}
// Rainbow ribbons rotate with bounded easing; film reflection is independent.
vec2 finishRainbowRay(vec2 location,float density,float ray_time){
 vec2 q=(location-vec2(0.51242,0.73103))*vec2(1.,0.98483);float r=length(q);
 float theta=atan(q.y,q.x)-pow(r,0.66483)*0.95564+ray_time*0.19950+0.05000*sin(ray_time*2.70294+-1.56245);
 float count=max(12.,floor(density*7.50000+.5));
 return vec2(smoothstep(-.06,.08,cos(theta*count+2.41813)),theta);
}
float finishFrost(vec2 location){return finishCloud(location*4.7);}
// Original B05: moving refracted cells. Points return after exactly ten seconds.
vec2 finishCausticScale(vec2 p,float finish_clock,float scale){
 float phase=finish_clock*.62831853;
 vec2 q=p*scale;
 q+=vec2(sin(q.y*1.25+phase),cos(q.x*1.20-phase))*.44;
 q+=vec2(cos(q.y*2.13-phase*2.),sin(q.x*1.79+phase*2.))*.13;
 vec2 cell=floor(q),local=fract(q);float first=9.,second=9.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 neighbor=vec2(float(x),float(y)),id=cell+neighbor;
  vec2 seed=vec2(finishHash(id+4.1),finishHash(id-7.3));
  vec2 site=neighbor+.5+sin(seed*6.283185+vec2(phase,-phase))*.27;
  float distance=dot(site-local,site-local);
  if(distance<first){second=first;first=distance;}else second=min(second,distance);
 }
 float ridge=second-first;
 float focus=exp(-ridge*ridge*800.);
 float halo=exp(-ridge*ridge*70.)*.24;
 return vec2(focus+halo,sqrt(first));
}
vec2 finishCaustics(vec2 p,float finish_clock,float density){
 float scale=max(3.,density*1.7);
 vec2 coarse=finishCausticScale(p,finish_clock,scale);
 vec2 fine=finishCausticScale(p+vec2(.73,-.41),-finish_clock,scale*1.83);
 // Fine refracted light stays quiet; broad focus patches remain the main shape.
 return vec2(coarse.x*.72+fine.x*.20,coarse.y);
}
vec3 finishColor(vec3 base,vec2 uv,float finish_time,vec2 view,float style,float density,vec3 low,vec3 hi,bool replaceArt){
 vec2 p=uv*vec2(1.,1.5),eye=view*vec2(.38,-.26);
 float axis=dot(p,vec2(.78,.36))-eye.x-eye.y+finish_time*.18;
 float reflect=.5+.5*cos(axis*6.283185);
 float sheen=pow(reflect,8.),glint=pow(reflect,64.);
 vec3 field=mix(low,hi,.2+.5*sheen)+hi*glint*.16;
 vec3 result=1.-(1.-base)*(1.-field*.35);
 if(style<2.5){
  float warp=finishCloud(p*2.8+vec2(finish_time*.035,0.));
  vec3 film=finishSpectrum(axis*.38+warp*.2);
  field=film*(.65+.35*sheen)+hi*glint*.16;
  if(style<.5)field=mix(low,hi,.5+.5*sin(axis*7.+warp*2.));
  result=base*(.88+.12*sheen)+field*(.12+.32*sheen+.12*glint);
 }
 else if(style<3.5||(style>7.5&&style<9.5)){
  vec2 grid=p*max(8.,density*(style<3.5?3.2:5.));grid.y*=1.15470054;grid.x-=grid.y*.5;
  vec2 cell=floor(grid),f=fract(grid);float tri=step(1.,f.x+f.y);
  float facet=finishHash(cell+vec2(tri*19.,tri*37.));
  float turn=axis*.32+facet*.23;
  float face=.38+.62*pow(.5+.5*cos(axis*5.+facet*5.),3.);
  float tint=.4+.35*pow(reflect,2.)*(.25+.75*facet);
  field=mix(vec3(.42,.46,.53),finishSpectrum(turn+facet*.5),tint)*(.65+.35*face)+vec3(.25)*sheen+hi*glint*.08;
  if(style>7.5)field=mix(low,hi,.15+.7*face)+hi*glint*.25;
  if(style>8.5)field=mix(low,field,.28+.4*sheen);
  result=base*(.82+.12*face)+field*(.16+.38*sheen);
  if(style<3.5){
   // Fixed triangle topology with independent facets and a traveling reflection.
   float silver=pow(.5+.5*cos((axis-.65+facet*.14)*6.283185),4.);
   float filmPhase=facet*.91+dot(p,vec2(.18,.09))-eye.x*.65-eye.y*.65+finish_time*.035;
   float vivid=smoothstep(.55,.86,finishHash(cell+tri*11.+4.3));
   vec3 pastel=mix(vec3(.70,.77,.80),finishSpectrum(filmPhase),.26+.55*vivid);
   float facetLight=.62+.38*pow(.5+.5*cos(axis*4.2+facet*4.9),2.);
   float seam=tri<.5?min(min(f.x,f.y),(1.-f.x-f.y)*.707107):min(min(1.-f.x,1.-f.y),(f.x+f.y-1.)*.707107);
   float etched=1.-smoothstep(.003,.018,seam);
   field=mix(pastel*facetLight,vec3(.90,.93,.94),silver*(.55+.25*facet))*(1.-etched*.13)+vec3(.05)*glint;
   result=mix(base,field,.68+.18*silver);
  }
 }
 else if(style<4.5||(style>5.5&&style<7.5)||(style>16.5&&style<18.5)){
  float grain=finishHash(floor(p*vec2(850.,1100.)))-.5;
  float brushed=sin(p.y*1600.+finishNoise(p*18.)*3.)*.013;
  field=mix(low,hi,.22+.57*sheen)+hi*glint*.23+vec3(grain*.025+brushed);
  if(style>16.5&&style<17.5)field=mix(field,finishSpectrum(axis*.3)*(.6+.35*sheen),.38);
  float lum=dot(base,vec3(.2126,.7152,.0722));
  result=mix(base,field*(.45+.7*lum),.6)+hi*glint*.1;
  if(style<4.5){
   float relief=pow(clamp(lum,0.,1.),.45);
   vec3 gold=mix(low*.4,hi,.12+.78*relief);
   vec3 silver=mix(vec3(.45,.47,.48),vec3(.96,.96,.89),relief);
   float ribbon=pow(reflect,3.);
   result=mix(gold,silver,ribbon*.34)+hi*(sheen*.12+glint*.08)+vec3(grain*.012);
  }
 }
 else if(style>9.5&&style<10.5){
  vec2 q=p*2.8+vec2(finish_time*.045,-finish_time*.025);
  vec2 warp=vec2(finishNoise(q+4.3),finishNoise(q-3.8));
  float cloud=finishCloud(q+warp*.9),detail=finishNoise(q*8.7+warp);
  vec2 cells=p*74.,id=floor(cells);
  vec2 jitter=vec2(finishHash(id+13.7),finishHash(id-9.2))*.6-.3;
  vec2 st=fract(cells)-.5-jitter;
  float star=step(.981,finishHash(id))*exp(-dot(st,st)*170.)*(.75+.25*sin(finish_time+finishHash(id)*20.));
  float dust=step(.94,finishHash(floor(p*151.)))*pow(max(0.,1.-length(fract(p*151.)-.5)*2.),8.)*.24;
  float haze=pow(smoothstep(.2,.8,cloud),2.)*(.55+.45*detail);
  field=low*.65+hi*haze*.9+vec3(.12,.38,.63)*pow(1.-abs(cloud-.48)*2.,8.)*(.1+.22*detail)+vec3(star+dust);
  result=base*.92+field*.42;
 }
 else if(style<11.5&&style>10.5){
  float frost=finishHash(floor(p*1300.))-.5;
  float mist=finishCloud(p*4.);
  field=mix(low,hi,.38+.27*mist+.2*sheen)+vec3(frost*.055)+hi*glint*.18;
  result=mix(base,field,.28)+hi*sheen*.18;
 }
 else if(style<12.5&&style>11.5){
  vec2 q=vec2(p.x*5.,p.y*3.-finish_time*.55);
  float n=finishCloud(q+vec2(finishNoise(q*1.7)*1.7,0.));
  float fire=pow(smoothstep(.26,.82,n),2.);
  field=mix(low,hi,fire)+vec3(1.,.2,.015)*fire*.22+hi*pow(fire,5.)*.4;
  result=base+field*.36;
 }
 else if(style<13.5&&style>12.5){
  vec2 q=p*max(3.,density*1.4)+vec2(finish_time*.15,-finish_time*.09);
  vec2 warp=vec2(finishNoise(q+2.4),finishNoise(q-3.1));
  float a=finishNoise(q+warp*1.8),b=finishNoise(q*1.6-warp+finish_time*.05);
  float caustic=pow(1.-smoothstep(.015,.11,abs(a-.5)),2.);
  caustic=max(caustic,pow(1.-smoothstep(.01,.065,abs(b-.52)),2.)*.6);
  field=mix(low,hi,.18+.52*caustic)+hi*sheen*.1;
  result=base*.96+hi*caustic*.26+low*.06;
 }
 else if((style<14.5&&style>13.5)||(style>26.5&&style<27.5)||(style>28.5&&style<29.5)){
  vec2 ray=style>28.5?finishRayMotion(p,density,finish_time):style>26.5?finishRainbowRay(p,density,finish_time):finishRay(p,density);
  float silver=pow(.5+.5*cos((axis-.45)*6.283185),5.);
  vec3 ribbon=hi*(.76+.24*sheen);
  if(style>26.5&&style<27.5){
   float film=(dot(p,vec2(-3.11647,0.48085))+finish_time*0.00627-dot(eye,vec2(.80,.60)))*6.283185;
   float satin=(dot(p,vec2(1.32468,1.50000))+finish_time*0.09805-dot(eye,vec2(.45,.75)))*6.283185;
   ribbon=clamp(vec3(0.59433,0.65177,0.76293)+vec3(0.00011,0.06051,0.07101)*cos(film)+vec3(-0.02660,-0.00285,-0.02479)*sin(film)+vec3(-0.01890,-0.04317,-0.03559)*cos(satin)+vec3(0.10657,-0.03799,0.01314)*sin(satin),0.,1.);
  }
  if(!(style>26.5&&style<27.5))ribbon=mix(ribbon,vec3(.9,.95,.98),silver*.68);
  vec3 dark=low*.32+vec3(.014,.022,.030)+vec3(.045,.065,.075)*(finishNoise(p*6.3)*.5+sheen*.5);
  field=mix(dark,ribbon,ray.x);result=mix(base,field,.92);
 }
 else if(style<15.5&&style>14.5){
  vec2 q=p*2.4+eye*.9;
  float n=finishCloud(q+vec2(finish_time*.025,-finish_time*.02));
  field=mix(vec3(.85),finishSpectrum(n*.9+axis*.12),.42)*(.8+.2*sheen)+hi*glint*.08;
  result=base*.91+field*(.18+.22*sheen);
 }
 else if(style>15.5&&style<16.5){
  vec2 q=p*max(2.,density*.7);
  q+=vec2(finishNoise(q+finish_time*.08),finishNoise(q-4.-finish_time*.06))*2.3;
  float n=finishCloud(q);vec3 swirl=finishSpectrum(n*2.4+axis*.08);
  float line=1.-smoothstep(.025,.09,abs(fract(n*7.)-.5));
  field=swirl*(.75+.25*line)+hi*glint*.12;result=base*.86+field*.38;
 }
 else if(style>18.5&&style<19.5){
  vec2 grid=p*max(3.,density*2.2);grid.x-=grid.y*.57735;vec2 f=fract(grid);
  float tri=step(1.,f.x+f.y),facet=finishHash(floor(grid)+vec2(tri*19.,tri*37.));
  float seam=min(min(min(f.x,1.-f.x),min(f.y,1.-f.y)),abs(f.x+f.y-1.)*.7071);
  vec3 crystal=mix(vec3(.66,.7,.85),finishSpectrum(axis*.26+facet*.2),.42);
  field=mix(crystal*(.65+.28*sheen),hi,.65*(1.-smoothstep(.012,.045,seam)))+hi*glint*.14;
  result=base*.87+field*(.14+.28*sheen);
 }
 else if(style>19.5&&style<20.5){
  vec2 grid=p*max(6.,density*3.),f=fract(grid)-.5,id=floor(grid);
  float line=1.-smoothstep(.02,.045,min(abs(f.x),abs(f.y)));
  line*=step(.35,finishHash(id));float node=exp(-dot(f,f)*170.);
  float signal=.3+.7*pow(.5+.5*sin((id.x+id.y)*.65-finish_time*1.7),4.);
  field=mix(low,hi,.27+.28*sheen)+hi*(line*.32+node*.26)*signal;
  result=mix(base,field,.3)+hi*(line*.12+glint*.12);
 }
 else if(style>20.5&&style<21.5){
  vec2 glass=finishCircuit(vec2(p.x+p.y*.38,p.y-p.x*.38),density);
  vec3 film=mix(low,hi,.3+.55*sheen);
  film=mix(film,finishSpectrum(axis*.18+p.y*.07)*(.6+.35*sheen),.44);
  float lum=dot(base,vec3(.2126,.7152,.0722));
  field=film+hi*glass.x*(.08+.12*sheen);
  result=mix(base,film*(.42+.8*lum),.36)+hi*glass.x*.13+hi*glint*.08;
 }
 else if(style>21.5&&style<22.5){
  vec2 q=p*3.+vec2(finish_time*.04,-finish_time*.06);float cloud=finishCloud(q);
  float bolt=pow(1.-smoothstep(.01,.045,abs(p.x-.52+(finishNoise(vec2(p.y*11.,floor(finish_time*.25)))-.5)*.32)),2.);
  float pulse=pow(.5+.5*sin(finish_time*1.5),14.);
  field=low*.65+hi*pow(cloud,3.)*.65+vec3(.18,.38,.68)*cloud*.23+hi*bolt*pulse*.28;
  result=base*.93+field*.42;
 }
 else if(style>22.5&&style<23.5){
  vec2 grid=p*vec2(max(2.,density),max(3.,density*1.5));grid.x+=floor(grid.y)*.5;
  vec2 cell=floor(grid),q=(fract(grid)-.5)*2.;float turn=(finishHash(cell)-.5)*1.3;
  q=mat2(vec2(cos(turn),sin(turn)),vec2(-sin(turn),cos(turn)))*q;
  float cap=sqrt(max(0.,1.-q.x*q.x/.64)),curve=.7*q.x*q.x-.28;
  float banana=(1.-smoothstep(.1*cap,.1*cap+.035,abs(q.y-curve)))*(1.-smoothstep(.76,.83,abs(q.x)));
  vec3 peel=mix(low,hi,.45+.55*exp(-abs(q.y-curve+.035)*32.));
  field=mix(low*.4,peel,banana)+hi*glint*.12;result=base*.94+field*.3;
 }
 else if(style>23.5&&style<24.5){
  vec2 tissue=finishWeb(p,density);
  float satin=pow(.5+.5*cos((axis-.78)*6.283185),3.);
  float cloudy=finishCloud(p*3.1);
  vec3 reflected=mix(low,vec3(.74,.75,.77),.90);
  vec3 cloth=mix(low*(.64+.22*cloudy),reflected,satin*.94);
  vec3 fiber=hi*(1.01+.06*satin)+vec3(.025)*glint;
  field=mix(cloth*(1.-tissue.y*.42),fiber,tissue.x);
  result=mix(base*.96,field,.72*tissue.x)+low*satin*.035;
 } else if(style>24.5&&style<25.5){
  vec2 circuit=finishCircuitBuses(p,density);
  float silver=pow(.5+.5*cos((axis-.58)*6.283185),5.);
  float groove=pow(.5+.5*cos((axis+.16)*6.283185),2.);
  float grain=(finishHash(floor(p*vec2(720.,1080.)))-.5)*.012;
  float brush=sin(p.y*850.+p.x*25.)*.008;
  vec3 metal=mix(low*.52,vec3(.52,.63,.62),.10+.84*silver)+vec3(grain+brush);
  vec3 conductor=mix(vec3(.025,.30,.34),hi,.20+.80*groove);
  field=metal*(1.-circuit.y*.38)+conductor*circuit.x*.85;
  float lum=dot(base,vec3(.2126,.7152,.0722));
  result=mix(base,metal*(.5+.8*lum),.32)-base*circuit.y*.16+conductor*circuit.x*.45;
 }
 else if(style>25.5&&style<26.5){
  float frost=finishFrost(p),grain=finishHash(floor(p*1000.))-.5;
  float white=pow(.5+.5*cos((axis-.35)*6.283185),3.);
  field=mix(low,hi,.28+.45*frost+.12*white)+vec3(grain*.045);
  result=mix(base,field,.13+.22*frost)+hi*white*.065+vec3(grain*.025);
 }
 else if(style>27.5&&style<28.5){
  vec2 water=finishCaustics(p,finish_time,density);
  float waterDepth=.36+.25*finishCloud(p*1.6)+.14*(1.-clamp(water.y,0.,1.));
  float glisten=pow(.5+.5*cos((dot(p,vec2(.46,.72))-eye.x-eye.y)*6.283185),6.);
  field=low*waterDepth+hi*water.x*(.42+.28*glisten)+hi*.035;
  result=base*(1.-water.x*.06)+hi*water.x*(.13+.10*glisten)+low*.025;
 }
 return clamp(replaceArt?field:result,0.,1.);
}
vec3 finishComposite(vec3 base,vec3 result,vec3 low,float strength,bool replaceArt){return mix(replaceArt?low*.65:base,result,clamp(strength,0.,1.));}
float rimPath(vec2 p,float cut){
 float c=clamp(cut,0.,.25),a=1.-2.*c,b=1.5-2.*c,d=c*1.41421356,along=0.;
 if(p.x>1.-c&&p.y<c)along=a+clamp(dot(p-vec2(1.-c,0.),vec2(.70710678)),0.,d);
 else if(p.x>1.-c&&p.y>1.5-c)along=a+d+b+clamp(dot(p-vec2(1.,1.5-c),vec2(-.70710678,.70710678)),0.,d);
 else if(p.x<c&&p.y>1.5-c)along=2.*a+b+2.*d+clamp(dot(p-vec2(c,1.5),vec2(-.70710678)),0.,d);
 else if(p.x<c&&p.y<c)along=2.*a+2.*b+3.*d+clamp(dot(p-vec2(0.,c),vec2(.70710678,-.70710678)),0.,d);
 else {vec2 edge=min(p,vec2(1.,1.5)-p);if(edge.y<edge.x)along=p.y<.75?clamp(p.x-c,0.,a):a+b+2.*d+clamp(1.-c-p.x,0.,a);else along=p.x>.5?a+d+clamp(p.y-c,0.,b):2.*a+b+3.*d+clamp(1.5-c-p.y,0.,b);}
 return along/max(.01,2.*a+2.*b+4.*d);
}
float rimDistance(vec2 p,float cut){vec2 q=abs(p-vec2(.5,.75));return min(min(.5-q.x,.75-q.y),(1.25-cut-q.x-q.y)*.70710678);}
// Coherent global-up advection. UV y grows down, so positive time moves the field up.
float rimFireFlow(vec2 p,float local_time){
 vec2 flow=p+vec2(0.,local_time*.22);
 float bend=(finishNoise(vec2(flow.y*14.,flow.x*19.))-.5)*.4;
 float broad=finishNoise(vec2(flow.x*62.+bend,flow.y*22.));
 float fine=finishNoise(vec2(flow.x*121.+17.8,flow.y*31.));
 return broad*.72+fine*.28;
}
vec3 rimFireTint(vec3 tint,vec2 p,float local_time,float finish,float amount){
 if(finish>10.5){vec3 spectrum=finishSpectrum(p.x*.43+p.y*.31+local_time*.035);return mix(tint,spectrum,amount);}
 return tint;
}
// Beveled cut-corner links, with true apertures and two staggered planes.
float rimChainBox(vec2 point,vec2 size,float cut){
 vec2 q=abs(point)-size;
 return max(max(q.x,q.y),(q.x+q.y+cut)*.70710678);
}
vec3 rimChainLink(vec2 point,vec2 size,float cut,vec2 wall){
 vec2 aperture=size-wall;
 float outer=rimChainBox(point,size,cut),hole=rimChainBox(point,aperture,min(max(.025,cut-.04),min(aperture.x,aperture.y)*.85));
 float sd=max(outer,-hole),coverage=1.-smoothstep(-.018,.018,sd);
 // Broad metal face plus an angled bevel, rather than a round wire highlight.
 float face=smoothstep(0.,.052,-sd),upper=1.-smoothstep(-.045,.045,point.y);
 float illumination=.42+face*.35+upper*.13;
 return vec3(coverage,illumination,1.-face);
}
// Chain holes are coverage, rather than dark paint over the original card.
vec3 rimChain(vec2 uv,vec4 chainMetrics){
 vec2 p=uv*vec2(1.,1.5),q=abs(p-vec2(.5,.75));
 float dist=min(min(.5-q.x,.75-q.y),(1.25-chainMetrics.y-q.x-q.y)*.70710678);
 float across=dist/max(.004,chainMetrics.x),section=rimPath(p,chainMetrics.y)*72.;
 vec2 link=vec2((fract(section)-.5)*1.55,(across-.32)*1.5);
 vec2 join=vec2((fract(section+.5)-.5)*1.55,(across-.65)*1.5);
 join.y+=join.x*.18;
 vec3 face=rimChainLink(link,vec2(.68,.28),.12,vec2(.13,.225));
 vec3 side=rimChainLink(join,vec2(.70,.19),.095,vec2(.14,.14));
 // The upright connector passes below the face link at both shared ends.
 float nearFace=1.-smoothstep(.28,.45,abs(join.x));
 side.y*=.67+.14*nearFace;
 float coverage=max(face.x,side.x);
 return vec3(coverage,mix(side.y,face.y,face.x),mix(side.z,face.z,face.x));
}
vec2 rimBrainCurve(vec2 q,vec2 a,vec2 b,vec2 c){
 // Closest point on a rounded fold. Six short segments preserve the hook
 // without texture sampling or finite-difference normal evaluations.
 vec2 previous=a,best=q-a;float nearest=dot(best,best);
 for(int i=1;i<=6;i++){
  float t=float(i)/6.,s=1.-t;
  vec2 next=s*s*a+2.*s*t*b+t*t*c,edge=next-previous;
  vec2 delta=q-previous-edge*clamp(dot(q-previous,edge)/max(.0001,dot(edge,edge)),0.,1.);
  float squared=dot(delta,delta);
  if(squared<nearest){nearest=squared;best=delta;}
  previous=next;
 }
 return best;
}
vec4 rimBrainCell(vec2 q,float cell){
 float seed=finishHash(vec2(mod(cell+54.,54.),17.));
 float angle=(seed-.5)*.52;mat2 turn=mat2(vec2(cos(angle),-sin(angle)),vec2(sin(angle),cos(angle)));
 q=turn*q;q.x+=.06*sin(q.y*2.3+seed*5.);
 if(seed>.5)q.x=-q.x;
 vec2 a=vec2(-1.13,-1.48),b=vec2(.38,-1.15),c=vec2(-.27,-.25),d=vec2(-1.20,.55),e=vec2(-.45,1.43);
 vec2 f=vec2(.06,-1.46),g=vec2(1.38,-.63),h=vec2(.64,.14),i=vec2(-.20,.81),j=vec2(1.03,1.47);
 if(seed<.33){
  b=vec2(.55,-1.12);c=vec2(-.05,-.25);d=vec2(-1.35,.42);e=vec2(-.86,.72);
  f=vec2(.93,-1.2);g=vec2(-.16,-.42);h=vec2(.84,.20);i=vec2(.50,.94);j=vec2(-.60,1.46);
 }else if(seed>.66){
  a=vec2(-1.05,-1.44);b=vec2(1.38,-1.02);c=vec2(.52,-.10);d=vec2(-1.36,.63);e=vec2(-.69,1.44);
  f=vec2(1.18,-1.43);g=vec2(1.5,-.15);h=vec2(.99,.65);i=vec2(.65,1.36);j=vec2(-.30,1.45);
 }
 vec2 first=rimBrainCurve(q,a,b,c),n=rimBrainCurve(q,c,d,e);
 if(dot(n,n)<dot(first,first))first=n;
 vec2 second=rimBrainCurve(q,f,g,h);n=rimBrainCurve(q,h,i,j);
 if(dot(n,n)<dot(second,second))second=n;
 float separation=abs(length(first)-length(second));
 vec2 closest=dot(first,first)<dot(second,second)?first:second;
 if(seed>.5)closest.x=-closest.x;
 closest=mat2(vec2(cos(angle),sin(angle)),vec2(-sin(angle),cos(angle)))*closest;
 return vec4(closest,separation,.52+.10*seed);
}
vec4 rimBrainFold(float path,float across){
 float cell=floor(path*54.);vec2 q=vec2((across-.5)*2.3,(fract(path*54.)-.5)*2.8);
 vec4 current=rimBrainCell(q,cell);
 if(abs(q.y)>.75){
  float offset=q.y>0.?1.:-1.;
  vec4 adjacent=rimBrainCell(q-vec2(0.,offset*2.8),cell+offset);
  float gap=abs(length(current.xy)-length(adjacent.xy));
  if(length(adjacent.xy)<length(current.xy))current=adjacent;
  current.z=min(current.z,gap);
 }
 return current;
}
vec3 rimBrainColor(vec3 low,vec3 hi,float path,float across,vec2 view,float localTime){
 vec4 folds=rimBrainFold(path,across);vec2 delta=folds.xy;float distance=length(delta);
 float radius=folds.w;
 float cap=sqrt(max(0.,1.-pow(distance/radius,2.)));
 vec3 normal=normalize(vec3(delta/radius,max(.025,cap)));
 float sway=.06*sin(localTime*.85);
 vec3 light=normalize(vec3(-.46+view.x*.70+sway,-.32-view.y*.65,.84));
 float diffuse=max(0.,dot(normal,light));
 vec3 halfway=normalize(light+normalize(vec3(view.x,-view.y,1.)));
 float specular=pow(max(0.,dot(normal,halfway)),32.);
 float patch=.25+.75*pow(.5+.5*sin(path*690.+across*2.1),5.);
 float streak=step(.58,finishHash(vec2(floor(path*2700.),floor(across*72.))));
 float fold=1.-smoothstep(radius-.025,radius+.035,distance);
 float crease=exp(-pow((distance-radius)/.095,2.));
 float grain=(finishHash(vec2(floor(path*1600.),floor(across*90.)))-.5)*.012;
 vec3 tissue=hi*(.23+.47*diffuse)+vec3(.025,.005,.025)*cap;
 tissue+=hi*specular*patch*(.72+.12*streak)+vec3(grain);
 vec3 groove=low*(.42+.19*cap)*(1.-crease*.38);
 vec3 result=mix(groove,tissue,fold);
 float cleft=1.-smoothstep(.02,.10,folds.z);
 return mix(result,low*.39,cleft*.85);
}
float rimCoverage(vec2 uv,vec4 chainMetrics,float finish){
 return finish>11.5&&finish<12.5?rimChain(uv,chainMetrics).x:1.;
}
float rimGlyph(vec2 q,float seed){
 float line=abs(q.x+.23);
 line=min(line,finishSegment(q,vec2(-.23,.28),vec2(.23,.28)));
 line=min(line,finishSegment(q,vec2(-.23,-.26),vec2(.20,.08)));
 line=min(line,finishSegment(q,vec2(.23,.28),vec2(.23,-.26)));
 if(seed>.5)line=min(line,finishSegment(q,vec2(-.23,-.26),vec2(.23,-.26)));
 return 1.-smoothstep(.025,.075,line);
}
// Lettering and panels are procedural; no reference raster enters the product.
float rimSignBox(vec2 q,vec2 halfSize,float radius){vec2 d=abs(q)-halfSize+radius;return length(max(d,vec2(0.)))+min(max(d.x,d.y),0.)-radius;}
float rimSignGlyph(vec2 q,float glyph){
 float line=1.;
 if(glyph<.5){
  line=min(line,finishSegment(q,vec2(-.34,-.29),vec2(.34,-.29)));
  line=min(line,abs(rimSignBox(q,vec2(.26,.20),.012)));
  line=min(line,finishSegment(q,vec2(0.,-.42),vec2(0.,.43)));
  line=min(line,finishSegment(q,vec2(-.25,0.),vec2(.25,0.)));
  line=min(line,finishSegment(q,vec2(0.,.16),vec2(-.35,.41)));
  line=min(line,finishSegment(q,vec2(0.,.16),vec2(.35,.41)));
 }else if(glyph<1.5){
  line=min(line,finishSegment(q,vec2(0.,-.43),vec2(0.,-.34)));
  line=min(line,finishSegment(q,vec2(-.36,-.29),vec2(.36,-.29)));
  line=min(line,abs(rimSignBox(q-vec2(0.,-.06),vec2(.24,.13),.012)));
  line=min(line,finishSegment(q,vec2(0.,.12),vec2(0.,.42)));
  line=min(line,finishSegment(q,vec2(-.14,.17),vec2(-.31,.38)));
  line=min(line,finishSegment(q,vec2(.14,.17),vec2(.31,.38)));
 }else if(glyph<2.5){
  line=min(line,finishSegment(q,vec2(-.23,-.34),vec2(.22,-.34)));
  line=min(line,finishSegment(q,vec2(.22,-.34),vec2(.28,-.13)));
  line=min(line,finishSegment(q,vec2(.28,-.13),vec2(-.26,.21)));
  line=min(line,finishSegment(q,vec2(-.26,.21),vec2(-.27,.34)));
  line=min(line,finishSegment(q,vec2(-.27,.34),vec2(.27,.34)));
 }else if(glyph<3.5){line=abs(rimSignBox(q,vec2(.28,.38),.12));}
 else{
  line=min(line,abs(rimSignBox(q-vec2(0.,-.17),vec2(.27,.21),.09)));
  line=min(line,finishSegment(q,vec2(.27,-.16),vec2(.21,.27)));
  line=min(line,finishSegment(q,vec2(.21,.27),vec2(-.17,.38)));
 }
 return line;
}
vec4 rimNeonSign(vec2 p,float localTime){
 bool left=p.x<.5;vec2 center=vec2(left?-.026:1.026,left?.34:.87);
 vec2 halfSize=vec2(.044,left?.157:.320),local=p-center;
 float box=rimSignBox(local,halfSize,.011),border=abs(box+.004);
 float row=(local.y+halfSize.y-.036)/(left?.120:.142);
 float character=floor(row),stroke=1.;
 if(left&&character>-.5&&character<1.5){stroke=rimSignGlyph(vec2(local.x/.062,(fract(row)-.5)*.94),character);}
 if(!left&&character>-.5&&character<3.5){float glyph=character<.5?2.:character<1.5?3.:4.;stroke=rimSignGlyph(vec2(local.x/.071,(fract(row)-.5)*.88),glyph);}
 float lettering=1.-smoothstep(.040,.080,stroke);
 float lines=1.-smoothstep(.004,.010,abs(fract((local.y+halfSize.y)*140.)-.5)/140.);
 lines*=step(abs(local.y),halfSize.y)*step(halfSize.y-(left?.032:.035),abs(local.y));
 float edge=1.-smoothstep(.0015,.0045,border),inside=1.-smoothstep(-.001,.001,box);
 float scan=exp(-pow((fract(row*.22-localTime*.16)-.5)/.035,2.))*.035;
 float pulse=.95+.05*sin(localTime*2.4+(left?0.:1.1));
 vec3 pink=vec3(1.,.08,.64),hot=vec3(1.,.74,.98);
 vec3 rgb=mix(vec3(.20,.012,.13),pink,.18+.40*scan);
 rgb+=mix(pink,hot,.64)*(lettering*.84+edge*.78+lines*.58)*pulse;
 float glow=exp(-max(0.,box)/.007)*.42+exp(-max(0.,box)/.017)*.09;
 return vec4(clamp(rgb+pink*glow*.35,0.,1.),clamp(inside+glow*(1.-inside),0.,1.));
}
vec3 rimPaxGraphic(vec3 low,vec3 hi,float path,float across){
 // Broad printed blocks and white negative strokes, fixed in the frame UV.
 vec3 ink=vec3(.99,.68,.015);
 if(path>.018&&path<.045||path>.071&&path<.125)ink=vec3(.82,.10,.59);
 else if(path>.19&&path<.25||path>.325&&path<.373)ink=hi;
 else if(path>=.25&&path<.288)ink=vec3(.97,.07,.12);
 else if(path>=.288&&path<.325||path>.795&&path<.863)ink=low;
 else if(path>.863&&path<.886)ink=vec3(.02,.68,.96);
 else if(path>.645&&path<.723)ink=vec3(.79,.05,.66);
 float printArea=path<.19||path>.288&&path<.325||path>.795&&path<.906?1.:0.;
 float stroke=step(.76,fract(path*37.+across*.42))*printArea;
 float topWhite=path>.13&&path<.19?1.:0.;
 return mix(ink,hi,max(stroke,topWhite));
}
float rimPaxPatch(float path,float localTime){
 float a=abs(fract(path-.14+.5)-.5),b=abs(fract(path-.402+.5)-.5);
 float c=abs(fract(path-.765+.5)-.5),d=abs(fract(path-.883+.5)-.5);
 float e=abs(fract(path-.58+.5)-.5);
 float width=.0011*(.92+.08*sin(localTime*2.1));
 float patch=exp(-a*a/width)+exp(-b*b/width)+exp(-c*c/width)+exp(-d*d/(width*1.6))+exp(-e*e/width)*.70;
 return min(1.,patch)*(.94+.06*sin(localTime*3.+path*21.));
}
vec3 rimPaxPaint(float localTime){
 float tint=.5-.5*cos(localTime*1.55);
 return vec3(1.,.94-.915*pow(tint,.7),.015+.30*pow(tint,4.));
}
vec4 rimPaxSpray(vec2 p,float path,float outside,float localTime){
 // Tight paint dust stays attached to the same rigid cut-corner frame.
 float patch=rimPaxPatch(path,localTime);
 float reach=.006+.076*patch;
 float envelope=1.-smoothstep(reach*.2,reach,outside);
 vec2 cell=floor(p*480.+vec2(localTime*11.,-localTime*16.));
 float grain=finishHash(cell),fleck=step(.24,grain)*pow(grain,2.);
 float soft=finishNoise(p*130.+vec2(0.,localTime*3.));
 float cluster=patch*envelope;
 float a=cluster*(fleck*.85+soft*soft*.42);
 a+=exp(-outside/.040)*patch*.90*envelope;
 vec3 color=rimPaxPaint(localTime);
 if(p.y>1.5){
  float below=p.y-1.5;
  float drop=exp(-pow((p.x-.066)/.0018,2.))*(1.-smoothstep(.024,.029,below));
  drop+=exp(-pow((p.x-.134)/.0014,2.))*(1.-smoothstep(.009,.015,below));
  drop+=exp(-pow((p.x-.812)/.0016,2.))*(1.-smoothstep(.015,.021,below));
  a=max(a,drop*.85);
 }
 return vec4(color,clamp(a,0.,1.));
}
vec3 rimRefractionColor(vec3 low,vec3 hi,float path,float across,vec2 view,float localTime,float bevelWeight){
 // Fixed parallel polished rails. Interfering reflections move across them,
 // rather than moving the outline or spreading the frame over the artwork.
 float eye=view.x*.48-view.y*.34;
 float wave=.5+.5*cos(path*43.982297-localTime*7.5+eye*6.283185);
 float second=.5+.5*cos(path*69.115038+localTime*4.5-eye*4.);
 float sheen=pow(clamp(wave*.72+second*.45-.12,0.,1.),1.6);
 vec3 prism=finishSpectrum(path*3.2+localTime*.20+across*.32+eye+.40);
 vec3 blue=mix(low,vec3(.015,.30,.95),.72);
 vec3 cyan=vec3(.035,.77,1.);
 float outer=exp(-pow((across-.14)/.11,2.));
 float inner=exp(-pow((across-.85)/.10,2.));
 float face=exp(-pow((across-.53)/.36,2.));
 float groove=exp(-pow((across-.31)/.055,2.))+exp(-pow((across-.74)/.045,2.));
 vec3 film=mix(blue,prism,.32+.42*wave)*(.60+.35*bevelWeight);
 vec3 rails=mix(cyan,prism,.32+.45*second)*(outer*.72+inner*.65);
 vec3 white=hi*(face*sheen*.91+(outer+inner)*(.12+.48*sheen));
 return (film*face+blue*.28+rails+white)*(1.-groove*.38);
}
vec3 rimHalloweenCandy(vec3 purple,vec3 orange,vec2 p,float across,float cut,vec2 view){
 // The observed bands are fixed diagonal paint: roughly 64% orange and 36%
 // purple. Global coordinates keep the pattern continuous at cut corners.
 float phase=fract((p.x+p.y)*6.85+.052);
 float painted=smoothstep(.006,.018,phase)*(1.-smoothstep(.638,.650,phase));
 vec3 paint=mix(purple,orange,painted);
 float x=clamp((across-.5)*2.,-.999,.999);
 vec2 edge=min(p,vec2(1.,1.5)-p),inward;
 float diagonal=(1.25-cut-abs(p.x-.5)-abs(p.y-.75))*.70710678;
 if(diagonal<min(edge.x,edge.y))inward=normalize(vec2(p.x<.5?1.:-1.,p.y<.75?1.:-1.));
 else inward=edge.x<edge.y?vec2(p.x<.5?1.:-1.,0.):vec2(0.,p.y<.75?1.:-1.);
 vec3 normal=normalize(vec3(x*inward.x,-x*inward.y,sqrt(max(.002,1.-x*x))));
 vec3 light=normalize(vec3(-.54+view.x*.65,-.15-view.y*.3,.83));
 float diffuse=max(0.,dot(normal,light));
 float highlight=pow(max(0.,dot(normal,normalize(light+normalize(vec3(view.x,-view.y,1.))))),36.);
 float rail=exp(-pow((across-.13)/.045,2.));
 float inner=exp(-pow((across-.93)/.055,2.));
 float joint=exp(-pow(min(phase,abs(phase-.65))/.012,2.));
 vec3 reflection=mix(vec3(1.,.62,1.),vec3(1.,.89,.68),painted);
 return paint*(.40+.60*diffuse)*(1.-joint*.55)*(1.-inner*.36)+reflection*(rail*.52+highlight*.45);
}
float rimStickerTriangle(vec2 q,vec2 a,vec2 b,vec2 c){
 vec2 ab=b-a,bc=c-b,ca=a-c,qa=q-a,qb=q-b,qc=q-c;
 float x=ab.x*qa.y-ab.y*qa.x,y=bc.x*qb.y-bc.y*qb.x,z=ca.x*qc.y-ca.y*qc.x;
 bool inside=(x>=0.&&y>=0.&&z>=0.)||(x<=0.&&y<=0.&&z<=0.);
 float distance=min(finishSegment(q,a,b),min(finishSegment(q,b,c),finishSegment(q,c,a)));
 return inside?-distance:distance;
}
float rimStickerShape(vec2 q,float kind){
 if(kind<.5)return max(length(q)-1.,1.-length(q+vec2(.56,0.)));
 if(kind<1.5){
  vec2 p=vec2(abs(q.x),q.y);
  float body=(length(q/vec2(.22,.35))-1.)*.22;
  body=min(body,length(q-vec2(0.,-.35))-.16);
  for(int i=0;i<4;i++){
   float row=float(i),start=-.27+row*.18;
   vec2 root=vec2(.13,start),knee=vec2(.50,start+(row-1.5)*.15),tip=vec2(.71,start+(row-1.5)*.38);
   vec2 middle=mix(knee,tip,.5)+vec2(.06,0.);
   float leg=min(finishSegment(p,root,knee),min(finishSegment(p,knee,middle),finishSegment(p,middle,tip)))-.043;
   body=min(body,leg);
  }
  return body;
 }
 if(kind<2.5){
  vec2 p=vec2(abs(q.x),q.y);
  float wing=min(rimStickerTriangle(p,vec2(.10,-.32),vec2(1.25,-.56),vec2(.90,.50)),rimStickerTriangle(p,vec2(.10,-.32),vec2(.90,.50),vec2(.12,.35)));
  wing=max(wing,.24-length(p-vec2(.32,.49)));
  wing=max(wing,.25-length(p-vec2(.65,.51)));
  wing=max(wing,.22-length(p-vec2(.59,-.60)));
  float body=(length(q/vec2(.16,.44))-1.)*.16;
  float ear=rimStickerTriangle(p,vec2(.03,-.30),vec2(.14,-.65),vec2(.18,-.25));
  return min(wing,min(body,ear));
 }
 if(kind<3.5)return (abs(q.x)+abs(q.y)-.73)*.70710678;
 float bone=finishSegment(q,vec2(-.63,0.),vec2(.63,0.))-.13;
 for(int i=0;i<2;i++){
  float end=float(i)*1.26-.63;
  bone=min(bone,min(length(q-vec2(end,-.14)),length(q-vec2(end,.14)))-.23);
 }
 return bone;
}
float rimStickerTopSpider(vec2 q){
 vec2 p=vec2(abs(q.x),q.y);
 float body=(length((q-vec2(0.,.10))/vec2(.25,.34))-1.)*.25;
 body=min(body,length(q-vec2(0.,-.25))-.17);
 body=min(body,rimStickerTriangle(p,vec2(.03,-.26),vec2(.07,-.78),vec2(.19,-.20)));
 for(int i=0;i<4;i++){
  float signY=i<2?-1.:1.;
  bool inner=i==1||i==2;
  vec2 root=vec2(.13,signY*.08),control=vec2(inner?.60:.53,signY*(inner?.27:.19)),tip=vec2(inner?.42:.86,signY*(inner?1.22:.88));
  vec2 a=mix(mix(root,control,.333333),mix(control,tip,.333333),.333333);
  vec2 b=mix(mix(root,control,.666667),mix(control,tip,.666667),.666667);
  body=min(body,min(finishSegment(p,root,a),min(finishSegment(p,a,b),finishSegment(p,b,tip)))-.064);
 }
 return body;
}
float rimStickerQuad(vec2 q,vec2 a,vec2 b,vec2 c,vec2 d){
 vec2 ab=b-a,bc=c-b,cd=d-c,da=a-d,qa=q-a,qb=q-b,qc=q-c,qd=q-d;
 float x=ab.x*qa.y-ab.y*qa.x,y=bc.x*qb.y-bc.y*qb.x,z=cd.x*qc.y-cd.y*qc.x,w=da.x*qd.y-da.y*qd.x;
 bool inside=(x>=0.&&y>=0.&&z>=0.&&w>=0.)||(x<=0.&&y<=0.&&z<=0.&&w<=0.);
 float distance=min(min(finishSegment(q,a,b),finishSegment(q,b,c)),min(finishSegment(q,c,d),finishSegment(q,d,a)));
 return inside?-distance:distance;
}
// Broad scalloped wings, curved lower edges and a narrow central body.
float rimStickerTopBat(vec2 q){
 vec2 p=vec2(abs(q.x),q.y);
 float wing=rimStickerQuad(p,vec2(.10,-.37),vec2(1.40,-.60),vec2(1.02,.60),vec2(.15,.20));
 wing=max(wing,1.20-length(p-vec2(.18,1.38)));
 wing=max(wing,.16-length(p-vec2(.33,-.48)));
 wing=max(wing,.22-length(p-vec2(.74,-.49)));
 wing=max(wing,.21-length(p-vec2(1.13,-.60)));
 float body=(length(q/vec2(.16,.40))-1.)*.16;
 float peak=rimStickerTriangle(q,vec2(0.,-.98),vec2(.22,-.37),vec2(-.22,-.37));
 return min(wing,min(body,peak));
}
vec4 rimStickerGlyph(vec2 p,float kind,float cell,float localTime,bool horizontal,float along,float outside,vec2 view){
 bool top=horizontal&&p.y<0.;
 float scale=kind<.5?.095:kind<1.5?.075:kind<2.5?(top?.082:.065):.080;
 float center=kind<.5?.076:kind<1.5?.065:kind<2.5?(horizontal?.060:.010):.045;
 float spin=localTime*(kind>1.5&&kind<2.5?2.3:1.4)+cell;
 // The right bat follows a bounded track through the top rim. Horizontal
 // wrapping happens off-card; the short preview does not establish a full loop.
 if(top&&kind>1.5&&kind<2.5&&cell>.14&&cell<.16){float orbit=localTime*4.4+.9;center=.035+.05*cos(orbit);spin=localTime*2.+cell;along=mod(.7725+.0175*sin(orbit)-.0075*localTime+.30,1.60)-.30;}
 // One continuous orbit, tumble and light phase for the middle top bat.
 // Coefficients are calibrated on the declared short reference; full lifetime
 // and other decorations still require independent visual verification.
 if(top&&kind>1.5&&kind<2.5&&cell>1.5&&cell<1.6){center=.023+.140*cos(localTime*.855+.893);spin=localTime*2.6125+cell;}
 // The top spider turns around a horizontal axis. Its centre follows that
 // orbit as it approaches the rim; the side spiders keep their own axis.
 if(top&&kind>.5&&kind<1.5){spin=localTime*2.2-3.96;center-=.080*sin(spin);}
 vec2 q=horizontal?vec2((p.x-along)/scale,-(outside-center)/scale):vec2(-(outside-center)/scale,(p.y-along)/scale);
 float rotation=(horizontal?0.:kind>1.5&&kind<2.5?1.570796:.0)+.10*sin(localTime*.6+cell);
 if(kind>3.5)rotation+=top?-.80+localTime*.95:.6;
 q=mat2(vec2(cos(rotation),-sin(rotation)),vec2(sin(rotation),cos(rotation)))*q;
 // The crescent starts almost edge-on and gradually reveals its face.
 // Keep the signed angle so later turns can show the reverse face as well.
 if(kind<.5)spin=localTime*.45-1.07;
 float face=cos(spin);
 if((kind>1.5&&kind<2.5)||(top&&kind>.5&&kind<1.5)){q.y/=max(.14,abs(face));if(face<0.&&!(top&&kind>1.5&&kind<2.5))q.y=-q.y;}
 else{q.x/=max(.14,abs(face));if(face<0.)q.x=-q.x;}
 if(abs(q.x)>1.65||abs(q.y)>1.65)return vec4(0.);
 float sd=top&&kind>1.5&&kind<2.5?rimStickerTopBat(q):top&&kind>.5&&kind<1.5?rimStickerTopSpider(q):rimStickerShape(q,kind),body=1.-smoothstep(-.018,.018,sd);
 float glow=exp(-max(0.,sd)*10.)*.14*(1.-body);
 // A turning face has a dark green side and a broad yellow reflection.
 // Signed distance supplies the narrow bevel without extra shape samples.
 float light=clamp(.22+.66*smoothstep(-.65,.32,q.x)+.12*(1.-abs(q.y)),0.,1.);
 light*=.36+.64*sqrt(abs(face));
 float bevel=exp(-abs(sd+.032)*48.);
 float reflection=pow(max(0.,cos(spin-view.x*.6+view.y*.4)),12.);
 vec3 paint=mix(vec3(.045,.16,.012),vec3(1.,1.,.035),light);
 if(kind<.5){
  float faceLight=q.x-.65*sin(localTime*1.25-.70)*q.y;
  paint=mix(vec3(.018,.05,.002),vec3(1.,1.,.10),(.24+.76*smoothstep(.04,.58,faceLight))*(.80+.20*sqrt(abs(face))));
 }
 if(top&&kind>1.5&&kind<2.5){
  // The middle bat catches a small sweep on the peak as its face turns.
  float sweep=cell>1.5&&cell<1.6?.15*pow(max(0.,-face),6.):0.;
  if(cell>.14&&cell<.16)sweep=.20*pow(max(0.,-face),6.);
  float verticalLight=(.12+.88*smoothstep(-.80,.25,q.y+sweep))*(.70+.30*sqrt(abs(face)));
  paint=mix(vec3(.015,.035,.002),vec3(1.,1.,.065),verticalLight);
 }
 if(kind> .5&&kind<1.5)paint=mix(vec3(.016,.16,.012),vec3(.30,.96,.045),light);
 if(top&&kind>.5&&kind<1.5){
  float rimLight=1.-smoothstep(.036,.125,outside);
  float facingLight=max(0.,face);
  paint=mix(vec3(.004,.012,.001),vec3(.49,1.,.035),rimLight*facingLight);
  bevel*=rimLight*facingLight;reflection*=rimLight*facingLight;
 }
 paint+=vec3(1.,1.,.13)*(bevel*.12+reflection*.10);
 return vec4(clamp(paint,0.,1.),body+glow);
}
float rimStickerTrack(float along){return mod(along+.30,1.60)-.30;}
vec4 rimStickerOver(vec4 under,vec4 over){float alpha=over.a+under.a*(1.-over.a);return vec4((over.rgb*over.a+under.rgb*under.a*(1.-over.a))/max(alpha,.00001),alpha);}
vec4 rimHalloweenStickers(vec2 p,float localTime,vec2 view){
 bool horizontal=p.y<0.||p.y>1.5;
 float outside=horizontal?(p.y<0.?-p.y:p.y-1.5):(p.x<0.?-p.x:p.x-1.);
 float coordinate=horizontal?p.x:p.y,drift=(horizontal?-1.:1.)*localTime*.092;
 float section=(coordinate-.205-drift)/.255,cell=floor(section+.5),id=mod(cell+100.,5.);
 float kind=id<.5?0.:id<1.5?1.:id<2.5?2.:id<3.5?0.:4.;
 vec4 icon;
 if(horizontal){
  // Separate measured top tracks; do not inherit the side's uniform sequence.
  icon=rimStickerGlyph(p,2.,.25,localTime,true,.215,outside,view);
  icon=rimStickerOver(icon,rimStickerGlyph(p,2.,1.57,localTime,true,rimStickerTrack(.55+localTime*.055),outside,view));
  icon=rimStickerOver(icon,rimStickerGlyph(p,2.,p.y<0.?.15:1.1,localTime,true,.79,outside,view));
  icon=rimStickerOver(icon,rimStickerGlyph(p,0.,0.,localTime,true,rimStickerTrack(.235+localTime*.092),outside,view));
  icon=rimStickerOver(icon,rimStickerGlyph(p,4.,.6,localTime,true,rimStickerTrack(.686-localTime*.112),outside,view));
  vec4 spider=rimStickerGlyph(p,1.,2.2,localTime,true,rimStickerTrack(p.y<0.?.525+localTime*.038:.44+localTime*.08),outside,view);
  // The top orbit crosses behind and then in front of the other decorations.
  icon=p.y<0.&&cos(localTime*2.2-3.96)<0.?rimStickerOver(spider,icon):rimStickerOver(icon,spider);
 }else icon=rimStickerGlyph(p,kind,kind>.5&&kind<1.5?-1.26:cell*.7,localTime,false,.205+cell*.255+drift+(id>2.5&&id<3.5?.043:kind>.5&&kind<1.5?.015:0.),outside,view);
 // Small filled diamonds occupy the gaps, rather than adding full particle nodes.
 float slot=floor(section),at=.205+(slot+.5)*.255+drift;
 vec2 small=vec2((coordinate-at)/.014,(outside-.035)/.014);
 float diamond=1.-smoothstep(.66,.78,abs(small.x)+abs(small.y));
 vec3 green=vec3(.43,.88,.025);
 icon.rgb=mix(icon.rgb,green,diamond);icon.a=max(icon.a,diamond*.75);
 icon.a*=1.-smoothstep(.128,.14,outside);
 return icon;
}
// Approved original design: polished silver/gold rails, counter-flow ribbons,
// and four fixed jewels. Only the existing bounded rim/aura meshes are shaded.
vec3 rimColor(vec3 low,vec3 hi,vec2 uv,vec2 view,float finish_time,vec4 rimMetrics,float finish,vec2 animation,float bevelWeight){
 vec2 p=uv*vec2(1.,1.5),q=abs(p-vec2(.5,.75));
 float dist=min(min(.5-q.x,.75-q.y),(1.25-rimMetrics.y-q.x-q.y)*.70710678);
 float w=max(rimMetrics.x,.004),across=clamp(dist/w,0.,1.);
 float edge=(1.-smoothstep(.001,.0035,dist))+(1.-smoothstep(.001,.0035,w-dist));
 float reflect=pow(.5+.5*cos((uv.x*.7+uv.y*.42-view.x*.4+view.y*.3)*6.283185),9.);
 vec3 metal=low*(.52+.35*bevelWeight)+hi*(.08+.25*reflect)*bevelWeight;
 if(finish<.5)metal=low*.9+hi*edge*.1;
 else metal+=hi*(edge*.34+pow(reflect,4.)*.16);
 if(finish>.5&&finish<1.5){
  float ridge=exp(-pow((across-.17)/.105,2.))+exp(-pow((across-.84)/.12,2.));
  float groove=exp(-pow((across-.53)/.13,2.));
  float highlight=pow(.5+.5*cos((uv.x*.73+uv.y*.39-view.x*.52+view.y*.36)*6.283185),12.);
  metal=low*(.42+.36*bevelWeight)*(1.-groove*.56)+hi*(.16+.44*ridge+.25*highlight);
  metal=mix(metal,vec3(1.,.98,.9),clamp(ridge*(.25+.6*highlight)+edge*.36,0.,.9));
 }
 float path=rimPath(p,rimMetrics.y),localTime=finish_time*animation.y;
 if(finish>19.5&&finish<20.5){
  // Original F02: cyan and violet ribbons counter-orbit every ten seconds.
  float phase=localTime*.62831853;
  float cyanPath=abs(fract(path-localTime/10.+.5)-.5);
  float violetPath=abs(fract(path+localTime/10.+.27+.5)-.5);
  float cyanWidth=.10+.018*sin(path*12.56637+phase);
  float violetWidth=.055+.010*cos(path*18.84956-phase);
  float cyanLane=.35+.08*sin(path*12.56637-phase);
  float violetLane=.67+.08*cos(path*12.56637+phase);
  float cyanBeam=exp(-pow(cyanPath/cyanWidth,2.))*exp(-pow((across-cyanLane)/.28,2.));
  float violetBeam=exp(-pow(violetPath/violetWidth,2.))*exp(-pow((across-violetLane)/.19,2.));
  float rail=exp(-pow((across-.50)/.36,2.));
  float face=smoothstep(.55,.80,bevelWeight);
  metal=low*(.60+.24*bevelWeight)+hi*(edge*.15+reflect*.18+rail*.045);
  metal+=(hi*cyanBeam*.80+vec3(.61,.22,.95)*violetBeam*.83)*face;
 }
 if(finish>18.5&&finish<19.5){
  // Original F01: an engraved inner rail with three discrete orbiting lamps.
  float rail=exp(-pow((across-.70)/.09,2.)),groove=exp(-pow((across-.43)/.11,2.));
  metal=low*(.65+.24*bevelWeight)*(1.-groove*.50)+hi*(rail*.19+reflect*.22+edge*.24);
  for(int i=0;i<3;i++){
   float delta=abs(fract(path-localTime/8.-float(i)/3.+.5)-.5);
   float head=exp(-delta*delta*18000.);
   float trail=exp(-pow(fract(path-localTime/8.-float(i)/3.)/.019,2.))*.28;
   metal+=mix(hi,vec3(.94,.99,1.),.55)*rail*(head*.94+trail);
  }
 }
 if(finish>1.5&&finish<2.5){
  // A broad luminous face with two fine white rails, rather than a narrow bulb.
  float face=1.-smoothstep(.38,.49,abs(across-.5));
  float rail=exp(-pow((across-.14)/.055,2.))+exp(-pow((across-.86)/.055,2.));
  float reflection=pow(.5+.5*cos((p.y*.78+p.x*.21-view.x*.42+view.y*.35)*6.283185),3.);
  vec3 light=mix(low,hi,.56)+hi*.25;
  light=mix(light,vec3(1.),reflection*.45);
  metal=mix(low*(.62+.22*bevelWeight),light,face);
  metal=mix(metal,vec3(1.),clamp(rail*.50+edge*.12,0.,.65));
 }
 if(finish>2.5&&finish<3.5){
  vec2 cell=floor(p*vec2(210.,240.)),f=fract(p*vec2(210.,240.))-.5;
  float seed=finishHash(cell),grain=finishHash(cell+9.4),flash=pow(.5+.5*sin(seed*47.+localTime*2.7+view.x*5.-view.y*3.),12.);
  float crystal=exp(-dot(f,f)*15.)*step(.32,grain),spark=step(.81,grain)*flash*crystal;
  metal=low*(.3+.5*grain)+hi*(crystal*.24+.72*spark+.25*reflect)*(.45+.55*bevelWeight)+hi*edge*.28;
 }
 else if((finish>3.5&&finish<4.5)||(finish>16.5&&finish<18.5)){
  // Worn silver edges enclose a dark painted groove; topology never moves.
  float coarse=finishNoise(vec2(path*175.,across*12.)),grain=finishNoise(p*vec2(380.,520.));
  float wearWidth=.075+.12*coarse+.035*grain;
  float worn=1.-smoothstep(wearWidth,wearWidth+.065,min(across,1.-across));
  float groove=exp(-pow((across-.50)/.31,4.));
  float scuff=pow(finishNoise(vec2(path*650.,across*6.)),5.)*.20;
  vec3 paint=low*(.66+.18*grain+.16*reflect)*(1.-groove*.16);
  vec3 exposed=hi*(.62+.24*bevelWeight+.20*reflect)+vec3(.08)*grain;
  if(finish>16.5&&finish<17.5){
   float patina=smoothstep(.30,.70,finishNoise(vec2(path*220.,across*9.)));
   paint=low*(.54+.18*grain+.24*reflect)*(1.-groove*.24);
   exposed=mix(hi*.42,hi*(.86+.20*reflect),patina)+vec3(.04,.07,.03)*grain;
  }
  if(finish>17.5){
   vec3 film=mix(vec3(.50,.62,.65),finishSpectrum(path*2.4+view.x*.55-view.y*.35+grain*.12),.72);
   paint=mix(film,vec3(.82,.94,.98),.22+.40*reflect)*(.50+.40*reflect)*(1.-groove*.14);
   exposed=mix(film,vec3(.81,.98,.95),.55)*(.72+.25*reflect);
  }
  metal=mix(paint,exposed,clamp(worn+scuff,0.,1.))+hi*pow(reflect,5.)*(.13+.26*worn);
 }
 else if(finish>4.5&&finish<5.5){
  float section=path*72.,seed=finishHash(vec2(floor(section),3.1)),u=fract(section);
  float root=.48+.14*sin(path*81.);
  float strand=abs(across-root);
  float branch=abs(across-root-(u-.5)*(1.1+seed*.8));
  float split=abs(across-root+(u-.2)*1.6);
  float lines=1.-smoothstep(.025,.065,min(strand,min(branch,split)));
  metal=mix(low*(.56+.24*bevelWeight),hi*(.72+.2*reflect),lines)+hi*edge*.10;
 }
 else if(finish>5.5&&finish<6.5){float stripe=smoothstep(.46,.52,fract((p.x+p.y)*7.));metal=mix(hi,low,stripe)*(.75+.25*bevelWeight)+hi*reflect*.18;}
 else if(finish>6.5&&finish<7.5){float n=finishCloud(p*17.);float frost=pow(1.-smoothstep(.01,.09,abs(n-.51)),2.);metal=mix(low,hi,.35+.28*n)+hi*(frost*.3+reflect*.18);}
 else if(finish>7.5&&finish<8.5){vec2 flake=fract(vec2(path*48.,across*2.))-vec2(.5);float r=length(flake),theta=atan(flake.y,flake.x);float rays=exp(-pow(sin(theta*3.)*r*38.,2.))*(1.-smoothstep(.18,.35,r));metal=low*.7+hi*(rays*.8+reflect*.12+edge*.15);}
 else if(finish>8.5&&finish<9.5){float ribbon=max(1.-smoothstep(.12,.17,abs(fract(p.x*5.)-.5)),1.-smoothstep(.06,.12,abs(fract(p.y*7.)-.5)));metal=mix(low,hi,.65*ribbon)*(.65+.35*bevelWeight);}
 else if(finish>9.5&&finish<11.5){
  float n=rimFireFlow(p,localTime),hot=pow(smoothstep(.28,.8,n),1.4);
  float core=exp(-pow((across-.48)/.25,2.));
  vec3 body= rimFireTint(low,p,localTime,finish,.2),flame= rimFireTint(hi,p,localTime,finish,.11);
  metal=mix(body*.78,flame,.16+.7*hot)+mix(flame,vec3(1.),.42)*core*(.26+.22*hot)+flame*edge*.14;
 }
 else if(finish>11.5&&finish<12.5){
  vec3 chain=rimChain(uv,rimMetrics);
  float silver=clamp(chain.y*(.83+.17*reflect),0.,1.);
  float specular=pow(reflect,5.)*(.10+.32*chain.z);
  metal=mix(low*.36,hi,silver)+hi*specular;
 }
 else if(finish>12.5&&finish<13.5){
  float section=path*44.,glyph=rimGlyph(vec2(fract(section)-.5,(across-.5)*1.1),finishHash(vec2(floor(section),2.)));
  float pulse=.92+.08*sin(localTime*2.+path*17.);
  metal=low*(.62+.18*bevelWeight)+hi*(glyph*.44*pulse+edge*.14+reflect*.16);
 }
 else if(finish>13.5&&finish<14.5){
  metal=rimRefractionColor(low,hi,path,across,view,localTime,bevelWeight);
 }
 else if(finish>14.5&&finish<15.5){
  float core=exp(-pow((across-.5)/.43,4.));
  metal=mix(low*.8,hi,core)+vec3(1.,1.,.87)*core*.28+hi*reflect*.12;
 }
 if(finish>15.5&&finish<16.5){
  float rail=exp(-pow((across-.19)/.13,2.))+exp(-pow((across-.84)/.10,2.));
  float brass=step(.65,fract(path*8.))*smoothstep(.38,.48,across)*(1.-smoothstep(.64,.72,across));
  metal=low*(.48+.3*bevelWeight)+vec3(.38,.57,.65)*rail*(.48+.42*reflect)+vec3(.55,.47,.17)*brass*.45;
  // The letter panels occupy the front band, never the low-weight thickness walls.
  if(bevelWeight>.55){vec4 sign=rimNeonSign(p,localTime);metal=mix(metal,sign.rgb,sign.a);}
 }
 if(finish>20.5&&finish<21.5){
  vec3 graphic=rimPaxGraphic(low,hi,path,across);
  float patch=rimPaxPatch(path,localTime);
  float fleck=step(.64,finishHash(floor(p*1300.+vec2(localTime*19.,localTime*31.))));
  vec3 dust=rimPaxPaint(localTime);
  metal=mix(graphic,dust,patch*fleck*.64)*(.77+.23*bevelWeight)+hi*edge*.06;
 }
 if(finish>21.5&&finish<22.5){
  metal=rimBrainColor(low,hi,path,across,view,localTime);
 }
 if(finish>22.5&&finish<23.5){metal=rimHalloweenCandy(low,hi,p,across,rimMetrics.y,view);}
 if(finish>23.5&&finish<24.5){
  float fleck=finishNoise(vec2(path*43.,across*4.+localTime*.15));
  float face=smoothstep(.035,.255,across)*(1.-smoothstep(.95,1.,across));
  vec3 paint=mix(low,hi,smoothstep(.90,.98,fleck)*.10);
  metal=paint*(.07+face*(1.09+.12*smoothstep(.15,.45,across)))*(.96+.04*bevelWeight)+hi*reflect*.01*face;
 }
 if(animation.x>.5){float phase=localTime*.16;float delta=abs(fract(path-phase+.5)-.5);float sweep=exp(-delta*delta*700.);
  if(animation.x<1.5)sweep=.35+.35*sin(localTime*2.);
  vec3 glow=hi;
  if(animation.x>2.5){glow=finishSpectrum(path-phase);metal=mix(metal,glow*(.65+.3*bevelWeight),.65);}
  metal+=glow*sweep*(.3+.3*bevelWeight)+hi*edge*.12;
 }
 return clamp(metal,0.,1.);
}


vec4 rimAura(vec3 low,vec3 hi,vec2 uv,vec2 view,float finish_time,vec4 rimMetrics,float finish,vec2 animation){
 vec2 p=uv*vec2(1.,1.5),q=abs(p-vec2(.5,.75));
 float dist=min(min(.5-q.x,.75-q.y),(1.25-rimMetrics.y-q.x-q.y)*.70710678);
 float outside=max(0.,-dist),a=0.;vec3 rgb=hi;
 // A bounded inward halo belongs to the aperture, not the metal face.
 if(finish>1.5&&finish<2.5&&dist>rimMetrics.x){
  float inward=dist-rimMetrics.x;
  float glow=(exp(-inward/.006)*.36+exp(-inward/.018)*.15)*(1.-smoothstep(.032,.055,inward));
  return vec4(mix(low,hi,.55),glow);
 }
 float reach=finish>23.5&&finish<24.5?.14:.085;
 if(dist>0.||outside>reach)return vec4(0.);
 if(finish>15.5&&finish<16.5){vec4 sign=rimNeonSign(p,finish_time*animation.y);return sign;}
 if(finish>23.5&&finish<24.5)return rimHalloweenStickers(p,finish_time*animation.y,view);

 if(finish>1.5&&finish<2.5){a=exp(-outside/.007)*.5+exp(-outside/.022)*.18;rgb=mix(low,hi,.25);}
 else if(finish>2.5&&finish<3.5){
  vec2 grid=p*vec2(128.,144.),id=floor(grid),st=fract(grid)-.5;
  float seed=finishHash(id),flash=pow(.5+.5*sin(seed*43.+finish_time*animation.y*3.7+view.x*3.),5.);
  float core=exp(-dot(st,st)*60.);
  float cross=exp(-abs(st.x)*42.)*pow(max(0.,1.-abs(st.y)*2.),3.)+exp(-abs(st.y)*42.)*pow(max(0.,1.-abs(st.x)*2.),3.);
  a=step(.957,seed)*(core+cross*.5)*(.2+.8*flash)*(1.-smoothstep(.015,.082,outside));
  a+=exp(-outside/.004)*.28;
  rgb=mix(low,hi,.7+.3*flash)+vec3(.15)*flash;
 }
 else if(finish>6.5&&finish<7.5)a=exp(-outside/.012)*.18;
 else if(finish>22.5&&finish<23.5){
  float phase=fract((p.x+p.y)*6.85+.052);
  float orange=smoothstep(.006,.018,phase)*(1.-smoothstep(.638,.650,phase));
  float tight=exp(-outside/.0035)*.32,wide=exp(-outside/.019)*.22;
  rgb=(mix(low,hi,orange)*tight+vec3(.75,.20,.94)*wide)/max(.0001,tight+wide);
  a=tight+wide;
 }
 else if(finish>9.5&&finish<11.5){
  float localTime=finish_time*animation.y,n=rimFireFlow(p,localTime);
  float up=clamp((rimDistance(p+vec2(0.,.012),rimMetrics.y)-dist)/.012,-1.,1.);
  float reach=(.004+.033*pow(smoothstep(.25,.8,n),2.2))*(.55+.45*max(up,0.))*(1.-.7*max(-up,0.));
  float tongue=(1.-smoothstep(reach*.25,reach,outside))*(.5+.45*n);
  float root=exp(-outside/.0028);
  a=tongue+root*.17+exp(-outside/.017)*.07;
  rgb=mix(low,hi,pow(1.-clamp(outside/max(.001,reach),0.,1.),.7));
  rgb=rimFireTint(rgb,p,localTime,finish,.24)+hi*root*.12;
 }
 else if(finish>12.5&&finish<13.5){
  float path=rimPath(p,rimMetrics.y),section=path*9.;
  vec2 glyph=vec2((fract(section)-.5)*1.5,(outside-.008)*18.);
  float radius=length(glyph),theta=atan(glyph.y,glyph.x);
  float ring=1.-smoothstep(.012,.032,abs(radius-.52));
  float triangle=1.-smoothstep(.012,.04,abs(cos(theta*3.)*radius-.26));
  float symbols=rimGlyph(glyph*.85,finishHash(vec2(floor(section),2.)));
  float pulse=.92+.08*sin(finish_time*animation.y*2.+path*17.);
  a=(ring*.26+triangle*.14+symbols*.10)*pulse*(1.-smoothstep(.045,.075,outside));
  a+=exp(-outside/.005)*.15;rgb=hi;
 }
 else if(finish>13.5&&finish<14.5){
  float path=rimPath(p,rimMetrics.y);
  rgb=rimRefractionColor(low,hi,path,.5,view,finish_time*animation.y,.75);
  a=exp(-outside/.0035)*.26+exp(-outside/.008)*.035;
 }
 else if(finish>14.5&&finish<15.5){
  rgb=mix(low,hi,.68);a=exp(-outside/.004)*.48+exp(-outside/.014)*.20;
 }
 else if(finish>20.5&&finish<21.5){
  return rimPaxSpray(p,rimPath(p,rimMetrics.y),outside,finish_time*animation.y);
 }
 return vec4(clamp(rgb,0.,1.),clamp(a,0.,1.));
}


vec2 contourVirtualUV(float phase,float inset){
 float cut=max(0.,.125-(2.-sqrt(2.))*inset),a=1.-2.*inset-2.*cut,b=1.5-2.*inset-2.*cut,d=cut*sqrt(2.);
 float along=fract(phase)*(2.*a+2.*b+4.*d);vec2 p;
 if(along<a)p=vec2(inset+cut+along,inset);
 else if(along<a+d)p=vec2(1.-inset-cut,inset)+vec2(.70710678)*(along-a);
 else if(along<a+d+b)p=vec2(1.-inset,inset+cut+along-a-d);
 else if(along<a+2.*d+b)p=vec2(1.-inset,1.5-inset-cut)+vec2(-.70710678,.70710678)*(along-a-d-b);
 else if(along<2.*a+2.*d+b)p=vec2(1.-inset-cut-(along-a-2.*d-b),1.5-inset);
 else if(along<2.*a+3.*d+b)p=vec2(inset+cut,1.5-inset)-vec2(.70710678)*(along-2.*a-2.*d-b);
 else if(along<2.*a+3.*d+2.*b)p=vec2(inset,1.5-inset-cut-(along-2.*a-3.*d-b));
 else p=vec2(inset,inset+cut)+vec2(.70710678,-.70710678)*(along-2.*a-3.*d-2.*b);
 return p/vec2(1.,1.5);
}
vec4 contourRim(vec3 low,vec3 hi,vec2 uv,vec2 view,float finish_time,vec4 rimMetrics,float finish,vec2 animation,float shade){
 if(!contourHasMaterial())return vec4(rimColor(low,hi,uv,view,finish_time,rimMetrics,finish,animation,shade),rimCoverage(uv,rimMetrics,finish));
 vec2 p=vec2(uv.x-.5,.75-uv.y*1.5),gradient;vec2 distances=contourRead(p,gradient);
 float signedDistance=min(distances.x,-distances.y),d=max(0.,signedDistance/1024.),window,phase=contourArc(p,window);
 vec4 virtualMetrics=rimMetrics;virtualMetrics.y=.125;
 float band=min(d,rimMetrics.x*.5),inset=window>.5?rimMetrics.x-band:band;
 vec2 mapped=contourVirtualUV(phase,inset);
 if(shade>.6){
  shade=.75;
  if(rimMetrics.w>0.&&d<rimMetrics.w){
   vec3 normal=normalize(vec3(-gradient.x,gradient.y,1.)),light=normalize(vec3(-.4-view.x,.5+view.y,1.));
   shade=clamp(.25+.9*dot(normal,light),.25,1.);
  }
 }
 // Nearest-boundary phase is discontinuous on the medial axis. Keep loop
 // decoration in its edge band, and shade broad faces in registered UVs.
 float reflect=pow(.5+.5*cos((uv.x*.7+uv.y*.42-view.x*.4+view.y*.3)*6.283185),9.);
 vec3 face=finish<.5?low*.9:low*(.52+.35*shade)+hi*(.08+.25*reflect)*shade;
 float edgeWeight=1.-smoothstep(rimMetrics.x*.24,rimMetrics.x*.5,d);
 return vec4(mix(face,rimColor(low,hi,mapped,view,finish_time,virtualMetrics,finish,animation,shade),edgeWeight),mix(1.,rimCoverage(mapped,virtualMetrics,finish),edgeWeight));
}
vec4 contourGlow(vec3 low,vec3 hi,vec2 uv,vec2 view,float finish_time,vec4 rimMetrics,float finish,vec2 animation){
 if(!contourHasMaterial())return rimAura(low,hi,uv,view,finish_time,rimMetrics,finish,animation);
 vec2 p=vec2(uv.x-.5,.75-uv.y*1.5),distance=contourDistance(p);float d=min(distance.x,-distance.y);
 if(d>=0.)return vec4(0.);
 float window,phase=contourArc(p,window);vec4 virtualMetrics=rimMetrics;virtualMetrics.y=.125;
 return rimAura(low,hi,contourVirtualUV(phase,d/1024.),view,finish_time,virtualMetrics,finish,animation);
}

void fragment(){
	if((face_mode==0&&!front_visible)||(face_mode==1&&front_visible)){discard;}
	vec2 coord=source_rect.xy+registered_uv*source_rect.zw;if(back_side){coord.x=1.0-coord.x;}
	bool replace_coverage=background&&material_replace>.5&&component_material.x>0.0&&material_style!=5&&(component_material.w<1.5||component_material.w>2.5);
	bool source_coverage=frame_part<.5&&!(custom_effect&&surfaceTransparent)&&!replace_coverage;
	vec2 support_coord=clamp(coord,vec2(0.0),vec2(1.0));
	if(source_coverage&&(_cardscape_source_alpha_bounds.z!=0.0||_cardscape_source_alpha_bounds.w!=0.0)&&(any(lessThan(support_coord,_cardscape_source_alpha_bounds.xy))||any(greaterThan(support_coord,_cardscape_source_alpha_bounds.zw)))){discard;}
	vec4 c=texture(art,coord);
	if(frame_part<.5&&c.a<.015&&!(custom_effect&&surfaceTransparent)&&!replace_coverage){discard;}
	// Only clipped and foreground surfaces require the aperture distance read.
	vec2 aperture=vec2(0.);bool inside=true;
	if(background||clipped||foreground_pass>0.0){aperture=at_plane(card_point,.045-metrics.w);inside=in_outline(aperture,metrics.x);}
	if((background||clipped)&&!inside){discard;}
	if(back_side&&!in_outline(at_plane(card_point,.045-metrics.z+metrics.w),contour_counts.y>.5?0.0:metrics.x)){discard;}
	if(foreground_pass>0.0){if(foreground_pass<1.5&&!inside){discard;}if(foreground_pass>1.5){if(inside){discard;}vec2 e=vec2(.5,.75)-metrics.x;if((aperture.y>e.y&&pop_sides.x<.5)||(aperture.x>e.x&&pop_sides.y<.5)||(aperture.y< -e.y&&pop_sides.z<.5)||(aperture.x< -e.x&&pop_sides.w<.5)){discard;}}}
// Five-tap frost diffusion. Coverage remains the source alpha.
if(material_style==26&&component_material.x>0.&&((background&&(component_material.w<1.5||component_material.w>2.5))||(back_side&&(component_material.w<.5||(component_material.w>1.5&&component_material.w<2.5)||component_material.w>4.5))||(frame_part<.5&&!back_side&&component_material.w>2.5))){
 float frost=finishFrost(UV*vec2(1.,1.5));vec2 radius=(.006+.014*frost)*source_rect.zw;
 vec2 lo=source_rect.xy,hi=source_rect.xy+source_rect.zw;if(back_side){float left=1.-hi.x;hi.x=1.-lo.x;lo.x=left;}
 vec4 a=texture(art,clamp(coord+vec2(radius.x,0.),lo,hi)),b=texture(art,clamp(coord-vec2(radius.x,0.),lo,hi));
 vec4 d=texture(art,clamp(coord+vec2(0.,radius.y),lo,hi)),e=texture(art,clamp(coord-vec2(0.,radius.y),lo,hi));
 vec3 diffuse=(c.rgb*c.a+a.rgb*a.a+b.rgb*b.a+d.rgb*d.a+e.rgb*e.a)/max(.001,c.a+a.a+b.a+d.a+e.a);
 c.rgb=mix(c.rgb,diffuse,component_material.x*(.5+.35*frost));
}

	vec2 view_angle=vec2(atan(-card_eye.x,card_eye.z),atan(card_eye.y,length(card_eye.xz)));
	if(frame_part>1.5){c=contour_texture>.5?contourGlow(frame_color,frame_accent,UV,view_angle,clock,metrics,frame_finish,frame_animation):rimAura(frame_color,frame_accent,UV,view_angle,clock,metrics,frame_finish,frame_animation);if(c.a<.001)discard;}else{
	if(frame_part>0.0)c=contour_texture>.5?contourRim(frame_color,frame_accent,UV,view_angle,clock,metrics,frame_finish,frame_animation,COLOR.b):vec4(rimColor(frame_color,frame_accent,UV,view_angle,clock,metrics,frame_finish,frame_animation,COLOR.b),rimCoverage(UV,metrics,float(frame_finish)));
	if(contour_counts.y>.5&&frame_part>0.0&&frame_part<1.5&&!contour_wall){vec2 shape=contour_at(vec2(UV.x-.5,.75-UV.y*1.5));c.a*=shape.x*(1.0-shape.y);}
	if(contour_counts.y>.5&&contour_wall)c.a=1.0;
	if(foreground_pass>1.5){c.a*=1.0-smoothstep(.02,.5,texture(inset_tex,UV).r/max(c.a,.001));}
	if(replace_coverage){c.a=1.0;}if(c.a<.015&&!(custom_effect&&surfaceTransparent)){discard;}
	c.rgb=pow(clamp((c.rgb-.5)*adjustment.y+.5+adjustment.x,0.0,1.0),vec3(1.0/adjustment.w));float lum=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=clamp(mix(vec3(lum),c.rgb,adjustment.z),0.0,1.0);
	bool material_applies=component_material.x>0.0&&(component_material.w>4.5||(component_material.w>3.5&&frame_part<.5&&!back_side)||(component_material.w>2.5&&component_material.w<3.5&&!back_side)||(component_material.w<.5&&(background||back_side))||(component_material.w>.5&&component_material.w<1.5&&background)||(component_material.w>1.5&&component_material.w<2.5&&back_side));if(material_applies&&material_style!=5){bool replace_art=material_replace>.5&&background;vec2 finish_uv=replace_art?vec2(card_point.x+.5,.5-card_point.y/1.5):UV;vec3 result=finishColor(c.rgb,finish_uv,clock*component_material.y,view_angle,float(material_style),component_material.z,material_color,material_accent,replace_art);c.rgb=finishComposite(c.rgb,result,material_color,component_material.x,replace_art);}
	if(foreground_pass>0.0){float e=texture(emission_tex,UV).r,phase=texture(phase_tex,UV).r;float stream=pow(.5+.5*sin(phase*30.0-clock*3.1*flow_speed+UV.y*11.0),3.0);c.rgb+=vec3(.45,.77,1.0)*e*stream*flow_gain;c.rgb+=armor_color*texture(foil_tex,UV).r*sweep(UV.x*.82+UV.y*.18,armor_sweep);}
	c.rgb+=title_color*sweep((UV.x-title_bounds.x)/max(.001,title_bounds.y-title_bounds.x),title_sweep)*c.a;
	if(slot_effect.x>.5){float wave=.5+.5*sin(clock*slot_effect.z*3.0+(slot_effect.x>1.5?UV.y*20.0:0.0));c.rgb+=vec3(.2,.5,.8)*wave*slot_effect.y;}
	if(custom_effect){vec4 mask=vec4(texture(motion_tex,UV).r,texture(inset_tex,UV).r,texture(emission_tex,UV).r,texture(phase_tex,UV).r);float strength=clamp(custom_strength*(custom_masked?texture(custom_mask_tex,UV).r:1.0),0.0,1.0);c=mix(c,surfaceEffect(c,UV,clock,mask),strength);}
	if(material_applies&&material_style==5){float gray=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(c.rgb,vec3(gray),component_material.x);}
	}
	ALBEDO=c.rgb;ALPHA=c.a*opacity*root_opacity;
}
