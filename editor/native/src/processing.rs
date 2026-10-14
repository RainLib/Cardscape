use crate::{decode,encode,feather};
use image::{DynamicImage,GrayImage};
use rayon::prelude::*;
use serde_json::{Value,json};
use std::collections::VecDeque;

// Legacy splits multiplied source alpha by coverage a second time. Transfer
// that residual to the owned child, keeping the parent's opaque detail intact.
pub fn repair_split(args:&Value)->Result<Value,String>{
 let mut parent=decode(args,"parent")?.to_rgba8();let mut child=decode(args,"child")?.to_rgba8();let master=decode(args,"master")?.to_rgba8();let ownership=decode(args,"mask")?.to_luma8();
 let size=parent.dimensions();if child.dimensions()!=size||master.dimensions()!=size||ownership.dimensions()!=size{return Err("split repair images must share registered dimensions".into());}
 let radius=args["radius"].as_u64().unwrap_or(0) as usize;if radius>8{return Err("split edge radius must be 0..8".into());}
 let expanded=extrema(ownership.as_raw(),size.0 as usize,size.1 as usize,radius,true);let legacy=args["legacy"].as_bool().unwrap_or(true);let mut next_mask=vec![0u8;expanded.len()];
 let mut changed=0usize;
 for i in 0..ownership.as_raw().len(){let mask=ownership.as_raw()[i] as f32;let a=master.as_raw()[i*4+3] as f32/255.0;let target=expanded[i].min(master.as_raw()[i*4+3]);next_mask[i]=target;let old=parent.as_raw()[i*4+3];let delta=if legacy{mask*(1.0-a)}else{0.0}+(target as f32-mask).max(0.0);let next=(old as f32-delta).round().clamp(0.0,255.0) as u8;
  if next!=old||child.as_raw()[i*4+3]!=target{changed+=1;}
  parent.as_mut()[i*4+3]=next;child.as_mut()[i*4+3]=target;
 }
 Ok(json!({"parent":encode(&DynamicImage::ImageRgba8(parent))?,"image":encode(&DynamicImage::ImageRgba8(child))?,"mask":encode(&DynamicImage::ImageLuma8(GrayImage::from_raw(size.0,size.1,next_mask).ok_or("invalid split mask")?))?,"changed_pixels":changed}))
}

// Reconstruct only selected missing pixels, underneath the existing artwork.
// Opaque portrait, hands and weapon pixels remain byte-for-byte unchanged.
pub fn underpaint(args:&Value)->Result<Value,String>{
 let mut image=decode(args,"image")?.to_rgba8();let candidate=decode(args,"candidate")?.to_rgba8();let mask=decode(args,"mask")?.to_luma8();
 let (w,h)=image.dimensions();if candidate.dimensions()!=(w,h)||mask.dimensions()!=(w,h){return Err("underpaint images must share registered dimensions".into());}
 let preserve_visible=args["preserve_visible"].as_bool().unwrap_or(false);
 let mut added=vec![0u8;(w*h) as usize];
 image.as_mut().par_chunks_mut(4).zip(added.par_iter_mut()).enumerate().for_each(|(i,(p,a))|{
  if preserve_visible&&p[3]>0{return;}
  let c=&candidate.as_raw()[i*4..i*4+4];let back=c[3] as f32/255.0*mask.as_raw()[i] as f32/255.0;let front=p[3] as f32/255.0;
  let contribution=(1.0-front)*back;if contribution<=0.0{return;}
  let alpha=front+contribution;
  for channel in 0..3{p[channel]=((p[channel] as f32*front+c[channel] as f32*contribution)/alpha).round() as u8;}
  p[3]=(alpha*255.0).round() as u8;*a=(contribution*255.0).round() as u8;
 });
 let pixels=added.par_iter().filter(|a|**a>0).count();
 Ok(json!({"image":encode(&DynamicImage::ImageRgba8(image))?,"addedMask":encode(&DynamicImage::ImageLuma8(GrayImage::from_raw(w,h,added).ok_or("invalid underpaint mask")?))?,"filled_pixels":pixels}))
}

// Remove the original backing color from partially covered pixels. Alpha is
// unchanged: thin hair, feathers and weapon strings must keep their coverage.
pub fn decontaminate_edges(image:&mut image::RgbaImage,source:&image::RgbaImage){
 let w=image.width() as usize;let h=image.height() as usize;
 let original=source.as_raw();let alpha:Vec<u8>=image.pixels().map(|p|p[3]).collect();
 image.as_mut().par_chunks_mut(4).enumerate().for_each(|(i,p)|{
  if p[3]==0||p[3]==255||original[i*4+3]!=255{return;}
  let x=i%w;let y=i/w;let mut background=None;
  for radius in 1usize..=12 {
   let mut sum=[0u32;3];let mut count=0u32;
   for yy in y.saturating_sub(radius)..=(y+radius).min(h-1){
    for xx in x.saturating_sub(radius)..=(x+radius).min(w-1){
     if xx.abs_diff(x).max(yy.abs_diff(y))!=radius{continue;}
     let j=yy*w+xx;if alpha[j]>3||original[j*4+3]!=255{continue;}
     for c in 0..3{sum[c]+=original[j*4+c] as u32;}count+=1;
    }
   }
   if count>0{background=Some(sum.map(|v|v as f32/count as f32));break;}
  }
  if let Some(bg)=background{
   let a=p[3] as f32/255.;let mut foreground=None;
   // At very low alpha, inversion amplifies quantization into bright color
   // speckles. Stabilize with nearby confident foreground, when one exists.
   if a<0.9{for radius in 1usize..=12{
    let mut sum=[0u32;3];let mut count=0u32;
    for yy in y.saturating_sub(radius)..=(y+radius).min(h-1){for xx in x.saturating_sub(radius)..=(x+radius).min(w-1){
     if xx.abs_diff(x).max(yy.abs_diff(y))!=radius{continue;}
     let j=yy*w+xx;if alpha[j]<250||original[j*4+3]!=255{continue;}
     if (0..3).map(|c|(original[j*4+c] as f32-bg[c]).powi(2)).sum::<f32>()<625.{continue;}
     for c in 0..3{sum[c]+=original[j*4+c] as u32;}count+=1;
    }}
    if count>0{foreground=Some(sum.map(|v|v as f32/count as f32));break;}
   }}
   let confidence=((a-0.2)/0.7).clamp(0.,1.);
   for c in 0..3{
    let recovered=((original[i*4+c] as f32-(1.-a)*bg[c])/a).clamp(0.,255.);
    p[c]=foreground.map_or(recovered,|fg|fg[c]*(1.-confidence)+recovered*confidence).round() as u8;
   }
  }
 });
}

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
 let alpha_only=args["alpha_only"].as_bool().unwrap_or(false);
 let min_alpha=match args.get("min_alpha"){None=>1,Some(v)=>v.as_u64().ok_or("invalid minimum alpha")?};
 if !(1..=255).contains(&min_alpha){return Err("minimum alpha must be 1..255".into());}
 let contiguous=args["contiguous"].as_bool().unwrap_or(true);let seed=(y*w as u64+x) as usize;let color=image.as_raw()[seed*4..seed*4+4].to_vec();let threshold=(tolerance/100.0*255.0).powi(2);let matches=|i:usize|{let p=&image.as_raw()[i*4..i*4+4];if alpha_only{return u64::from(p[3])>=min_alpha;}if color[3]==0{return p[3]==0;}let d=(0..3).map(|c|(p[c] as f64-color[c] as f64).powi(2)).sum::<f64>()/3.0;d<=threshold&&(p[3] as i32-color[3] as i32).abs()<=64};
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
 #[test]fn edge_decontamination_preserves_coverage_and_opaque_detail(){
  let source=image::RgbaImage::from_raw(3,1,vec![240,240,240,255,220,140,130,255,200,40,20,255]).unwrap();
  let mut cutout=source.clone();cutout.get_pixel_mut(0,0)[3]=0;cutout.get_pixel_mut(1,0)[3]=128;
  decontaminate_edges(&mut cutout,&source);
  let edge=cutout.get_pixel(1,0).0;assert_eq!(edge[3],128);
  for (actual,expected) in edge[..3].iter().zip([200,40,20]){assert!((*actual as i32-expected).abs()<=1);}
  assert_eq!(cutout.get_pixel(2,0).0,[200,40,20,255]);
  assert_eq!(cutout.get_pixel(0,0).0,[240,240,240,0]);
 }
 #[test]fn existing_transparent_art_is_not_unmixed_with_an_invented_background(){
  let source=image::RgbaImage::from_raw(2,1,vec![0,0,0,0,210,70,30,128]).unwrap();let mut cutout=source.clone();
  decontaminate_edges(&mut cutout,&source);assert_eq!(cutout,source);
 }
 #[test]fn low_alpha_quantization_does_not_become_bright_color_speckles(){
  let source=image::RgbaImage::from_raw(3,1,vec![240,240,240,255,244,242,244,255,200,40,20,255]).unwrap();
  let mut cutout=source.clone();cutout.get_pixel_mut(0,0)[3]=0;cutout.get_pixel_mut(1,0)[3]=4;
  decontaminate_edges(&mut cutout,&source);assert_eq!(cutout.get_pixel(1,0).0,[200,40,20,4]);
 }
 #[test]fn morphology_has_predictable_boundaries(){let a=[0,0,255,0,0];assert_eq!(row_extreme(&a,1,true),[0,255,255,255,0]);assert_eq!(row_extreme(&[0,255,255,255,0],1,false),[0,0,255,0,0]);}
 #[test]fn separable_morphology_preserves_gray_and_zero_radius(){let a=[0,10,0,0,128,0,0,20,0];assert_eq!(extrema(&a,3,3,0,true),a);assert_eq!(extrema(&a,3,3,1,true),vec![128;9]);assert_eq!(extrema(&vec![90;63],9,7,64,false),vec![90;63]);}
 #[test]fn registered_underpaint_can_restore_only_missing_pixels_without_changing_soft_edges(){
  let source=image::RgbaImage::from_raw(4,1,vec![10,20,30,254,40,50,60,1,0,0,0,0,0,0,0,0]).unwrap();
  let candidate=image::RgbaImage::from_pixel(4,1,image::Rgba([200,180,140,255]));
  let mask=GrayImage::from_raw(4,1,vec![255,255,255,0]).unwrap();
  let result=underpaint(&json!({"image":encode(&DynamicImage::ImageRgba8(source.clone())).unwrap(),"candidate":encode(&DynamicImage::ImageRgba8(candidate)).unwrap(),"mask":encode(&DynamicImage::ImageLuma8(mask)).unwrap(),"preserve_visible":true})).unwrap();
  let restored=decode(&result,"image").unwrap().to_rgba8();
  assert_eq!(restored.get_pixel(0,0),source.get_pixel(0,0));
  assert_eq!(restored.get_pixel(1,0),source.get_pixel(1,0));
  assert_eq!(restored.get_pixel(2,0).0,[200,180,140,255]);
  assert_eq!(restored.get_pixel(3,0).0,[0,0,0,0]);
  assert_eq!(result["filled_pixels"],1);
 }
}
