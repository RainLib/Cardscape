use super::*;

// Local edge attraction follows the artist's trace. It is deliberately not an
// object-recognition model: ambiguous edges still require manual refinement.
pub fn trace(args: &Value) -> Result<Value, String> {
    let img=decode(args,"image")?.to_rgba8();let (w,h)=img.dimensions();
    let points:Vec<[f32;2]>=serde_json::from_value(args["points"].clone()).map_err(|e|e.to_string())?;
    if points.len()<3||points.len()>4096||points.iter().flatten().any(|v|!v.is_finite()) {return Err("selection needs 3–4096 finite points".into());}
    if points.iter().any(|p|p[0]<0.0||p[1]<0.0||p[0]>w as f32||p[1]>h as f32){return Err("selection points outside image".into());}
    let length:f32=(0..points.len()).map(|i|{let a=points[i];let b=points[(i+1)%points.len()];(a[0]-b[0]).hypot(a[1]-b[1])}).sum();
    if length>32768.0{return Err("selection trace exceeds processing budget".into());}
    let radius=args["width"].as_u64().unwrap_or(12).clamp(1,40) as i32;
    let magnetic=args["magnetic"].as_bool().unwrap_or(false);
    let mut path=Vec::<[f32;2]>::new();
    for i in 0..points.len(){
        let a=points[i];let b=points[(i+1)%points.len()];let d=[b[0]-a[0],b[1]-a[1]];let length=d[0].hypot(d[1]);
        let steps=(length/4.0).ceil().max(1.0) as usize;
        for s in 0..steps {
            let t=s as f32/steps as f32;let base=[a[0]+d[0]*t,a[1]+d[1]*t];let mut best=base;let mut score=0.0;
            if magnetic&&length>0.01 {
                for offset in -radius..=radius {
                    let x=(base[0]-d[1]/length*offset as f32).round() as i32;
                    let y=(base[1]+d[0]/length*offset as f32).round() as i32;
                    if x<1||y<1||x>=w as i32-1||y>=h as i32-1 {continue;}
                    let mut edge=0.0f32;
                    for c in 0..4 {
                        let dx=img.get_pixel((x+1) as u32,y as u32)[c] as f32-img.get_pixel((x-1) as u32,y as u32)[c] as f32;
                        let dy=img.get_pixel(x as u32,(y+1) as u32)[c] as f32-img.get_pixel(x as u32,(y-1) as u32)[c] as f32;
                        edge=edge.max(dx.hypot(dy));
                    }
                    let candidate=edge*(1.0-(offset.abs() as f32/(radius+1) as f32)*0.45)-offset.abs() as f32*2.0;
                    if candidate>score {score=candidate;best=[x as f32,y as f32];}
                }
            }
            path.push(best);
        }
    }
    let mut raw=vec![0u8;(w*h) as usize];
    // Two subpixel scanlines and fractional horizontal coverage provide AA.
    for y in 0..h {for sub in [0.25f32,0.75]{
        let fy=y as f32+sub;let mut cuts=Vec::new();
        for i in 0..path.len(){let a=path[i];let b=path[(i+1)%path.len()];if (a[1]>fy)!=(b[1]>fy){cuts.push(a[0]+(fy-a[1])*(b[0]-a[0])/(b[1]-a[1]));}}
        cuts.sort_by(|a,b|a.total_cmp(b));
        for pair in cuts.chunks_exact(2){let left=pair[0].clamp(0.0,w as f32);let right=pair[1].clamp(0.0,w as f32);
            for x in left.floor() as u32..(right.ceil() as u32).min(w){let coverage=((x+1) as f32).min(right)-(x as f32).max(left);let j=(y*w+x) as usize;raw[j]=raw[j].saturating_add((coverage.max(0.0)*127.5).round() as u8);}
        }
    }}
    let radius=args["feather"].as_u64().unwrap_or(0).min(32) as usize;
    if radius>0 {raw=feather(&raw,w as usize,h as usize,radius);}
    Ok(json!({"image":encode(&DynamicImage::ImageLuma8(GrayImage::from_raw(w,h,raw).ok_or("invalid selection")?))?,"points":path,"algorithm":if magnetic{"local-gradient-edge-attraction"}else{"polygon-aa"}}))
}
pub fn combine(args:&Value)->Result<Value,String>{
    let mut image=decode(args,"image")?.to_luma8();let sel=decode(args,"selection")?.to_luma8();
    if image.dimensions()!=sel.dimensions(){return Err("selection dimensions must match mask".into());}
    let mode=args["mode"].as_str().unwrap_or("replace");if !["replace","add","subtract"].contains(&mode){return Err("invalid selection combine mode".into());}
    let gradient=args["gradient"].as_str().unwrap_or("solid");if !["solid","down","up","right","left","radial","line"].contains(&gradient){return Err("invalid weight gradient".into());}
    let value=args["value"].as_f64().unwrap_or(1.0);if !value.is_finite()||!(0.0..=1.0).contains(&value){return Err("invalid mask value".into());}
    let start_value=args["startValue"].as_f64().unwrap_or(0.0);if !start_value.is_finite()||!(0.0..=1.0).contains(&start_value){return Err("invalid gradient start value".into());}
    let point=|key:&str|->Result<[f32;2],String>{let p: [f32;2]=serde_json::from_value(args[key].clone()).map_err(|_|format!("invalid gradient {key}"))?;if p.iter().any(|v|!v.is_finite())||p[0]<0.0||p[1]<0.0||p[0]>image.width() as f32-1.0||p[1]>image.height() as f32-1.0{return Err(format!("gradient {key} outside image"));}Ok(p)};
    let line=if gradient=="line"{let a=point("start")?;let b=point("end")?;if (b[0]-a[0]).hypot(b[1]-a[1])<1.0{return Err("gradient anchors too close".into());}Some((a,b))}else{None};
    let w=image.width() as usize;let mut top=image.height() as usize;let mut bottom=0;let mut left=w;let mut right=0;
    let mut gates=Vec::new();
    for key in ["coverage","guard"]{if args[key].is_string(){let gate=decode(args,key)?.to_luma8();if gate.dimensions()!=image.dimensions(){return Err(format!("{key} dimensions must match mask"));}gates.push((key,gate));}}
    for (i,v) in sel.as_raw().iter().enumerate(){if *v>0{top=top.min(i/w);bottom=bottom.max(i/w);left=left.min(i%w);right=right.max(i%w);}}
    image.as_mut().par_iter_mut().enumerate().for_each(|(i,p)|{
        let t=((i/w).saturating_sub(top) as f32/(bottom.saturating_sub(top).max(1)) as f32).clamp(0.0,1.0);
        let x=(i%w) as f32;let y=(i/w) as f32;let h=((i%w).saturating_sub(left) as f32/right.saturating_sub(left).max(1) as f32).clamp(0.0,1.0);
        let gain=match gradient{"down"=>t,"up"=>1.0-t,"right"=>h,"left"=>1.0-h,"radial"=>{let cx=(left+right) as f32/2.0;let cy=(top+bottom) as f32/2.0;((x-cx)/(right.saturating_sub(left).max(1) as f32/2.0)).hypot((y-cy)/(bottom.saturating_sub(top).max(1) as f32/2.0)).min(1.0)},"line"=>{let (a,b)=line.unwrap();let dx=b[0]-a[0];let dy=b[1]-a[1];((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)},_=>1.0}.clamp(0.0,1.0);let selected=sel.as_raw()[i] as f32/255.0;let v=(if gradient=="solid"{value as f32}else{start_value as f32+(value-start_value) as f32*gain})*255.0;
        let limit=gates.iter().fold(255.0f32,|limit,(key,gate)|{let g=gate.as_raw()[i];limit*(if *key=="guard"{(255-g) as f32}else{g as f32})/255.0});
        let incoming=v*selected*limit/255.0;
        // Existing values were gated when created. Preserve them when editing a
        // different region; clamp only when coverage or rigid protection shrinks.
        *p=match mode{"add"=>(*p as f32).max(incoming),"subtract"=>*p as f32*(1.0-selected),_=>incoming}.min(limit).round() as u8;
    });
    Ok(json!({"image":encode(&DynamicImage::ImageLuma8(image))?}))
}

#[cfg(test)]mod tests{
 use super::*;
 #[test]fn configurable_gradients_match_endpoints_and_gray_weights(){let black=encode(&DynamicImage::ImageLuma8(GrayImage::new(9,9))).unwrap();let white=encode(&DynamicImage::ImageLuma8(GrayImage::from_pixel(9,9,image::Luma([255])))).unwrap();for (gradient,start,end) in [("right",(0,4),(8,4)),("left",(8,4),(0,4)),("radial",(4,4),(8,4))]{let m=combine(&json!({"image":black,"selection":white,"gradient":gradient,"startValue":0.25,"value":0.75})).unwrap();let m=decode(&m,"image").unwrap().to_luma8();assert_eq!(m.get_pixel(start.0,start.1)[0],64);assert_eq!(m.get_pixel(end.0,end.1)[0],191);}let m=combine(&json!({"image":black,"selection":white,"gradient":"line","start":[0,0],"end":[8,8],"startValue":1,"value":0})).unwrap();let m=decode(&m,"image").unwrap().to_luma8();assert_eq!(m.get_pixel(0,0)[0],255);assert_eq!(m.get_pixel(4,4)[0],128);assert_eq!(m.get_pixel(8,8)[0],0);assert!(combine(&json!({"image":black,"selection":white,"gradient":"line","start":[0,0],"end":[0,0]})).is_err());}
 #[test]fn polygon_excludes_outside(){let image=DynamicImage::ImageLuma8(GrayImage::from_pixel(20,20,image::Luma([100])));let s=trace(&json!({"image":encode(&image).unwrap(),"points":[[4,4],[16,4],[16,16],[4,16]]})).unwrap();let mask=decode(&s,"image").unwrap().to_luma8();assert_eq!(mask.get_pixel(0,0)[0],0);assert_eq!(mask.get_pixel(10,10)[0],255);}
 #[test]fn reject_non_registered_selection(){let png=encode(&DynamicImage::ImageLuma8(GrayImage::new(10,10))).unwrap();assert!(trace(&json!({"image":png,"points":[[0,0],[20,0],[0,9]]})).is_err());}
 #[test]fn gradient_pins_top_and_preserves_guard(){let black=encode(&DynamicImage::ImageLuma8(GrayImage::new(8,8))).unwrap();let white=encode(&DynamicImage::ImageLuma8(GrayImage::from_pixel(8,8,image::Luma([255])))).unwrap();let s=combine(&json!({"image":black,"selection":white,"gradient":"down"})).unwrap();let m=decode(&s,"image").unwrap().to_luma8();assert_eq!(m.get_pixel(4,0)[0],0);assert_eq!(m.get_pixel(4,7)[0],255);let guarded=combine(&json!({"image":black,"selection":white,"guard":white})).unwrap();assert_eq!(decode(&guarded,"image").unwrap().to_luma8().get_pixel(4,7)[0],0);}
 #[test]fn magnetic_trace_attracts_to_alpha_edge(){let mut im=image::RgbaImage::new(40,40);for y in 8..32{for x in 10..30{im.put_pixel(x,y,image::Rgba([180,30,30,255]));}}let png=encode(&DynamicImage::ImageRgba8(im)).unwrap();let s=trace(&json!({"image":png,"points":[[7,6],[33,6],[33,34],[7,34]],"magnetic":true,"width":6})).unwrap();let p:Vec<[f32;2]>=serde_json::from_value(s["points"].clone()).unwrap();assert!(p.iter().any(|p|p[0]>=9.0&&p[0]<=10.0&&p[1]>12.0&&p[1]<26.0));}
}
