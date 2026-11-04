extends SceneTree
var failures: Array[String]=[]
func check(value: bool, message: String) -> void:
	if not value:failures.append(message)
func _initialize() -> void:call_deferred("run")

func capture(card: CardscapeCard, seconds: float) -> Image:
	card.seek_action(seconds,true)
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func pixel(image: Image, camera: Camera3D, x: float, y: float) -> Color:
	var p: Vector2=camera.unproject_position(Vector3(x/1024.0-.5,.75-y/1024.0,.045))
	return image.get_pixel(roundi(p.x),roundi(p.y))

func run() -> void:
	root.transparent_bg=true
	var library=load("res://library.tres") as CardscapeLibrary
	check(library!=null,"library loads")
	if not library:quit(1);return
	var stage=Node3D.new()
	root.add_child(stage)
	var camera=Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.fov=CardscapeCard.preview_fov(root.size)
	camera.current=true
	var card=CardscapeCard.new()
	card.library=library
	card.card_id=library.catalog().activeCardId
	card.effects_paused=true
	stage.add_child(card)
	for i in 6:await process_frame
	var helper=load("res://addons/cardscape/character_animation.gd")
	var compiled: Dictionary=helper.compile(card._definition.characterRig)
	var initial: Dictionary=helper.snapshot(compiled,card._definition.actions[0],.1)
	var target: Dictionary=helper.snapshot(compiled,card._definition.actions[1],.2)
	var mixed: Dictionary=helper.blend_actions(initial,target,.5)
	check(absf(float(mixed.tracks.x[0].value)-44.0)<.00001,"root transition matches WebGL sampling")
	check(absf(float(mixed.boneTracks.elbow.rotation[0].value)+18.0)<.00001,"local bone transition matches WebGL sampling")
	initial.deformTracks={"sample":{"root":[{"at":0.0,"deltas":[2,12.0,-8.0]}]}}
	mixed=helper.blend_actions(initial,target,.5)
	var deforms: Dictionary=helper.Deformation.deforms(mixed,0.0)
	check((deforms.sample.root[2] as Vector2).is_equal_approx(Vector2(6,-4)),"FFD transition keeps sparse vertex indices")
	check(card._contour_counts==Vector2(9,18),"contours reach materials")
	card.play_action("idle")
	var first: Image=await capture(card,.2)
	var second: Image=await capture(card,1.2)
	for image in [first,second]:
		check(pixel(image,camera,0,0).a<.05,"outer corners are transparent")
		check(pixel(image,camera,990,700).a<.05,"concave notch is transparent")
		var bridge: Color=pixel(image,camera,512,740)
		check(bridge.g>bridge.r+.15 and bridge.g>bridge.b+.15,"frame bridges both windows")
	var blue: Color=pixel(first,camera,512,420)
	var red: Color=pixel(second,camera,512,420)
	check(blue.b>blue.r+.3 and red.r>red.b+.3,"animated order changes upper window pixels")
	blue=pixel(first,camera,512,1100)
	red=pixel(second,camera,512,1100)
	check(blue.b>blue.r+.3 and red.r>red.b+.3,"animated order changes lower window pixels")
	var ids: Array=card._surfaces.map(func(s):return s.mesh.get_instance_id())
	card.seek_action(.2,true)
	var before: Transform3D=card._surfaces.filter(func(s):return s.get_meta("layer_id","")=="forearm")[0].transform
	card.play_action("raise")
	card._update(0)
	var source: Transform3D=card._surfaces.filter(func(s):return s.get_meta("layer_id","")=="forearm")[0].transform
	check(before.is_equal_approx(source),"transition starts at the visible pose")
	card._transition.seconds=.2
	card._action_time=.2
	card._update(0)
	card.pause_action(true)
	var paused: Array=card._surfaces.map(func(s):return s.transform)
	for i in 3:await process_frame
	check(paused==card._surfaces.map(func(s):return s.transform),"paused transition is stable")
	card._definition.actions[0].transitionDuration=.4
	card.play_action("idle")
	card._update(0)
	check(paused==card._surfaces.map(func(s):return s.transform),"interruption is continuous")
	card._transition.seconds=.4
	card._update(0)
	check(card._transition.is_empty(),"transition completes")
	check(ids==card._surfaces.map(func(s):return s.mesh.get_instance_id()),"order and transitions reuse meshes")
	card.play_action("idle")
	card.seek_action(.2,true)
	card.flip_to_back()
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	var back: Image=root.get_texture().get_image()
	check(pixel(back,camera,0,0).a<.05,"back preserves the outer silhouette")
	card.inspect(0,0)
	card._definition.exportProfile={"settings":{"preset":"source","adaptive":false}}
	card._definition.actions[1].tracks.scale=[{"at":0.0,"value":2.0}]
	card.play_action("idle")
	card.seek_action(0,true)
	card.play_action("raise")
	card._transition.seconds=.2
	card._action_time=.2
	card._update(0)
	check(absf(card._detail_pixels-card._projected_detail_width())<.001,"detail tier uses the blended root scale")
	var captures=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not captures.is_empty():
		first.save_png(captures.path_join("irregular-first.png"))
		second.save_png(captures.path_join("irregular-second.png"))
		back.save_png(captures.path_join("irregular-back.png"))
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"surfaces":ids.size(),"contour_edges":18}))
	quit(0 if failures.is_empty() else 1)
