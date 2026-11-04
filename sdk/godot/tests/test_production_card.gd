extends SceneTree
## Executes against the actual editor export, using independently sampled JS
## geometry. Captures real GPU frames; never substitutes the baked cover.
var failures: Array[String] = []
var max_error: float = 0.0
var max_particle_error: float = 0.0
var captures: int = 0
var particle_error_label: String=""
var max_alpha_quantization: float=0.0
func particle_error(actual: float, expected: float, label: String) -> void:
	var error:=absf(actual-expected)
	if error>max_particle_error:
		max_particle_error=error
		particle_error_label=label+" actual="+str(actual)+" expected="+str(expected)
func check(value: bool, message: String) -> void:
	if not value: failures.append(message)
func _initialize() -> void: call_deferred("run")
func capture(name: String) -> void:
	for i in 3: await process_frame
	await RenderingServer.frame_post_draw
	var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not directory.is_empty():
		check(root.get_texture().get_image().save_png(directory.path_join(name+".png"))==OK,"capture saved: "+name)
		captures+=1
func run() -> void:
	root.transparent_bg = true
	var library = load("res://library.tres") as CardscapeLibrary
	check(library != null, "real exported library loads")
	if not library: quit(1); return
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	stage.add_child(camera)
	camera.position.z = 2.7
	camera.fov = CardscapeCard.preview_fov(root.size)
	camera.current = true
	var card := CardscapeCard.new()
	card.library = library
	card.card_id = library.catalog().activeCardId
	card.effects_paused = true
	stage.add_child(card)
	for i in 6: await process_frame
	check(card._character_compiled.order.size() == 9, "nine source bones preserved")
	check(card._native_meshes.size() == 9, "all painted parts remain independently skinned")
	var ids: Array = card._surfaces.map(func(s): return s.mesh.get_instance_id())
	var reference: Array = JSON.parse_string(FileAccess.get_file_as_string("res://tests/production-reference.json"))
	for sample in reference:
		check(card.play_action(sample.id), "action available: "+str(sample.id))
		card.seek_action(float(sample.seconds), true)
		for id in sample.geometry:
			check(card._native_meshes.has(id), "native mesh: "+str(id))
			if not card._native_meshes.has(id): continue
			var actual: PackedVector3Array = card._native_meshes[id].last_positions
			var expected: Array = sample.geometry[id]
			check(actual.size()*3 == expected.size(), "vertex count: "+str(id))
			for i in actual.size():
				for axis in 3: max_error = maxf(max_error, absf(actual[i][axis]-float(expected[i*3+axis])))
		for id in sample.get("particles",{}):
			var key: String=str(sample.id)+":"+str(id)
			check(card._particle_event_states.has(key), "particle event allocated: "+key)
			if not card._particle_event_states.has(key): continue
			var state: Dictionary=card._particle_event_states[key]
			var expected: Array=sample.particles[id]
			if sample.get("trails",{}).has(id):
				var actual: Array=state.get("trail_samples",[])
				check(actual.size()*7==expected.size(),"ribbon cross sections match: "+key)
				for i in mini(actual.size(),expected.size()/7):
					for axis in 7:max_particle_error=maxf(max_particle_error,absf(float(actual[i][axis])-float(expected[i*7+axis])))
				if sample.get("trailGeometry",{}).has(id):
					var packed: Array=sample.trailGeometry[id]
					var arrays: Array=state.trail.mesh.surface_get_arrays(0)
					var vertices: PackedVector3Array=arrays[Mesh.ARRAY_VERTEX]
					var uv: PackedVector2Array=arrays[Mesh.ARRAY_TEX_UV]
					var alpha: PackedVector2Array=arrays[Mesh.ARRAY_TEX_UV2]
					check(vertices.size()*10==packed.size(),"connected ribbon triangle count: "+key)
					for i in mini(vertices.size(),packed.size()/10):
						for axis in 3:max_particle_error=maxf(max_particle_error,absf(vertices[i][axis]-float(packed[i*10+axis])))
						max_particle_error=maxf(max_particle_error,absf(uv[i].x-float(packed[i*10+8])))
						max_particle_error=maxf(max_particle_error,absf(uv[i].y-float(packed[i*10+9])))
						max_particle_error=maxf(max_particle_error,absf(alpha[i].x-float(packed[i*10+4])))
				continue
			check(int(state.count)*7==expected.size(), "particle event count matches: "+key)
			for i in mini(int(state.count),expected.size()/7):
				var transform: Transform3D=state.node.multimesh.get_instance_transform(i)
				for axis in 3:max_particle_error=maxf(max_particle_error,absf(transform.origin[axis]-float(expected[i*7+axis])))
				if str(sample.id) in ["world-cast","collision-cast"]:
					check(state.node.top_level and state.node.transform.is_equal_approx(Transform3D.IDENTITY),"world emitter bypasses current visual root")
					particle_error(transform.basis.y.length()*.5,float(expected[i*7+3]),key+" size "+str(sample.seconds)+"/"+str(i))
					var alpha: float=state.world_alphas[i]
					particle_error(alpha,float(expected[i*7+4]),key+" CPU alpha "+str(sample.seconds)+"/"+str(i))
					var packed_alpha: float=alpha
					if RenderingServer.get_current_rendering_method()=="gl_compatibility":
						var half:=PackedByteArray()
						half.resize(2)
						half.encode_half(0,alpha)
						packed_alpha=half.decode_half(0)
					check(is_equal_approx(state.node.multimesh.get_instance_color(i).a,packed_alpha),"GPU alpha matches backend storage precision")
					max_alpha_quantization=maxf(max_alpha_quantization,absf(packed_alpha-alpha))
				if float(expected[i*7+4])==0:check(state.node.multimesh.get_instance_color(i).a==0,"cutoff particles do not respawn: "+key)
		check(card._particle_count+card._particle_event_count<=128, "ambient and event particles share budget")
	check(max_error < .00001, "Godot geometry matches independent WebGL reference: "+str(max_error))
	check(max_particle_error < .00001, "bone-follow particle positions match independent reference: "+str(max_particle_error)+" "+particle_error_label)
	var angles := [[0,0],[-20,0],[20,0],[0,-12],[0,12],[-20,-12],[-20,12],[20,-12],[20,12]]
	for action in ["idle", "sweep", "cast", "enter", "exit", "world-cast", "collision-cast"]:
		card.play_action(action)
		card.seek_action(float(card._action.duration)*.5, true)
		for angle in angles:
			card.inspect(angle[0],angle[1])
			await capture(action+"-"+str(angle[0])+"-"+str(angle[1]))
	card.inspect(0,0)
	card.play_action("sweep")
	card.seek_action(1.2,true)
	var ribbon: Dictionary=card._particle_event_states["sweep:blade-ribbon"]
	var ribbon_id: int=ribbon.trail.mesh.get_instance_id()
	var ribbon_positions: PackedVector3Array=ribbon.trail_positions.duplicate()
	card.seek_action(.6,true)
	card.seek_action(1.2,true)
	check(ribbon_positions==ribbon.trail_positions,"ribbon reverse seek is deterministic")
	check(ribbon_id==ribbon.trail.mesh.get_instance_id(),"ribbon seeks reuse the mesh")
	for i in 3:await process_frame
	check(ribbon_positions==ribbon.trail_positions,"ribbon pause freezes geometry")
	var trail_state: Dictionary=card._particle_event_states["sweep:blade-trail"]
	var trail_transform: Transform3D=trail_state.node.multimesh.get_instance_transform(0)
	check(not card._particle_birth_cache.is_empty(),"card-space trail samples birth poses")
	check(card._particle_birth_cache.size()<=512,"birth pose cache has a fixed upper bound")
	card.seek_action(.4,true)
	card.seek_action(1.2,true)
	check(trail_transform.is_equal_approx(card._particle_event_states["sweep:blade-trail"].node.multimesh.get_instance_transform(0)),"card-space trail reconstructs exact positions after reverse seek")
	var before: Dictionary = card._native_meshes.duplicate()
	var positions: PackedVector3Array = before["left-forearm"].last_positions.duplicate()
	card.play_action("cast")
	card._update(0)
	check(positions == card._native_meshes["left-forearm"].last_positions, "transition begins at visible grip geometry")
	card._transition.seconds = .15
	card._action_time = 1.4
	card.pause_action(true)
	var event_positions: Dictionary={}
	for key in card._particle_event_states:
		var state: Dictionary=card._particle_event_states[key]
		if state.node.visible and state.get("count",0)>0:event_positions[key]=state.node.multimesh.get_instance_transform(0)
	check(event_positions.size()==2,"paused cast has both charge and burst groups")
	positions = card._native_meshes["left-forearm"].last_positions.duplicate()
	for i in 3: await process_frame
	for key in event_positions:check(event_positions[key].is_equal_approx(card._particle_event_states[key].node.multimesh.get_instance_transform(0)),"paused action particles are stable")
	check(positions == card._native_meshes["left-forearm"].last_positions, "paused transition freezes grip")
	card.play_action("idle")
	card._update(0)
	check(positions == card._native_meshes["left-forearm"].last_positions, "interruption preserves current pose")
	check(ids == card._surfaces.map(func(s): return s.mesh.get_instance_id()), "actions reuse GPU meshes")
	var cast: Dictionary=card._definition.actions.filter(func(a):return a.id=="cast")[0]
	var original_events: Array=cast.particleEvents.duplicate(true)
	cast.particleEvents=[]
	for i in 16:
		var event: Dictionary=original_events[0].duplicate(true)
		event.id="stress-"+str(i)
		event.at=0.0
		event.duration=2.8
		cast.particleEvents.append(event)
	card.play_action("cast",0)
	card.seek_action(1.4,true)
	check(card._particle_event_states.size()<=16,"event node pool remains bounded")
	check(card._particle_count+card._particle_event_count<=128,"sixteen groups share total budget")
	var pooled: Dictionary={}
	for key in card._particle_event_states:pooled[key]=card._particle_event_states[key].node.get_instance_id()
	card.seek_action(.5,true)
	for key in pooled:check(pooled[key]==card._particle_event_states[key].node.get_instance_id(),"seeking reuses event nodes")
	card.play_action("enter",0)
	card.seek_action(.3,true)
	card.play_action("cast",0)
	card.seek_action(.5,true)
	check(card._particle_event_states.size()==16,"inactive pool eviction preserves all active cues")
	check(card._particle_event_count>0,"events still draw after pool eviction")
	for event in cast.particleEvents:
		event.trail={"duration":.3,"segments":64}
		event.emissionDuration=2.8
	card.seek_action(.5,true)
	check(card._particle_count+card._particle_event_count<=128,"sixteen connected ribbons share the same budget")
	var ribbon_meshes: Array=[]
	for state in card._particle_event_states.values():
		check(state.has("trail") and state.trail.visible,"ribbon pool replaces old particle draws")
		check(not state.node.visible,"ordinary particles are hidden in ribbon mode")
		ribbon_meshes.append(state.trail.mesh.get_instance_id())
	card.seek_action(.8,true)
	check(ribbon_meshes==card._particle_event_states.values().map(func(s):return s.trail.mesh.get_instance_id()),"ribbon pool reuses meshes under repeated seeking")
	var saved_budget: int=card.particle_budget
	card.particle_budget=8
	card.seek_action(.5,true)
	check(card._particle_event_count==0,"zero per-group budget suppresses ribbons")
	card.particle_budget=saved_budget
	cast.particleEvents=original_events
	card.seek_action(0,true)
	card.flip_to_back()
	await capture("back")
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed", "failures":failures, "maxGeometryError":max_error,"maxParticleError":max_particle_error,"maxAlphaStorageError":max_alpha_quantization, "samples":reference.size(), "captures":captures, "surfaces":ids.size()}))
	quit(0 if failures.is_empty() else 1)
