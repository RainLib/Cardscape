extends SceneTree
func _initialize():call_deferred("run")

func capture(card: CardscapeCard, seconds: float) -> Image:
	card.seek_action(seconds,true)
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func changed(a: Image,b: Image) -> int:
	var count := 0
	for y in a.get_height():
		for x in a.get_width():
			var p := a.get_pixel(x,y)
			var q := b.get_pixel(x,y)
			if absf(p.r-q.r)+absf(p.g-q.g)+absf(p.b-q.b)>.08:count+=1
	return count

func run():
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library!=null)
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	var helper=load("res://addons/cardscape/character_animation.gd")
	var compiled: Dictionary=helper.compile(definition.characterRig)
	var reference: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://tests/character-reference.json"))
	for sample in reference.samples:
		var action: Dictionary=definition.actions.filter(func(a):return a.id==sample.action)[0]
		var pose: Dictionary=helper.sample(compiled,action,minf(1.0,float(sample.seconds)/float(action.duration)),definition.layers)
		for binding in definition.characterRig.bindings:
			var actual: Transform2D=pose[binding.layerId].matrix
			var expected: Array=sample.bones[binding.boneId].matrix
			var values := [actual.x.x,actual.x.y,actual.y.x,actual.y.y,actual.origin.x,actual.origin.y]
			for i in 6:assert(absf(float(values[i])-float(expected[i]))<.001)
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
	stage.add_child(card)
	for i in 5:await process_frame
	assert(card.play_action("trigger"))
	var first := await capture(card,0)
	var middle := await capture(card,.9)
	var different := changed(first,middle)
	assert(different>100)
	var stable := await capture(card,.9)
	assert(changed(middle,stable)==0)
	assert(card.play_action("idle"))
	card._action_time=9.2
	card._update(0.0)
	var running := card._surfaces.map(func(s):return s.transform)
	card.pause_action(true)
	assert(running==card._surfaces.map(func(s):return s.transform))
	var meshes := card._surfaces.map(func(s):return s.mesh.get_instance_id())
	for sample in reference.samples:
		assert(card.play_action(str(sample.action)))
		card.seek_action(float(sample.seconds),true)
		for surface in card._surfaces:
			var id: String=surface.get_meta("layer_id","")
			if not sample.placements.has(id):continue
			var expected: Dictionary=sample.placements[id]
			var registration: float=surface.get_meta("registration",1.0)
			assert(absf(surface.position.x/registration*1024.0-float(expected.x))<.002)
			assert(absf(-surface.position.y/registration*1024.0-float(expected.y))<.002)
			assert(absf(surface.scale.x/registration-float(expected.scale))<.00001)
	assert(meshes==card._surfaces.map(func(s):return s.mesh.get_instance_id()))
	assert(card.play_action("trigger"))
	card.seek_action(.9,true)
	assert(card.set_layer_transform("weapon",Vector2(30,-10),.8))
	var overridden := card._surfaces.filter(func(s):return s.get_meta("layer_id","")=="weapon").map(func(s):return s.transform)
	assert(card.set_layer_transform("weapon",Vector2(30,-10),.8))
	assert(overridden==card._surfaces.filter(func(s):return s.get_meta("layer_id","")=="weapon").map(func(s):return s.transform))
	card.set_effect_parameter("opacity",.7)
	card.seek_action(.9,true)
	for surface in card._surfaces:
		if surface.get_meta("layer_id","")=="weapon":assert(absf(float(surface.material_override.get_shader_parameter("opacity"))-.525)<.0001)
	card.inspect(20,12)
	var tilted := await capture(card,.9)
	assert(changed(stable,tilted)>100)
	var captures := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not captures.is_empty():
		first.save_png(captures.path_join("character-rest.png"))
		middle.save_png(captures.path_join("character-action.png"))
		tilted.save_png(captures.path_join("character-tilted.png"))
	print(JSON.stringify({"status":"passed","samples":reference.samples.size(),"changed_pixels":different,"meshes_reused":true,"pause_stable":true}))
	quit(0)
