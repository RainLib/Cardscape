shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, depth_draw_never, shadows_disabled;
uniform vec4 tint:source_color=vec4(.57,.87,1.,1.);
uniform float opacity=1.;
varying float section_alpha;
void vertex(){section_alpha=UV2.x;}
void fragment(){
 float ends=1.-smoothstep(.85,1.,abs(UV.x));
 float core=1.-smoothstep(.16,.22,abs(UV.y));
 float halo=exp(-UV.y*UV.y*10.)*.42;
 ALBEDO=mix(tint.rgb,vec3(1.),core*.85);
 float alpha=min(1.,core+halo)*ends;
 if(alpha<.01)discard;
 ALPHA=alpha*section_alpha*opacity;
}
