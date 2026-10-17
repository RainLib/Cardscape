use crate::{decode, STANDARD};
use base64::Engine;
use image::{DynamicImage, ImageFormat, Rgba32FImage, RgbaImage, imageops::FilterType};
use serde_json::{Value,json};
use std::io::Cursor;

pub fn variant(args: &Value) -> Result<Value,String> {
 let source=decode(args,"image")?.to_rgba8();let (sw,sh)=source.dimensions();
 let scale=args["scale"].as_f64().ok_or("missing texture scale")?;
 if !scale.is_finite() || !(0.01..=1.0).contains(&scale){return Err("invalid texture scale".into());}
 let (w,h)=(((sw as f64*scale).round() as u32).max(1),((sh as f64*scale).round() as u32).max(1));
 // Filter associated colour to prevent dark fringes along transparent joints.
 let result=if (w,h)==(sw,sh){source}else{
  let premult=Rgba32FImage::from_fn(sw,sh,|x,y|{let p=source.get_pixel(x,y);let a=p[3] as f32/255.;image::Rgba([p[0] as f32/255.*a,p[1] as f32/255.*a,p[2] as f32/255.*a,a])});
  let resized=image::imageops::resize(&premult,w,h,FilterType::Lanczos3);
  RgbaImage::from_fn(w,h,|x,y|{let p=resized.get_pixel(x,y);let a=p[3].clamp(0.,1.);image::Rgba([if a>0.00001{(p[0]/a*255.).clamp(0.,255.).round() as u8}else{0},if a>0.00001{(p[1]/a*255.).clamp(0.,255.).round() as u8}else{0},if a>0.00001{(p[2]/a*255.).clamp(0.,255.).round() as u8}else{0},(a*255.).round() as u8])})
 };
 let mut out=Cursor::new(Vec::new());DynamicImage::ImageRgba8(result).write_to(&mut out,ImageFormat::WebP).map_err(|e|e.to_string())?;
 Ok(json!({"image":format!("data:image/webp;base64,{}",STANDARD.encode(out.into_inner())),"width":w,"height":h,"sourceWidth":sw,"sourceHeight":sh}))
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]
 fn alpha_filtering_keeps_colour_on_transparent_edges() {
  let source=RgbaImage::from_fn(2,1,|x,_|if x==0{image::Rgba([255,20,10,255])}else{image::Rgba([0,0,0,0])});
  let uri=crate::encode(&DynamicImage::ImageRgba8(source)).unwrap();
  let v=variant(&json!({"image":uri,"scale":0.5})).unwrap();
  let output=decode(&v,"image").unwrap().to_rgba8();let p=output.get_pixel(0,0);
  assert_eq!(output.dimensions(),(1,1));assert!(p[0]>250);assert!((100..155).contains(&p[3]));
 }
 #[test]
 fn full_size_webp_keeps_visible_rgba_and_rejects_upscaling() {
  let source=RgbaImage::from_pixel(3,2,image::Rgba([19,88,201,117]));let uri=crate::encode(&DynamicImage::ImageRgba8(source.clone())).unwrap();
  let v=variant(&json!({"image":uri,"scale":1})).unwrap();assert_eq!(decode(&v,"image").unwrap().to_rgba8(),source);
  assert!(variant(&json!({"image":uri,"scale":2})).is_err());
 }
}
