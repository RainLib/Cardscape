extends SceneTree
var card: CardscapeCard
var camera: Camera3D
func _initialize():
	call_deferred("_run")
func _image() -> Image:
	for i in 3: await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func _difference(a: Image,b: Image) -> float:
	var sum := 0.0
	for y in range(0,a.get_height(),4):
		for x in range(0,a.get_width(),4):
			var c := a.get_pixel(x,y)
			var d := b.get_pixel(x,y)
			sum+=absf(c.r-d.r)+absf(c.g-d.g)+absf(c.b-d.b)
	return sum
func _run():
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library!=null)
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	definition.componentScenes={}
	for key in ["backScene","backAsset","cardStats","assetKind"]: definition.erase(key)
	definition.layers=[{"id":"qa-frame","kind":"frame","visible":true}]
	definition.particles={"enabled":false}
	definition.material={"enabled":false}
	definition.cosmetics={"schema":"card-cosmetics/1","level":"authored","finish":"original","flare":"none","border":"custom","quality":"balanced"}
	var stage := Node3D.new()
	root.add_child(stage)
	camera=Camera3D.new()
	camera.position.z=2.7
	camera.keep_aspect=Camera3D.KEEP_HEIGHT
	camera.fov=CardscapeCard.preview_fov(Vector2(600,900))
	camera.current=true
	stage.add_child(camera)
	var environment := WorldEnvironment.new()
	environment.environment=Environment.new()
	environment.environment.background_mode=Environment.BG_COLOR
	environment.environment.background_color=Color("#14181c")
	stage.add_child(environment)
	card=CardscapeCard.new()
	card.library=library
	card._embedded_definition=definition
	card.effects_paused=true
	stage.add_child(card)
	for i in 5: await process_frame
	var profiles := []
	var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	var reference: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://tests/neon-reference.json"))
	for recipe in reference.recipes:
		card._embedded_definition.frameStyle=recipe.style.duplicate(true)
		card._embedded_definition.frameGeometry=recipe.geometry.duplicate(true)
		card.rebuild()
		card.inspect(0,0)
		card.seek_effects(0)
		var a: Image=await _image()
		var rim := card._visual.get_node("frame-rim") as MeshInstance3D
		var mesh := rim.mesh
		card.seek_effects(10)
		var b: Image=await _image()
		assert(_difference(a,b)<.001,"Static neon must not pulse on its own")
		assert(rim.mesh==mesh,"Playback must retain the rigid frame mesh")
		card.inspect(-18,13)
		var tilted: Image=await _image()
		assert(_difference(a,tilted)>.1,"Camera tilt must change the visible reflection")
		assert(_difference(tilted,await _image())<.001,"Paused reflection must remain stable")
		assert(rim.mesh==mesh,"Inspection must retain geometry")
		assert(maxf(a.get_pixel(300,450).r,maxf(a.get_pixel(300,450).g,a.get_pixel(300,450).b))<.15,"Neon must not fill the aperture")
		var edge := camera.unproject_position(Vector3(.5,0,.045))
		var left := camera.unproject_position(Vector3(-.5,0,.045))
		var width := edge.x-left.x
		var inner := edge.x-width*float(recipe.style.width)/1024.0
		var near_color := a.get_pixel(roundi(inner-width*.006),450)
		var middle_color := a.get_pixel(roundi(inner-width*.024),450)
		var far_color := a.get_pixel(roundi(inner-width*.065),450)
		var near_gain := maxf(near_color.r-far_color.r,maxf(near_color.g-far_color.g,near_color.b-far_color.b))
		var middle_gain := maxf(middle_color.r-far_color.r,maxf(middle_color.g-far_color.g,middle_color.b-far_color.b))
		assert(near_gain>.04,"Neon must illuminate the inner edge")
		assert(middle_gain>0.001 and middle_gain<near_gain,"Inward glow must decay without filling the aperture")
		assert(far_color.is_equal_approx(a.get_pixel(300,450)),"Inward glow must end within the bounded window strip")
		var ratio := 0.0
		if recipe.id=="frame-neon-blue":
			var total := 0
			var rows := 0
			for y in range(360,630,4):
				var count := 0
				for x in range(int(edge.x-width*.07),int(edge.x)+1):
					var color := a.get_pixel(x,y)
					if color.g>.9 and color.b>.9:count+=1
				total+=count
				rows+=1
			var average := float(total)/rows
			ratio=average/width
			assert(ratio>.023 and ratio<.047,"Calibrated blue luminous face must stay broad")
		profiles.append({"id":recipe.id,"bright_width_ratio":ratio,"inner_edge_gain":near_gain,"inner_middle_gain":middle_gain,"inner_halo_bounded":true,"idle_static":true,"view_reflection":true,"mesh_reused":true,"pause_stable":true})
		if not directory.is_empty():
			assert(a.save_png(directory.path_join(recipe.id+".png"))==OK)
			assert(tilted.save_png(directory.path_join(recipe.id+"-tilt.png"))==OK)
		card.inspect(180,0)
		await _image()
		var aura := card._visual.get_node_or_null("frame-aura") as MeshInstance3D
		assert(aura==null or not aura.visible,"Front aura must hide on the back")
	print(JSON.stringify({"status":"passed","actual_sdk":true,"profiles":profiles,"accepted_1_to_1":false}))
	stage.queue_free()
	await process_frame
	quit(0)
