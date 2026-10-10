use crate::{decode,encode,feather};
use image::{DynamicImage,GrayImage};
use rayon::prelude::*;
use serde_json::{Value,json};
use std::collections::VecDeque;

// Sliding extrema make expansion/erosion O(pixels), independent of radius.
fn row_extreme(row:&[u8],radius:usize,maximum:bool)->Vec<u8>{
 let mut queue:VecDeque<usize>=VecDeque::new();let mut out=vec![0;row.len()];let mut end=0;
 for x in 0..row.len(){let right=(x+radius+1).min(row.len());while end<right{while let Some(&i)=queue.back(){if if maximum{row[i]<=row[end]}else{row[i]>=row[end]}{queue.pop_back();}else{break;}}queue.push_back(end);end+=1;}let left=x.saturating_sub(radius);while queue.front().is_some_and(|i|*i<left){queue.pop_front();}out[x]=row[*queue.front().unwrap()];}out
}
fn extrema(src:&[u8],w:usize,h:usize,radius:usize,maximum:bool)->Vec<u8>{
 let horizontal:Vec<u8>=src.par_chunks(w).flat_map_iter(|row|row_extreme(row,radius,maximum)).collect();
 let columns:Vec<Vec<u8>>=(0..w).into_par_iter().map(|x|row_extreme(&(0..h).map(|y|horizontal[y*w+x]).collect::<Vec<_>>(),radius,maximum)).collect();
 let mut out=vec![0;w*h];out.par_chunks_mut(w).enumerate().for_each(|(y,row)|for x in 0..w{row[x]=columns[x][y];});out
}
pub fn refine(args:&Value)->Result<Value,String>{
 let gray=decode(args,"image")?.to_luma8();let (w,h)=gray.dimensions();let radius=args["radius"].as_u64().ok_or("invalid selection radius")?;if radius>64{return Err("selection radius exceeds 64 pixels".into());}
 let operation=args["operation"].as_str().unwrap_or("");let raw=match operation{"invert"=>gray.as_raw().par_iter().map(|v|255-v).collect(),"expand"=>extrema(gray.as_raw(),w as usize,h as usize,radius as usize,true),"contract"=>extrema(gray.as_raw(),w as usize,h as usize,radius as usize,false),"feather"=>feather(gray.as_raw(),w as usize,h as usize,radius as usize),_=>return Err("unsupported selection refinement".into())};
 Ok(json!({"image":encode(&DynamicImage::ImageLuma8(GrayImage::from_raw(w,h,raw).ok_or("invalid selection")?))?,"width":w,"height":h}))
}
pub fn wand(args:&Value)->Result<Value,String>{
 let image=decode(args,"image")?.to_rgba8();let (w,h)=image.dimensions();let x=args["x"].as_u64().ok_or("invalid seed")?;let y=args["y"].as_u64().ok_or("invalid seed")?;if x>=w as u64||y>=h as u64{return Err("seed outside image".into());}let tolerance=args["tolerance"].as_f64().ok_or("invalid tolerance")?;if !tolerance.is_finite()||!(0.0..=100.0).contains(&tolerance){return Err("tolerance must be 0..100".into());}
 let contiguous=args["contiguous"].as_bool().unwrap_or(true);let seed=(y*w as u64+x) as usize;let color=image.as_raw()[seed*4..seed*4+4].to_vec();let threshold=(tolerance/100.0*255.0).powi(2);let matches=|i:usize|{let p=&image.as_raw()[i*4..i*4+4];if color[3]==0{return p[3]==0;}let d=(0..3).map(|c|(p[c] as f64-color[c] as f64).powi(2)).sum::<f64>()/3.0;d<=threshold&&(p[3] as i32-color[3] as i32).abs()<=64};
 let mut mask=vec![0;w as usize*h as usize];if contiguous{let mut seen=vec![false;mask.len()];let mut queue=VecDeque::from([seed]);seen[seed]=true;while let Some(i)=queue.pop_front(){if !matches(i){continue;}mask[i]=255;let xx=i%w as usize;let yy=i/w as usize;for n in [if xx>0{Some(i-1)}else{None},if xx+1<w as usize{Some(i+1)}else{None},if yy>0{Some(i-w as usize)}else{None},if yy+1<h as usize{Some(i+w as usize)}else{None}].into_iter().flatten(){if !seen[n]{seen[n]=true;queue.push_back(n);}}}}else{mask.par_iter_mut().enumerate().for_each(|(i,m)|if matches(i){*m=255});}
 let radius=args["feather"].as_u64().unwrap_or(0);if radius>32{return Err("wand feather exceeds 32 pixels".into());}if radius>0{mask=feather(&mask,w as usize,h as usize,radius as usize);}Ok(json!({"image":encode(&DynamicImage::ImageLuma8(GrayImage::from_raw(w,h,mask).ok_or("invalid selection")?))?,"width":w,"height":h}))
}
pub fn adjust(args:&Value)->Result<Value,String>{
 let a=&args["adjustments"];let get=|k:&str,default:f32,min:f32,max:f32|->Result<f32,String>{let n=if a[k].is_null(){default}else{a[k].as_f64().ok_or("invalid adjustment")? as f32};if !n.is_finite()||n<min||n>max{return Err(format!("invalid adjustment {k}"));}Ok(n)};
 let brightness=get("brightness",0.,-100.,100.)?/100.;let contrast=1.+get("contrast",0.,-100.,100.)?/100.;let saturation=get("saturation",100.,0.,200.)?/100.;let gamma=get("gamma",1.,0.2,3.)?;
 let mut image=decode(args,"image")?.to_rgba8();image.as_mut().par_chunks_mut(4).for_each(|p|{if p[3]==0{return;}let c=[0,1,2].map(|i|((p[i] as f32/255.-0.5)*contrast+0.5+brightness).clamp(0.,1.).powf(1./gamma));let y=0.2126*c[0]+0.7152*c[1]+0.0722*c[2];for i in 0..3{p[i]=((y+(c[i]-y)*saturation).clamp(0.,1.)*255.).round() as u8;}});
 Ok(json!({"image":encode(&DynamicImage::ImageRgba8(image))?}))
}
pub fn title_raster(args:&Value)->Result<Value,String>{
 let image=decode(args,"image")?.to_rgba8();
 let raster=if image.width()==1024&&image.height()==1536{image}else{
  let scale=(900.0/image.width() as f64).min(260.0/image.height() as f64);
  let width=(image.width() as f64*scale).round().max(1.0) as u32;
  let height=(image.height() as f64*scale).round().max(1.0) as u32;
  let fitted=image::imageops::resize(&image,width,height,image::imageops::FilterType::Lanczos3);
  let mut out=image::RgbaImage::new(1024,1536);
  image::imageops::overlay(&mut out,&fitted,(1024-width) as i64/2,1480-height as i64);out
 };
 Ok(json!({"image":encode(&DynamicImage::ImageRgba8(raster))?,"width":1024,"height":1536}))
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn morphology_has_predictable_boundaries(){let a=[0,0,255,0,0];assert_eq!(row_extreme(&a,1,true),[0,255,255,255,0]);assert_eq!(row_extreme(&[0,255,255,255,0],1,false),[0,0,255,0,0]);}
 #[test]fn separable_morphology_preserves_gray_and_zero_radius(){let a=[0,10,0,0,128,0,0,20,0];assert_eq!(extrema(&a,3,3,0,true),a);assert_eq!(extrema(&a,3,3,1,true),vec![128;9]);assert_eq!(extrema(&vec![90;63],9,7,64,false),vec![90;63]);}
}
