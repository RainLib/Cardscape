extends SceneTree
# QA of the exact shared finish function; not the SDK scene sampler.
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	assert(not directory.is_empty())
	var input: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/rays-input.json"))
	assert(input.schema=="cardscape-rays-gpu-input/1")
	var viewport := SubViewport.new()
	viewport.size=Vector2i(input.registration.width,input.registration.height)
	viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var rect := ColorRect.new()
	rect.size=Vector2(viewport.size)
	viewport.add_child(rect)
	for i in 4:await process_frame
	RenderingServer.render_loop_enabled=false
	var total := 0
	for mode in input.modes:
		assert(str(mode.id).is_valid_identifier())
		var shader := Shader.new()
		shader.code=mode.shader
		var material := ShaderMaterial.new()
		material.shader=shader
		var low := Color(input.recipe.color)
		var high := Color(input.recipe.accent)
		material.set_shader_parameter("qa_low",Vector3(low.r,low.g,low.b))
		material.set_shader_parameter("qa_high",Vector3(high.r,high.g,high.b))
		rect.material=material
		DirAccess.make_dir_recursive_absolute(directory.path_join(mode.id))
		var count := 0
		for frame in input.frames:
			material.set_shader_parameter("qa_clock",frame.time)
			material.set_shader_parameter("qa_view",Vector2(frame.view[0],frame.view[1]))
			if count==0:
				RenderingServer.force_draw(false)
				RenderingServer.force_sync()
			RenderingServer.force_draw(false)
			var image := viewport.get_texture().get_image()
			assert(image.get_size()==viewport.size)
			if count==0:
				var nonempty := false
				for y in range(0,viewport.size.y,16):
					for x in range(0,viewport.size.x,16):
						var color := image.get_pixel(x,y)
						if maxf(color.r,maxf(color.g,color.b))>.2:nonempty=true
				assert(nonempty,"First shared finish draw must not be blank")
			assert(image.save_png(directory.path_join(mode.id).path_join("%03d.png"%count))==OK)
			count+=1
			if count%20==0:print(JSON.stringify({"mode":mode.id,"captured":count}))
		assert(count==77)
		total+=count
		var file := FileAccess.open(directory.path_join(mode.id+"-metadata.json"),FileAccess.WRITE)
		file.store_string(JSON.stringify({"renderer":"Godot shared production finish function","version":input.version,"shaderSha256":mode.shaderSha256,"frames":count,"parameters":mode.parameters,"registration":input.registration,"runtimeSceneVerified":false,"firstFrameNonempty":true,"accepted1to1":false}))
	print(JSON.stringify({"status":"passed","gpu":true,"frames":total,"activeWorkshopEdited":false,"runtimeSceneVerified":false}))
	quit(0)
