extends SceneTree
func _initialize():call_deferred("run")

func capture(card: CardscapeCard, action: String, seconds: float, yaw: float, pitch: float) -> Image:
	card.inspect(yaw,pitch)
	assert(card.play_action(action))
	card.seek_action(seconds,true)
	card._clock=seconds
	card._update(0)
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func run():
	var library := load("res://library.tres") as CardscapeLibrary
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	var reference: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://tests/real-character-reference.json"))
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.fov=40
	camera.current=true
	var card := CardscapeCard.new()
	card.library=library
	card._embedded_definition=definition
	card.effects_paused=true
	stage.add_child(card)
	for i in 5:await process_frame
	var meshes := card._surfaces.map(func(s):return s.mesh.get_instance_id())
	var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	var count := 0
	for sample in reference.samples:
		for angle in reference.angles:
			var frame := await capture(card,str(sample.action),float(sample.seconds),float(angle[0]),float(angle[1]))
			for surface in card._surfaces:
				var id: String=surface.get_meta("layer_id","")
				if not sample.placements.has(id):continue
				var expected: Dictionary=sample.placements[id]
				var registration: float=surface.get_meta("registration",1.0)
				assert(absf(surface.position.x/registration*1024.0-float(expected.x))<.003)
				assert(absf(-surface.position.y/registration*1024.0-float(expected.y))<.003)
				assert(absf(surface.scale.x/registration-float(expected.scale))<.00001)
				assert(absf(surface.rotation.z+float(expected.rotation))<.00001)
			if not directory.is_empty():frame.save_png(directory.path_join("%s-%.3f-%d-%d.png"%[sample.action,sample.seconds,angle[0],angle[1]]))
			count+=1
	assert(meshes==card._surfaces.map(func(s):return s.mesh.get_instance_id()))
	var paused := await capture(card,"trigger",.45,20,12)
	for i in 6:await process_frame
	await RenderingServer.frame_post_draw
	assert(paused.get_data()==root.get_texture().get_image().get_data())
	# Hide foreground occluders independently to expose actual stored support.
	for id in reference.hidden:
		for surface in card._surfaces:surface.visible=surface.get_meta("layer_id","")!=id
		var frame := await capture(card,"trigger",.45,20,12)
		if not directory.is_empty():frame.save_png(directory.path_join("hidden-"+id+".png"))
	for surface in card._surfaces:surface.visible=true
	var back := await capture(card,"flip",1.2,0,0)
	if not directory.is_empty():back.save_png(directory.path_join("back.png"))
	camera.fov=20
	for seconds in [0.0,.45,1.35]:
		var closeup := await capture(card,"trigger",seconds,0,0)
		if not directory.is_empty():closeup.save_png(directory.path_join("joints-%.2f.png"%seconds))
	print(JSON.stringify({"status":"passed","rendered_frames":count,"placement_samples":reference.samples.size(),"meshes_reused":true,"pause_stable":true,"visual_acceptance":"requires review"}))
	quit(0)
