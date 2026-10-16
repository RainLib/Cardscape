extends SceneTree
var capture_view: SubViewport
func _initialize():call_deferred("run")

func capture(card: CardscapeCard, sample: Dictionary, angle: Array) -> Image:
	card.inspect(float(angle[0]),float(angle[1]))
	assert(card.play_action(str(sample.action)))
	card.seek_action(float(sample.seconds),true)
	card._clock=float(sample.seconds)
	card._update(0)
	for i in 3:await process_frame
	# Offscreen GPU capture must also progress when the desktop window is covered.
	RenderingServer.force_draw(false)
	return capture_view.get_texture().get_image()

func run():
	var library := load("res://library.tres") as CardscapeLibrary
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	var reference: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://tests/advanced-character-reference.json"))
	var helper=load("res://addons/cardscape/character_animation.gd")
	var compiled: Dictionary=helper.compile(definition.characterRig)
	capture_view=SubViewport.new()
	capture_view.size=Vector2i(600,900)
	capture_view.own_world_3d=true
	capture_view.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	root.add_child(capture_view)
	var stage := Node3D.new()
	capture_view.add_child(stage)
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
	var ids := card._surfaces.map(func(s):return s.mesh.get_instance_id())
	var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	var max_vertex_error := 0.0
	var max_ik_error := 0.0
	var count := 0
	var frame_hashes: Dictionary={}
	for sample in reference.samples:
		print("CAPTURE ",sample.action," ",sample.seconds)
		var action: Dictionary=definition.actions.filter(func(a):return a.id==sample.action)[0]
		var pose: Dictionary=helper.pose(compiled,action,float(sample.seconds)/float(action.duration),definition.layers)
		for bone_id in sample.bones:
			var actual: Transform2D=pose.bones[bone_id].matrix
			var expected: Array=sample.bones[bone_id].matrix
			var values := [actual.x.x,actual.x.y,actual.y.x,actual.y.y,actual.origin.x,actual.origin.y]
			for i in 6:assert(absf(float(values[i])-float(expected[i]))<.02)
		for id in pose.ik:
			if pose.ik[id].reachable and float(pose.ik[id].mix)>.999:
				max_ik_error=maxf(max_ik_error,float(pose.ik[id].error))
				assert(float(pose.ik[id].error)<.02)
		var first_angle := true
		for angle in sample.angles:
			var frame := await capture(card,sample,angle)
			frame_hashes[hash(frame.get_data())]=true
			if first_angle:
				for layer_id in sample.geometry:
					var skin: Dictionary=card._native_meshes[layer_id]
					var actual: PackedVector3Array=skin.last_positions
					var expected: Array=sample.geometry[layer_id].positions
					var surface: MeshInstance3D=card._surfaces.filter(func(s):return s.get_meta("layer_id","")==layer_id)[0]
					var base: Transform3D=surface.get_meta("character_base")
					var registration: float=surface.get_meta("registration",1.0)
					var placed: Dictionary=sample.placements[layer_id]
					assert(actual.size()*3==expected.size())
					for i in actual.size():
						var world := base*actual[i]
						var vertex_registration := registration-float(expected[i*3+2])/(2.7-.045)
						var pixel := Vector2(512+world.x/vertex_registration*1024,768-world.y/vertex_registration*1024)
						var target := Vector2(float(expected[i*3])*1024,-float(expected[i*3+1])*1024).rotated(float(placed.rotation))*float(placed.scale)+Vector2(512+float(placed.x),768+float(placed.y))
						max_vertex_error=maxf(max_vertex_error,pixel.distance_to(target))
						assert(pixel.distance_to(target)<.03)
						assert(absf(world.z-base.origin.z-float(expected[i*3+2]))<.00001)
				first_angle=false
			if not directory.is_empty():frame.save_png(directory.path_join("%s-%.3f-%d-%d.png"%[sample.action,sample.seconds,angle[0],angle[1]]))
			count+=1
	assert(ids==card._surfaces.map(func(s):return s.mesh.get_instance_id()))
	var paused := await capture(card,{"action":"trigger","seconds":.5},[20,12])
	for i in 6:await process_frame
	RenderingServer.force_draw(false)
	assert(paused.get_data()==capture_view.get_texture().get_image().get_data())
	assert(frame_hashes.size()>10)
	camera.position=Vector3(0,.52,2.7)
	camera.fov=8
	for action in ["blink","talk","emotion"]:
		for seconds in [0.0,.5,1.0,1.5,2.0]:
			var face := await capture(card,{"action":action,"seconds":seconds},[0,0])
			if not directory.is_empty():face.save_png(directory.path_join("face-%s-%.2f.png"%[action,seconds]))
	print(JSON.stringify({"status":"passed","rendered_frames":count,"face_frames":15,"meshes":card._native_meshes.size(),"max_vertex_pixel_error":max_vertex_error,"max_ik_error":max_ik_error,"pause_stable":true,"meshes_reused":true,"visual_acceptance":"requires review"}))
	quit(0)
