/** Adapt existing finishes to a canonical closed path. Only procedural paint is
 * remapped: image layers and attachments keep their original registered UVs. */
const source = `
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
`;
export default source;
