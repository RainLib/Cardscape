shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;
uniform sampler2D attachment_tex : filter_linear, repeat_disable;
uniform bool attached = false;
uniform mat4 attachment_transform;
uniform sampler2D art : source_color, filter_linear, repeat_disable;
uniform sampler2D motion_tex : filter_linear, repeat_disable;
uniform sampler2D inset_tex : filter_linear, repeat_disable;
uniform sampler2D emission_tex : filter_linear, repeat_disable;
uniform sampler2D phase_tex : filter_linear, repeat_disable;
uniform sampler2D foil_tex : filter_linear, repeat_disable;
uniform sampler2D custom_mask_tex : filter_linear, repeat_disable;
uniform vec2 background_extent = vec2(1.18);
uniform vec4 source_rect = vec4(0.0,0.0,1.0,1.0);
uniform vec4 adjustment = vec4(0.0,1.0,1.0,1.0);
uniform mat4 layer_transform;
uniform vec3 card_eye = vec3(0.0,0.0,2.7);
uniform vec4 metrics = vec4(.0234375,.046875,.025390625,.0048828125);
uniform vec4 pop_sides = vec4(1.0,1.0,0.0,1.0);
uniform vec3 frame_color : source_color = vec3(.53,.45,.31);
uniform vec3 frame_accent : source_color = vec3(.83,.73,.53);
uniform float frame_finish = 1.0;
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
varying vec3 card_point;
varying vec2 registered_uv;
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
	if(foreground_pass>0.0){float weight=UV2.x;float wave=sin(clock*1.3*wind_speed+UV.x*11.0+UV.y*8.0);VERTEX.z+=wave*.016*weight*motion_gain*depth;VERTEX.x+=wave*.005*weight*motion_gain*depth;VERTEX=mix(VERTEX,deformCard(VERTEX,UV,clock,geometry_bend),weight*(1.0-UV2.y));}
	card_point=(layer_transform*vec4(VERTEX,1.0)).xyz;
	if(attached){float weight=texture(attachment_tex,UV).r;card_point=mix((attachment_transform*vec4(VERTEX,1.0)).xyz,card_point,weight);VERTEX=(inverse(layer_transform)*vec4(card_point,1.0)).xyz;}
}
bool in_outline(vec2 p,float inset){vec2 a=abs(p);float cut=max(0.0,metrics.y-(2.0-sqrt(2.0))*inset);return all(lessThanEqual(a,vec2(.5,.75)-inset))&&a.x+a.y<=1.25-2.0*inset-cut+.000001;}
vec2 at_plane(vec3 p,float z){float d=p.z-card_eye.z;return card_eye.xy+(p.xy-card_eye.xy)*(z-card_eye.z)/(abs(d)<.00001?-.00001:d);}
float sweep(float x,vec4 s){float cycle=mod(clock,max(s.z,.3));float head=-.25+1.6*clamp(cycle/max(s.y,.3),0.0,1.0);return exp2(-3.0*pow((x-head)/max(s.w,.02),2.0))*step(cycle,s.y)*s.x;}
void fragment(){
	if((face_mode==0&&!front_visible)||(face_mode==1&&front_visible)){discard;}
	vec2 aperture=at_plane(card_point,.045-metrics.w);bool inside=in_outline(aperture,metrics.x);
	if((background||clipped)&&!inside){discard;}
	if(back_side&&!in_outline(at_plane(card_point,.045-metrics.z+metrics.w),metrics.x)){discard;}
	if(foreground_pass>0.0){if(foreground_pass<1.5&&!inside){discard;}if(foreground_pass>1.5){if(inside){discard;}vec2 e=vec2(.5,.75)-metrics.x;if((aperture.y>e.y&&pop_sides.x<.5)||(aperture.x>e.x&&pop_sides.y<.5)||(aperture.y< -e.y&&pop_sides.z<.5)||(aperture.x< -e.x&&pop_sides.w<.5)){discard;}}}
	vec2 coord=source_rect.xy+registered_uv*source_rect.zw;if(back_side){coord.x=1.0-coord.x;}
	vec4 c=texture(art,coord);
	if(frame_part>0.0){float shade=frame_finish<.5?.85:(.45+.55*COLOR.b);float shine=pow(.5+.5*sin(UV.x*8.0+UV.y*5.0+card_eye.x),6.0);c=vec4(frame_color*shade+frame_accent*shine*.45*COLOR.b,1.0);}
	if(foreground_pass>1.5){c.a*=1.0-smoothstep(.02,.5,texture(inset_tex,UV).r/max(c.a,.001));}
	if(c.a<.015){discard;}
	c.rgb=pow(clamp((c.rgb-.5)*adjustment.y+.5+adjustment.x,0.0,1.0),vec3(1.0/adjustment.w));float lum=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=clamp(mix(vec3(lum),c.rgb,adjustment.z),0.0,1.0);
	if(component_material.x>0.0&&((background&&component_material.w!=2.0)||(back_side&&component_material.w!=1.0))){float bands=.5+.5*sin((UV.x+UV.y*(holographic?2.0:.7))*component_material.z*6.283+card_eye.x*3.0+clock*component_material.y);vec3 hue=mix(material_color,material_accent,bands);float shimmer=holographic?pow(bands,5.0):.35+.65*bands;c.rgb=mix(c.rgb,clamp(c.rgb+hue*shimmer,0.0,1.0),component_material.x);}
	if(foreground_pass>0.0){float e=texture(emission_tex,UV).r,phase=texture(phase_tex,UV).r;float stream=pow(.5+.5*sin(phase*30.0-clock*3.1*flow_speed+UV.y*11.0),3.0);c.rgb+=vec3(.45,.77,1.0)*e*stream*flow_gain;c.rgb+=armor_color*texture(foil_tex,UV).r*sweep(UV.x*.82+UV.y*.18,armor_sweep);}
	c.rgb+=title_color*sweep((UV.x-title_bounds.x)/max(.001,title_bounds.y-title_bounds.x),title_sweep)*c.a;
	if(slot_effect.x>.5){float wave=.5+.5*sin(clock*slot_effect.z*3.0+(slot_effect.x>1.5?UV.y*20.0:0.0));c.rgb+=vec3(.2,.5,.8)*wave*slot_effect.y;}
	if(custom_effect){vec4 mask=vec4(texture(motion_tex,UV).r,texture(inset_tex,UV).r,texture(emission_tex,UV).r,texture(phase_tex,UV).r);float strength=clamp(custom_strength*(custom_masked?texture(custom_mask_tex,UV).r:1.0),0.0,1.0);c=mix(c,surfaceEffect(c,UV,clock,mask),strength);}
	ALBEDO=c.rgb;ALPHA=c.a*opacity*root_opacity;
}
