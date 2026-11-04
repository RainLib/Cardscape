extends SceneTree
## Real exported artwork; live game placement, pause, loops, callbacks and cleanup.
var failures: Array[String]=[]
var sampler_times: Array[float]=[]
func _initialize() -> void:call_deferred("run")
func check(value: bool, message: String) -> void:
	if not value:failures.append(message)
func state(card: CardscapeCard) -> Array:
	var result: Array=[]
	for key in ["world-cast:world-palm","world-cast:world-ribbon","world-cast:world-cosmic"]:
		var entry: Dictionary=card._particle_event_states.get(key,{})
		if entry.is_empty():continue
		if entry.has("trail"):
			result.append(entry.trail_samples.duplicate(true))
		else:
			var instances: Array=[]
			for i in int(entry.count):
				instances.append([entry.node.multimesh.get_instance_transform(i),entry.node.multimesh.get_instance_color(i),entry.node.multimesh.get_instance_custom_data(i)])
			result.append(instances)
	return result
func capture(name: String) -> void:
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	var directory:=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not directory.is_empty():check(root.get_texture().get_image().save_png(directory.path_join(name+".png"))==OK,"save "+name)
func shifted_sampler(action_id: String, seconds: float, fallback: Dictionary) -> Dictionary:
	check(action_id=="world-cast","sampler identifies the action")
	sampler_times.append(seconds)
	var transform: Transform3D=fallback.transform
	transform.origin.x+=.25
	return {"transform":transform,"opacity":fallback.opacity}
func run() -> void:
	var baseline:=get_node_count()
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
	card.detail_pixel_width=100000
	card.effects_paused=true
	scene.add_child(card)
	for frame in 6:await process_frame
	card.set_process(false)
	check(card.play_action("world-cast",0),"real world-space action available")
	for frame in 28:
		var seconds:=frame/30.0
		card.position=Vector3(seconds*.12,seconds*.03,0)
		card.seek_action(seconds,true)
	var before:=state(card)
	check(before.size()==3,"ordinary, ribbon and Cosmic groups are all exercised")
	await capture("before-game-move")
	card.position+=Vector3(.3,.1,0)
	card.scale=Vector3.ONE*.85
	card.inspect(35,15)
	check(state(card)==before,"moving, rotating and scaling a paused card preserves world particles")
	for entry in card._particle_event_states.values():
		if entry.node.visible:check(entry.node.top_level,"ordinary world nodes bypass the card parent")
		if entry.front:
			check(entry.front.top_level,"Cosmic front bypasses the card parent")
			check((entry.front.material_override as ShaderMaterial).get_shader_parameter("world_space")==true,"Cosmic offset uses the frozen per-birth world scale")
		if entry.has("trail"):check(entry.trail.top_level,"world ribbon bypasses the card parent")
	await capture("after-game-move")
	card.seek_action(.4,true)
	card.seek_action(.9,true)
	check(state(card)==before,"reverse seeks reproduce recorded placement exactly")
	card.set_particle_world_sampler(shifted_sampler)
	card._update(0)
	var shifted:=state(card)
	check(not sampler_times.is_empty() and shifted!=before,"custom game history sampler is used")
	for group in [0,2]:
		for i in before[group].size():
			var a: Transform3D=before[group][i][0]
			var b: Transform3D=shifted[group][i][0]
			check((b.origin-a.origin).is_equal_approx(Vector3(.25,0,0)),"game sampler shifts actual instance centers")
	card.set_particle_world_sampler(Callable())
	card._update(0)
	check(state(card)==before,"removing sampler restores recorded world placement")
	card._action.loop=true
	card.play_action("world-cast",0)
	card._action_time=float(card._action.duration)*2+.9
	card._paused=false
	card._update(0)
	var loop_state:=state(card)
	card.pause_action(true)
	check(state(card)==loop_state,"pausing a later loop retains its world birth cycle")
	await capture("paused-later-loop")
	var history:=CardscapeCard.ParticleWorldHistory.new()
	history.record(0,Transform3D.IDENTITY,Vector3(0,deg_to_rad(359),0),1.0)
	history.record(1,Transform3D(Basis.IDENTITY,Vector3(2,4,6)),Vector3(0,deg_to_rad(1),0),.5)
	var middle: Dictionary=history.sample(.5)
	check((middle.transform as Transform3D).origin.is_equal_approx(Vector3(1,2,3)) and is_equal_approx(float(middle.opacity),.75),"game placement and opacity interpolate at the actual birth time")
	check(absf(sin((middle.pose as Vector3).y))<.00001,"inspection interpolation takes the short angular path")
	history.clear()
	for frame in 10000:history.record(frame/30.0,Transform3D.IDENTITY,Vector3.ZERO,1.0)
	check(history.points.size()<=1023,"root history is bounded during long playback")
	var latest: Dictionary=history.sample(10000)
	history.record(0,Transform3D(Basis.IDENTITY,Vector3.ONE),Vector3.ZERO,1.0)
	check(history.sample(10000)==latest,"backward observations cannot rewrite history")
	history.clear()
	check(history.sample(0).is_empty(),"history clear releases all samples")
	check(card._particle_event_count+card._particle_count<=128,"world events retain whole-card budget")
	scene.queue_free()
	for frame in 6:await process_frame
	check(get_node_count()==baseline,"top-level effects are still owned and released by their card")
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"groups":before.size(),"samplerCalls":sampler_times.size(),"historyLimit":1024,"captures":3}))
	quit(0 if failures.is_empty() else 1)
