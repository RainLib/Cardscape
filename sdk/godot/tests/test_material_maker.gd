extends SceneTree
func _initialize():
 call_deferred("run")
func capture(card,seconds):
 card.seek_effects(seconds)
 await process_frame
 await RenderingServer.frame_post_draw
 return root.get_texture().get_image()
func run():
 var library = load("res://library.tres") as CardscapeLibrary
 assert(library != null)
 var definition = library.card(library.catalog().activeCardId).duplicate(true)
 assert(definition.shader.fragmentPrelude.contains("csMM_csSweep"))
 var shader = library.shaders[definition.shader_key] as Shader
 assert(shader.code.contains("csMM_csMMEffect"))
 assert(not shader.code.contains("elapsed_time"))
 var stage = Node3D.new()
 root.add_child(stage)
 var camera = Camera3D.new()
 stage.add_child(camera)
 camera.position.z=2.7
 camera.current=true
 var card = CardscapeCard.new()
 card.library=library
 card._embedded_definition=definition
 card.effects_paused=true
 stage.add_child(card)
 for i in 5:await process_frame
 var first = await capture(card,0.0)
 var second = await capture(card,0.5)
 var changed = 0
 for y in first.get_height():
  for x in first.get_width():
   var a = first.get_pixel(x,y)
   var b = second.get_pixel(x,y)
   if maxf(absf(a.r-b.r),maxf(absf(a.g-b.g),absf(a.b-b.b)))>.03:
    changed+=1
 assert(changed>100)
 var directory=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
 if directory!="":
  first.save_png(directory.path_join("godot-mm-0.png"))
  second.save_png(directory.path_join("godot-mm-05.png"))
 print(JSON.stringify({"status":"passed","native_mm_functions":true,"dynamic_changed_pixels":changed}))
 stage.queue_free()
 await process_frame
 quit()
