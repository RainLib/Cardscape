extends SceneTree
var failures: Array[String]=[]
func _initialize() -> void:call_deferred("run")
func check(value: bool,message: String) -> void:
	if not value:failures.append(message)
func pixels() -> Image:
	for frame in 3:await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func run() -> void:
	var library:=load("res://library.tres") as CardscapeLibrary
	var scene:=Node3D.new()
	root.add_child(scene)
	var camera:=Camera3D.new()
	scene.add_child(camera)
	camera.position.z=2.7
	camera.fov=CardscapeCard.preview_fov(root.size)
	camera.current=true
	var card:=CardscapeCard.new()
	card.library=library
	card.card_id=str(library.catalog().activeCardId)
	card.effects_paused=true
	card.detail_pixel_width=100000
	scene.add_child(card)
	for frame in 6:await process_frame
	card.set_process(false)
	var shaders: Dictionary={}
	var original: Dictionary={}
	var unconditional: Dictionary={}
	var guard:="if(background||clipped||foreground_pass>0.0){aperture=at_plane(card_point,.045-metrics.w);inside=in_outline(aperture,metrics.x);}"
	for surface in card._surfaces:
		var shader: Shader=(surface.material_override as ShaderMaterial).shader
		var id:=shader.get_instance_id()
		if shaders.has(id):continue
		check(shader.code.contains(guard),"real exported shader uses guarded aperture evaluation")
		shaders[id]=shader
		original[id]=shader.code
		unconditional[id]=shader.code.replace(guard,"aperture=at_plane(card_point,.045-metrics.w);inside=in_outline(aperture,metrics.x);")
	check(shaders.size()>0,"real exported surface shaders are compared")
	var cases:=0
	for action in ["sweep","cast","collision-cast"]:
		card.play_action(action,0)
		card.seek_action(1.2,true)
		for angle in [Vector2.ZERO,Vector2(20,12),Vector2(180,0)]:
			card.inspect(angle.x,angle.y)
			card.seek_action(1.2,true)
			var optimized: Image=await pixels()
			for id in shaders:shaders[id].code=unconditional[id]
			var legacy: Image=await pixels()
			check(optimized.get_data()==legacy.get_data(),"actual GPU pixel equality "+action+" "+str(angle))
			for id in shaders:shaders[id].code=original[id]
			cases+=1
			var directory:=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
			if not directory.is_empty():optimized.save_png(directory.path_join("aperture-%d.png" % cases))
	card.free()
	scene.free()
	for frame in 3:await process_frame
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"aperturePixelCases":cases,"shadersCompared":shaders.size()}))
	quit(0 if failures.is_empty() else 1)
