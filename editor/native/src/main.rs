use base64::{Engine, engine::general_purpose::STANDARD};
use image::{DynamicImage, GrayImage, ImageFormat, ImageReader, imageops::FilterType};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::{self, BufRead, Cursor, Read, Write};
use std::time::Instant;
mod selection;
mod processing;

const MAX_PIXELS: u64 = 16_777_216;
const MAX_LINE: usize = 96 * 1024 * 1024;

#[derive(Deserialize)]
struct Request { id: Value, op: String, #[serde(default)] args: Value }
#[derive(Serialize)]
struct Response { id: Value, ok: bool, result: Value, error: Option<String>, elapsed_ms: f64 }
fn dim(v: &Value, k: &str) -> Result<u32, String> {
    let n = v[k].as_u64().ok_or(format!("missing dimension {k}"))?;
    if n == 0 || n > 8192 { return Err(format!("invalid dimension {k}")); }
    Ok(n as u32)
}
fn valid_size(w: u32, h: u32) -> Result<(), String> {
    if u64::from(w) * u64::from(h) > MAX_PIXELS { Err("image exceeds 16 megapixel budget".into()) } else { Ok(()) }
}
fn decode(v: &Value, key: &str) -> Result<DynamicImage, String> {
    let s = v[key].as_str().ok_or(format!("missing image {key}"))?;
    let raw = s.split_once(',').map_or(s, |(_, b)| b);
    let bytes = STANDARD.decode(raw).map_err(|e| e.to_string())?;
    let mut reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format().map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192); limits.max_image_height = Some(8192); limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    let img = reader.decode().map_err(|e| e.to_string())?;
    valid_size(img.width(), img.height())?;
    Ok(img)
}
fn encode(img: &DynamicImage) -> Result<String, String> {
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(out.into_inner())))
}

// Sliding sums keep each pass O(pixels), independent of the feather radius.
fn horizontal(src: &[f32], w: usize, h: usize, radius: usize) -> Vec<f32> {
    let mut dst = vec![0.0; w * h];
    dst.par_chunks_mut(w).zip(src.par_chunks(w)).for_each(|(out, row)| {
        let mut prefix = vec![0.0; w + 1];
        for (x, v) in row.iter().enumerate() { prefix[x + 1] = prefix[x] + v; }
        for (x, v) in out.iter_mut().enumerate() {
            let left = x.saturating_sub(radius); let right = (x + radius + 1).min(w);
            *v = (prefix[right] - prefix[left]) / (right - left) as f32;
        }
    });
    dst
}
fn transpose(src: &[f32], w: usize, h: usize) -> Vec<f32> {
    let mut dst = vec![0.0; w * h];
    dst.par_chunks_mut(h).enumerate().for_each(|(x, col)| {
        for (y, v) in col.iter_mut().enumerate() { *v = src[y * w + x]; }
    });
    dst
}
fn feather(src: &[u8], w: usize, h: usize, radius: usize) -> Vec<u8> {
    let mut values: Vec<f32> = src.iter().map(|v| f32::from(*v)).collect();
    for _ in 0..3 {
        values = horizontal(&values, w, h, radius);
        values = transpose(&values, w, h);
        values = horizontal(&values, h, w, radius);
        values = transpose(&values, h, w);
    }
    values.par_iter().map(|v| v.round().clamp(0.0, 255.0) as u8).collect()
}
fn bake(args: &Value) -> Result<Value, String> {
    let (w, h) = (dim(args, "width")?, dim(args, "height")?); valid_size(w, h)?;
    let uv: Vec<f32> = serde_json::from_value(args["uv"].clone()).map_err(|e| e.to_string())?;
    let weights: Vec<f32> = serde_json::from_value(args["weights"].clone()).map_err(|e| e.to_string())?;
    let indices: Vec<usize> = serde_json::from_value(args["indices"].clone()).map_err(|e| e.to_string())?;
    if uv.len() != weights.len() * 2 || indices.len() % 3 != 0 || indices.iter().any(|i| *i >= weights.len()) || !uv.iter().chain(weights.iter()).all(|x| x.is_finite()) {
        return Err("invalid mesh attributes".into());
    }
    let mut pixels = vec![0u8; (w * h) as usize];
    for t in indices.chunks(3) {
        let pts: Vec<(f32, f32)> = t.iter().map(|i| (uv[i * 2] * (w - 1) as f32, uv[i * 2 + 1] * (h - 1) as f32)).collect();
        let (a,b,c) = (pts[0], pts[1], pts[2]);
        let den = (b.1-c.1)*(a.0-c.0)+(c.0-b.0)*(a.1-c.1);
        if den.abs() < 0.00001 { continue; }
        let minx = a.0.min(b.0).min(c.0).floor().max(0.0) as u32;
        let maxx = a.0.max(b.0).max(c.0).ceil().clamp(0.0, (w-1) as f32) as u32;
        let miny = a.1.min(b.1).min(c.1).floor().max(0.0) as u32;
        let maxy = a.1.max(b.1).max(c.1).ceil().clamp(0.0, (h-1) as f32) as u32;
        for y in miny..=maxy { for x in minx..=maxx {
            let l1 = ((b.1-c.1)*(x as f32-c.0)+(c.0-b.0)*(y as f32-c.1))/den;
            let l2 = ((c.1-a.1)*(x as f32-c.0)+(a.0-c.0)*(y as f32-c.1))/den;
            let l3 = 1.0-l1-l2;
            if l1 >= -0.002 && l2 >= -0.002 && l3 >= -0.002 {
                pixels[(y*w+x) as usize] = ((weights[t[0]]*l1+weights[t[1]]*l2+weights[t[2]]*l3).clamp(0.0,1.0)*255.0).round() as u8;
            }
        }}
    }
    let img = GrayImage::from_raw(w,h,pixels).ok_or("invalid mask")?;
    Ok(json!({"image":encode(&DynamicImage::ImageLuma8(img))?,"width":w,"height":h}))
}
fn run(op: &str, args: &Value) -> Result<Value, String> {
    match op {
        "ping" => Ok(json!({"engine":"rust","version":env!("CARGO_PKG_VERSION"),"operations":["selection","mask_combine","feather","resize","mask_stats","bake_mask","clean_alpha","underpaint","repair_split","alpha","image_channel","mesh","agent_image","refine_selection","adjust_image","wand_selection","title_raster"],"parallel_threads":rayon::current_num_threads()})),
        "agent_image" => {
            let source=decode(args,"source")?.to_rgba8();let mut candidate=decode(args,"candidate")?.to_rgba8();
            let mode=args["mode"].as_str().ok_or("missing image operation")?;
            let (w,h)=source.dimensions();
            match mode {
                "edit"|"generate" => {if candidate.dimensions()!=(w,h){return Err("result dimensions must match source".into());}},
                "inpaint" => {
                    let mask=decode(args,"mask")?.to_luma8();
                    if candidate.dimensions()!=(w,h)||mask.dimensions()!=(w,h){return Err("inpaint dimensions must match source and selection".into());}
                    candidate.as_mut().par_chunks_mut(4).zip(source.as_raw().par_chunks(4)).zip(mask.as_raw().par_iter()).for_each(|((out,original),weight)|{
                        for c in 0..4{out[c]=((out[c] as u32* *weight as u32+original[c] as u32*(255-*weight as u32)+127)/255) as u8;}
                    });
                },
                "outpaint" => {
                    let padding:Vec<u32>=serde_json::from_value(args["padding"].clone()).map_err(|e|e.to_string())?;
                    if padding.len()!=4||padding.iter().any(|n|*n>1024){return Err("invalid outpaint padding".into());}
                    let (l,t,r,b)=(padding[0],padding[1],padding[2],padding[3]);
                    if candidate.dimensions()!=(w+l+r,h+t+b){return Err("outpaint result dimensions must match requested extension".into());}
                    // Preserve the entire existing artwork byte-for-byte; only the new margins come from the agent.
                    image::imageops::replace(&mut candidate,&source,l as i64,t as i64);
                },
                _ => return Err("unsupported image operation".into())
            }
            let (width,height)=candidate.dimensions();
            Ok(json!({"image":encode(&DynamicImage::ImageRgba8(candidate))?,"width":width,"height":height}))
        },
        "refine_selection" => processing::refine(args),
        "wand_selection" => processing::wand(args),
        "adjust_image" => processing::adjust(args),
        "title_raster" => processing::title_raster(args),
        "selection" => selection::trace(args),
        "mask_combine" => selection::combine(args),
        "bake_mask" => bake(args),
        "feather" => {
            let gray=decode(args,"image")?.to_luma8();
            let radius=args["radius"].as_u64().unwrap_or(3).min(128) as usize;
            let (w,h)=gray.dimensions(); let mut data=feather(gray.as_raw(),w as usize,h as usize,radius);
            if args["guard"].is_string() {
                let guard=decode(args,"guard")?.to_luma8();
                if guard.dimensions()!=gray.dimensions() { return Err("guard dimensions must match mask".into()); }
                data.par_iter_mut().zip(guard.as_raw().par_iter()).for_each(|(v,g)| *v=((*v as u32*(255-*g as u32))/255) as u8);
            }
            Ok(json!({"image":encode(&DynamicImage::ImageLuma8(GrayImage::from_raw(w,h,data).ok_or("invalid mask")?))?,"width":w,"height":h}))
        },
        "resize" => {
            let img=decode(args,"image")?; let (w,h)=(dim(args,"width")?,dim(args,"height")?);valid_size(w,h)?;
            let result=image::imageops::resize(&img,w,h,FilterType::Lanczos3);
            Ok(json!({"image":encode(&DynamicImage::ImageRgba8(result))?,"width":w,"height":h}))
        },
        "image_channel" => {
            let img=decode(args,"image")?.to_rgba8();let channel=args["channel"].as_str().unwrap_or("alpha");
            if !["alpha","black","white"].contains(&channel){return Err("unsupported image channel".into());}
            let raw:Vec<u8>=img.as_raw().par_chunks(4).map(|p|match channel{"black"=>0,"white"=>255,_=>p[3]}).collect();
            Ok(json!({"image":encode(&DynamicImage::ImageLuma8(GrayImage::from_raw(img.width(),img.height(),raw).ok_or("invalid channel")?))?,"width":img.width(),"height":img.height()}))
        },
        "underpaint" => processing::underpaint(args),
        "repair_split" => processing::repair_split(args),
        "clean_alpha" => {
            let mut image=decode(args,"image")?.to_rgba8();
            let threshold=args["threshold"].as_u64().ok_or("invalid alpha threshold")?;
            if threshold>16{return Err("alpha threshold must be 0..16".into());}
            let cleared:usize=image.as_mut().par_chunks_mut(4).map(|p|{if p[3]>0&&u64::from(p[3])<=threshold{p[3]=0;1}else{0}}).sum();
            Ok(json!({"image":encode(&DynamicImage::ImageRgba8(image))?,"cleared_pixels":cleared,"threshold":threshold}))
        },
        "alpha" => {
            let mut img=decode(args,"image")?.to_rgba8();let mask=decode(args,"mask")?.to_luma8();
            let backing=if args["decontaminate"].as_bool().unwrap_or(false){Some(img.clone())}else{None};
            if img.dimensions()!=mask.dimensions() {return Err("mask dimensions must match image".into());}
            let mode=args["mode"].as_str().unwrap_or("multiply");
            if !["multiply","coverage"].contains(&mode){return Err("invalid alpha mode".into());}
            // Coverage already records final visibility, including source alpha.
            // Reapplying it to the preserved master must not attenuate edges twice.
            let binary=args["binary_mask"].as_bool().unwrap_or(false);
            img.as_mut().par_chunks_mut(4).zip(mask.as_raw().par_iter()).for_each(|(p,m)|{
                let weight=if binary{if *m>=128{255}else{0}}else{*m};
                p[3]=if mode=="coverage"{p[3].min(weight)}else{((p[3] as u32*weight as u32)/255) as u8};
            });
            if let Some(source)=backing{processing::decontaminate_edges(&mut img,&source);}
            // Production cutouts may opt out of retaining the complete master
            // RGB under zero alpha. Keep every visible/soft-edge pixel intact;
            // editing sources retain the original payload by default.
            let cleared=if args["clear_transparent_rgb"].as_bool().unwrap_or(false){
                img.as_mut().par_chunks_mut(4).map(|p|{
                    if p[3]==0&&p[..3].iter().any(|v|*v!=0){p[..3].fill(0);1usize}else{0}
                }).sum::<usize>()
            }else{0};
            Ok(json!({"image":encode(&DynamicImage::ImageRgba8(img))?,"cleared_transparent_pixels":cleared}))
        },
        "mask_stats" => {
            let gray=decode(args,"image")?.to_luma8();let raw=gray.as_raw();
            let sum:u64=raw.par_iter().map(|v|u64::from(*v)).sum();let active:usize=raw.par_iter().filter(|v|**v>0).count();
            Ok(json!({"width":gray.width(),"height":gray.height(),"active_pixels":active,"mean":sum as f64/raw.len() as f64/255.0,"bytes":raw.len()}))
        },
        "mesh" => {
            let bounds:Vec<f32>=serde_json::from_value(args["bounds"].clone()).map_err(|e|e.to_string())?;
            if bounds.len()!=4||bounds.iter().any(|v|!v.is_finite()||*v<0.0||*v>1.0)||bounds[2]<=bounds[0]||bounds[3]<=bounds[1]{return Err("invalid normalized region".into());}
            let n=args["subdivisions"].as_u64().unwrap_or(12).clamp(2,64) as usize;
            let mut positions=Vec::new();let mut uv=Vec::new();let mut indices=Vec::new();
            for y in 0..=n {for x in 0..=n {let u=bounds[0]+(bounds[2]-bounds[0])*x as f32/n as f32;let v=bounds[1]+(bounds[3]-bounds[1])*y as f32/n as f32;uv.extend([u,v]);positions.extend([u-0.5,0.75-v*1.5,0.0]);}}
            for y in 0..n {for x in 0..n {let a=y*(n+1)+x;indices.extend([a,a+n+1,a+1,a+1,a+n+1,a+n+2]);}}
            Ok(json!({"positions":positions,"uv":uv,"indices":indices,"triangles":n*n*2,"role":"region_topology_guide","separate_render_surface":false}))
        },
        _=>Err(format!("unknown operation {op}"))
    }
}
fn main() {
    let stdin=io::stdin(); let mut input=stdin.lock(); let mut out=io::BufWriter::new(io::stdout().lock());
    loop {
        let mut bytes=Vec::new();
        match (&mut input).take((MAX_LINE+1) as u64).read_until(b'\n',&mut bytes) {
            Ok(0)=>break,Ok(_)=>{},Err(_)=>break
        }
        if bytes.len()>MAX_LINE {break;}
        let start=Instant::now();
        let (id,result)=match serde_json::from_slice::<Request>(&bytes) {Ok(req)=>(req.id,run(&req.op,&req.args)),Err(e)=>(Value::Null,Err(e.to_string()))};
        let response=match result {Ok(result)=>Response{id,ok:true,result,error:None,elapsed_ms:start.elapsed().as_secs_f64()*1000.0},Err(error)=>Response{id,ok:false,result:Value::Null,error:Some(error),elapsed_ms:start.elapsed().as_secs_f64()*1000.0}};
        if serde_json::to_writer(&mut out,&response).is_err(){break;}
        if out.write_all(b"\n").and_then(|_|out.flush()).is_err(){break;}
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn uniform_mask_stays_uniform(){assert_eq!(feather(&vec![128;77],11,7,4),vec![128;77]);}
    #[test] fn feather_is_symmetric(){let mut a=vec![0;81];a[40]=255;let b=feather(&a,9,9,1);assert!(b[40]<255&&b[40]>0);for i in 0..81{assert_eq!(b[i],b[80-i]);}}
    #[test] fn reject_degenerate_mesh_region(){assert!(run("mesh",&json!({"bounds":[0.4,0.3,0.1,0.5]})).is_err());}
    #[test] fn regular_mesh_has_shared_vertices(){let m=run("mesh",&json!({"bounds":[0.0,0.0,1.0,1.0],"subdivisions":2})).unwrap();assert_eq!(m["uv"].as_array().unwrap().len(),18);assert_eq!(m["indices"].as_array().unwrap().len(),24);}
    #[test] fn alpha_connected_selection_keeps_soft_edges_and_ignores_retained_rgb(){
        let pixels=vec![255,0,0,254,0,255,0,1,0,0,255,127,255,255,255,0,0,255,255,99,0,0,0,100];
        let image=encode(&DynamicImage::ImageRgba8(image::RgbaImage::from_raw(6,1,pixels).unwrap())).unwrap();
        let args=json!({"image":image,"x":0,"y":0,"tolerance":0,"alpha_only":true});
        let result=run("wand_selection",&args).unwrap();
        assert_eq!(decode(&result,"image").unwrap().to_luma8().as_raw(),&vec![255,255,255,0,0,0]);
        let mut ordinary=args.clone();ordinary["alpha_only"]=json!(false);
        let result=run("wand_selection",&ordinary).unwrap();
        assert_eq!(decode(&result,"image").unwrap().to_luma8().as_raw(),&vec![255,0,0,0,0,0]);
        let mut empty=args.clone();empty["x"]=json!(3);
        let result=run("wand_selection",&empty).unwrap();
        assert_eq!(decode(&result,"image").unwrap().to_luma8().as_raw(),&vec![0;6]);
    }
    #[test] fn alpha_selection_threshold_is_explicit_and_validated(){
        let image=encode(&DynamicImage::ImageRgba8(image::RgbaImage::from_raw(3,1,vec![255,0,0,254,0,255,0,1,0,0,255,127]).unwrap())).unwrap();
        let args=json!({"image":image,"x":0,"y":0,"tolerance":0,"alpha_only":true,"min_alpha":32,"contiguous":false});
        let result=run("wand_selection",&args).unwrap();
        assert_eq!(decode(&result,"image").unwrap().to_luma8().as_raw(),&vec![255,0,255]);
        for invalid in [0,256]{let mut a=args.clone();a["min_alpha"]=json!(invalid);assert!(run("wand_selection",&a).is_err());}
    }
    #[test] fn production_alpha_cleanup_preserves_all_visible_and_soft_edge_pixels(){
        let source=image::RgbaImage::from_raw(4,1,vec![30,40,50,255,60,70,80,1,90,100,110,0,120,130,140,255]).unwrap();
        let mask=GrayImage::from_raw(4,1,vec![255,255,255,0]).unwrap();
        let input=encode(&DynamicImage::ImageRgba8(source.clone())).unwrap();
        let mask=encode(&DynamicImage::ImageLuma8(mask)).unwrap();
        for mode in ["coverage","multiply"]{
            let args=json!({"image":input,"mask":mask,"mode":mode});
            let ordinary=run("alpha",&args).unwrap();
            let mut compact_args=args.clone();compact_args["clear_transparent_rgb"]=json!(true);
            let compact=run("alpha",&compact_args).unwrap();
            let ordinary=decode(&ordinary,"image").unwrap().to_rgba8();
            let compact_image=decode(&compact,"image").unwrap().to_rgba8();
            for (before,after) in ordinary.pixels().zip(compact_image.pixels()){
                assert_eq!(before[3],after[3]);
                if before[3]>0{assert_eq!(before,after);}else{assert_eq!(*after,image::Rgba([0,0,0,0]));}
            }
            assert_eq!(ordinary.get_pixel(2,0),source.get_pixel(2,0));
            assert_eq!(compact["cleared_transparent_pixels"],2);
        }
    }
    #[test] fn complementary_binary_ownership_recomposes_source_without_split_edge_seams(){
        let source=image::RgbaImage::from_raw(6,1,vec![10,20,30,255,40,50,60,254,70,80,90,99,100,110,120,1,130,140,150,0,160,170,180,255]).unwrap();
        let shape=vec![0,127,128,254,255,1];
        let input=encode(&DynamicImage::ImageRgba8(source.clone())).unwrap();
        let mut owned=Vec::new();
        for weights in [shape.clone(),shape.iter().map(|v|255-v).collect()]{
            let mask=encode(&DynamicImage::ImageLuma8(GrayImage::from_raw(6,1,weights).unwrap())).unwrap();
            let result=run("alpha",&json!({"image":input,"mask":mask,"binary_mask":true,"clear_transparent_rgb":true})).unwrap();
            owned.push(decode(&result,"image").unwrap().to_rgba8());
        }
        for (i,p) in source.pixels().enumerate(){
            let left=owned[0].get_pixel(i as u32,0);let right=owned[1].get_pixel(i as u32,0);
            assert_eq!(u16::from(left[3])+u16::from(right[3]),u16::from(p[3]));
            assert!(left[3]==0||right[3]==0);
            if p[3]>0{assert_eq!(if left[3]>0{left}else{right},p);}
        }
    }
}
