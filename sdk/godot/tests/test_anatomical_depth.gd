extends SceneTree
func _initialize():call_deferred("run")
func capture(card,seconds):
 card.seek_effects(seconds)
 for i in 3:await process_frame
 await RenderingServer.frame_post_draw
 return root.get_texture().get_image()
func difference(a,b):
 var changed=0
 for y in a.get_height():
  for x in a.get_width():
   var p=a.get_pixel(x,y)
   var q=b.get_pixel(x,y)
   if maxf(absf(p.r-q.r),maxf(absf(p.g-q.g),absf(p.b-q.b)))>.025:changed+=1
 return changed
func run():
 var library=load("res://library.tres") as CardscapeLibrary
 assert(library!=null)
 var definition=library.card(library.catalog().activeCardId).duplicate(true)
 var stage=Node3D.new()
 root.add_child(stage)
 var camera=Camera3D.new()
 stage.add_child(camera)
 camera.position.z=2.7
 camera.current=true
 var card=CardscapeCard.new()
 card.library=library
 card._embedded_definition=definition
 card.effects_paused=true
 stage.add_child(card)
 for i in 5:await process_frame
 var rigid_surfaces=card._surfaces.filter(func(s):return s.get_meta("layer_id","")=="part")
 assert(rigid_surfaces.size()==2)
 assert(rigid_surfaces[0].mesh==rigid_surfaces[1].mesh)
 assert(rigid_surfaces[0].mesh.surface_get_array_index_len(0)==6)
 assert(rigid_surfaces[0].material_override.get_shader_parameter("rigid_part"))
 assert(not rigid_surfaces[0].has_meta("attachment_parent"))
 var first=await capture(card,0.0)
 var second=await capture(card,1.0)
 var rigid_changed=difference(first,second)
 assert(rigid_changed==0)
 card.inspect(20.0,12.0)
 var tilted=await capture(card,1.0)
 var tilt_changed=difference(second,tilted)
 assert(tilt_changed>100)
 card.inspect(0.0,0.0)
 for l in definition.layers:
  if l.id=="part":
   l.anatomy.part="cape"
   l.attachment.mode="cloth"
   l.attachment.motion=1.0
 card._embedded_definition=definition
 card.rebuild()
 for i in 5:await process_frame
 var cloth_first=await capture(card,0.0)
 var cloth_last=await capture(card,1.0)
 var cloth_changed=difference(cloth_first,cloth_last)
 assert(cloth_changed>100)
 var directory=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
 if directory!="":
  DirAccess.make_dir_recursive_absolute(directory)
  first.save_png(directory.path_join("godot-rigid.png"))
  tilted.save_png(directory.path_join("godot-rigid-tilt.png"))
  cloth_last.save_png(directory.path_join("godot-cloth-control.png"))
 print(JSON.stringify({"status":"passed","rigid_changed_pixels":rigid_changed,"tilt_changed_pixels":tilt_changed,"cloth_control_changed_pixels":cloth_changed,"paired_mesh_shared":true}))
 stage.queue_free()
 await process_frame
 quit()
