extends SceneTree
var failures: Array[String]=[]
func _initialize() -> void:call_deferred("run")
func check(value: bool,message: String) -> void:
	if not value:failures.append(message)
func pixels() -> Image:
	for frame in 2:await process_frame
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
	var cases:=0
	var optimized_surfaces:=0
	for action in ["sweep","cast","collision-cast"]:
		card.play_action(action,0)
		card.seek_action(1.2,true)
		for angle in [Vector2.ZERO,Vector2(20,12),Vector2(180,0)]:
			card.inspect(angle.x,angle.y)
			card.seek_action(1.2,true)
			var parameters: Array=[]
			for surface in card._surfaces:
				var material:=surface.material_override as ShaderMaterial
				var bounds: Vector4=material.get_shader_parameter("_cardscape_source_alpha_bounds")
				parameters.append([material,bounds])
				if bounds!=Vector4(0,0,1,1):optimized_surfaces+=1
			var optimized: Image=await pixels()
			for parameter in parameters:parameter[0].set_shader_parameter("_cardscape_source_alpha_bounds",Vector4.ZERO)
			var uncropped: Image=await pixels()
			check(optimized.get_data()==uncropped.get_data(),"actual GPU pixel equality "+action+" "+str(angle))
			for parameter in parameters:parameter[0].set_shader_parameter("_cardscape_source_alpha_bounds",parameter[1])
			cases+=1
			if cases==1:
				var directory:=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
				if not directory.is_empty():optimized.save_png(directory.path_join("source-support.png"))
	check(optimized_surfaces>0,"real sparse artwork has active source bounds")
	card.free()
	scene.free()
	var sparse:=Image.create(20,30,false,Image.FORMAT_RGBA8)
	sparse.set_pixel(8,10,Color(1,0,0,1.0/255.0))
	sparse.set_pixel(9,12,Color.WHITE)
	var texture:=ImageTexture.create_from_image(sparse)
	check(library.image_alpha_bounds(sparse).is_equal_approx(Vector4(6.0/20,8.0/30,12.0/20,15.0/30)),"native two-texel support matches browser contract")
	var blank:=ImageTexture.create_from_image(Image.create(8,8,false,Image.FORMAT_RGBA8))
	check(library.image_alpha_bounds(blank.get_image())==Vector4(-1,-1,-1,-1),"empty source sentinel")
	check(library.alpha_bounds(texture)==Vector4(0,0,1,1),"mutable image textures retain full support")
	for i in 100:
		var temporary: CompressedTexture2D=(library.textures.values()[0] as CompressedTexture2D).duplicate() as CompressedTexture2D
		library.alpha_bounds(temporary)
	check(library._alpha_bounds_cache.size()==64,"numeric native support cache stays bounded")
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"pixelCases":cases,"boundedCache":library._alpha_bounds_cache.size(),"optimizedSurfaces":optimized_surfaces}))
	quit(0 if failures.is_empty() else 1)
