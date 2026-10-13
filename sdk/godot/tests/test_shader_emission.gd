extends SceneTree
func _initialize() -> void:
	call_deferred("_run")
func pixels_changed(a: Image,b: Image) -> int:
	var count := 0
	for y in a.get_height():
		for x in a.get_width():
			var p := a.get_pixel(x,y)
			var q := b.get_pixel(x,y)
			if maxf(absf(p.r-q.r),maxf(absf(p.g-q.g),absf(p.b-q.b)))>.03:
				count+=1
	return count
func capture() -> Image:
	await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func _run() -> void:
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library != null)
	var reference: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/shader-emission-reference.json"))
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	definition.get("componentScenes",{}).erase("particles")
	assert(definition.shader.editorMode=="nodes")
	assert(definition.shader.graphs.has("geometry") and definition.shader.graphs.has("fragment"))
	assert(definition.shader.fragmentBody.contains("sg13"))
	assert(library.shaders[definition.shader_key].code.contains(definition.shader.fragmentBody))
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.current=true
	var card := CardscapeCard.new()
	card.library=library
	card._embedded_definition=definition
	card.effects_paused=true
	card.particle_settings=reference.config
	stage.add_child(card)
	for i in 5:await process_frame
	card.seek_effects(1.4)
	var batch := card._particle_node.multimesh
	var report: Array = []
	for scene in reference.scenes:
		card.particle_settings=scene.config
		card.inspect(float(scene.yaw),float(scene.pitch))
		card.seek_effects(1.4)
		assert(card._particle_node.multimesh==batch)
		assert(card._particle_count==scene.count)
		for i in scene.count:
			var point: Array = scene.samples.slice(i*7,i*7+7)
			assert(batch.get_instance_transform(i).origin.distance_to(Vector3(point[0],point[1],point[2]))<.0001)
			assert(absf(batch.get_instance_color(i).a-float(point[4]))<.008)
		var on := await capture()
		card.particle_settings=scene.config.duplicate(true)
		card.particle_settings.enabled=false
		card.seek_effects(1.4)
		assert(card._particle_count==0)
		var off := await capture()
		var difference := pixels_changed(on,off)
		if scene.has("visible"):
			assert(difference>100 if scene.visible else difference==0)
		if reference.has("captureDirectory"):
			on.save_png(str(reference.captureDirectory)+"/"+str(scene.id)+".png")
		report.append({"id":scene.id,"changed_pixels":difference,"source":scene.config.emitter.target,"yaw":scene.yaw,"pitch":scene.pitch})
	print(JSON.stringify({"status":"passed","graph_shader_gpu":true,"fixed_batch":true,"cross_renderer_positions":true,"occlusion":report}))
	stage.queue_free()
	await process_frame
	quit(0)
