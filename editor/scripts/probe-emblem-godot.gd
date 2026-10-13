extends SceneTree
# Independent QA: render unchanged production glyphs from explicit JS samples.
# This does not verify the SDK trajectory sampler or edit a workshop.
func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	assert(not directory.is_empty())
	root.size=Vector2i(820,1000)
	RenderingServer.set_default_clear_color(Color(.02,.025,.04))
	var viewport := SubViewport.new()
	viewport.size=Vector2i(820,1000)
	viewport.own_world_3d=true
	viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.fov=CardscapeCard.preview_fov(Vector2(viewport.size))
	camera.current=true
	viewport.add_child(camera)
	var stage := Node3D.new()
	stage.scale=Vector3.ONE*1.23
	stage.position.y=-.06
	viewport.add_child(stage)
	var instance := MultiMeshInstance3D.new()
	var batch := MultiMesh.new()
	batch.transform_format=MultiMesh.TRANSFORM_3D
	batch.use_colors=true
	batch.use_custom_data=true
	var quad := QuadMesh.new()
	quad.size=Vector2.ONE
	batch.mesh=quad
	batch.instance_count=40
	instance.multimesh=batch
	instance.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := ShaderMaterial.new()
	material.shader=load("res://addons/cardscape/card_particles.gdshader")
	material.set_shader_parameter("visual",25)
	instance.material_override=material
	stage.add_child(instance)
	for i in 4:await process_frame
	# Do not wait for a native window's post-draw event; it can stop when hidden.
	RenderingServer.render_loop_enabled=false
	var total := 0
	var modes := OS.get_environment("CARDSCAPE_EMBLEM_MODES").split(",",false)
	if modes.is_empty():modes=PackedStringArray(["baseline","fitted"])
	for mode in modes:
		assert(mode.is_valid_identifier())
		var input: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/"+mode+"-samples.json"))
		assert(input.schema=="cardscape-emblem-qa-samples/1")
		assert(input.frames.size()==77)
		DirAccess.make_dir_recursive_absolute(directory.path_join(mode))
		var index := 0
		var dimensions := Vector2i.ZERO
		for frame in input.frames:
			assert(frame.count==40)
			assert(frame.packed.size()==40*60)
			batch.visible_instance_count=frame.count
			for i in frame.count:
				var at: int = i*60
				var values: Array = frame.packed
				var size: float = float(values[at+3])*2.0
				batch.set_instance_transform(i,Transform3D(Basis.from_scale(Vector3.ONE*size),Vector3(values[at],values[at+1],values[at+2])))
				batch.set_instance_custom_data(i,Color(values[at+6],values[at+5],0,0))
				var tint := Color(input.config.color)
				tint.a=values[at+4]
				batch.set_instance_color(i,tint)
			material.set_shader_parameter("particle_time",frame.time)
			# A cold material/batch can skip its first draw while being uploaded.
			# Keep the sample at its exact timestamp during GPU warmup.
			if index==0:
				RenderingServer.force_draw(false)
				RenderingServer.force_sync()
			RenderingServer.force_draw(false)
			var image := viewport.get_texture().get_image()
			dimensions=image.get_size()
			assert(dimensions==Vector2i(820,1000))
			if index==0:
				var has_glyph := false
				for y in range(0,1000,8):
					for x in range(0,820,8):
						var pixel := image.get_pixel(x,y)
						if pixel.r>.4 and pixel.g>.2 and pixel.b<.3:has_glyph=true
				assert(has_glyph,"First sample must contain actual rendered glyphs")
			assert(image.save_png(directory.path_join(mode).path_join("%03d.png"%index))==OK)
			index+=1
			if index%20==0:print(JSON.stringify({"mode":mode,"captured":index}))
		assert(index==77)
		total+=index
		var file := FileAccess.open(directory.path_join(mode+"-metadata.json"),FileAccess.WRITE)
		assert(file!=null)
		file.store_string(JSON.stringify({"renderer":"Godot production particle Shader","experimental":true,"runtimeSamplerVerified":false,"dimensions":[dimensions.x,dimensions.y],"frames":index,"profile":input.growthProfile,"version":input.version}))
	print(JSON.stringify({"status":"passed","gpu":true,"frames":total,"experimental":true,"activeWorkshopEdited":false,"runtimeSamplerVerified":false}))
	quit(0)
