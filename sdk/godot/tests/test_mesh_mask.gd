extends SceneTree
class MaskCard extends CardscapeCard:
 var mask_texture:Texture2D
 func _texture(key:String)->Texture2D:
  return mask_texture if key=="rigid" else null
func _initialize():call_deferred("run")
func baseline(img,uv,indices):
 var locks=[]
 locks.resize(uv.size()/2)
 locks.fill(0.0)
 for t in range(0,indices.size(),3):
  var ids=[indices[t],indices[t+1],indices[t+2]]
  var low=Vector2(INF,INF)
  var high=Vector2.ZERO
  for i in ids:
   var pixel=Vector2(uv[i*2],uv[i*2+1])*Vector2(img.get_width()-1,img.get_height()-1)
   low=low.min(pixel)
   high=high.max(pixel)
  var maximum=0.0
  for y in range(maxi(0,floori(low.y)),mini(img.get_height()-1,ceili(high.y))+1):
   for x in range(maxi(0,floori(low.x)),mini(img.get_width()-1,ceili(high.x))+1):
    maximum=maxf(maximum,img.get_pixel(x,y).r)
  if maximum>=.5:maximum=1.0
  for i in ids:locks[i]=maxf(locks[i],maximum)
 return locks
func run():
 var formats=[Image.FORMAT_L8,Image.FORMAT_R8,Image.FORMAT_RGB8,Image.FORMAT_RGBA8,Image.FORMAT_RGBAF]
 var data={"positions":[-.5,.5,0,0,.5,0,-.5,0,0,0,0,0,.5,0,0,0,-.5,0,-.7,.5,0,-.5,.7,0,-.3,.3,0],"uv":[0,0,.45,.05,.07,.4,.5,.6,1,.7,.6,1,-.2,0,0,-.2,.2,.2],"indices":[0,1,2,3,4,5,6,7,8]}
 var checked=0
 for format in formats:
  for high_region in [false,true]:
   var image=Image.create(7,11,false,format)
   for y in 11:
    for x in 7:
     var red=float((x*17+y*13)%120)/255.0
     if high_region and x==6 and y==10:red=.9
     image.set_pixel(x,y,Color(red,.9,.2,0.0 if x%2==0 else 1.0))
   var card=MaskCard.new()
   card.mask_texture=ImageTexture.create_from_image(image)
   card._definition={"maskAssets":{"rigid":"rigid"}}
   var expected=baseline(card.mask_texture.get_image(),data.uv,data.indices)
   var mesh=card._mesh(data,true)
   var uv2=mesh.surface_get_arrays(0)[Mesh.ARRAY_TEX_UV2]
   for i in uv2.size():assert(absf(uv2[i].y-expected[i])<.000001)
   card.free()
   checked+=1
 print(JSON.stringify({"status":"passed","mask_fixtures":checked,"formats":formats.size(),"raw_red_and_float_fallback_match_original":true}))
 quit()
