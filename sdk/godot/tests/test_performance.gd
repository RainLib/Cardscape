extends SceneTree
## Real exported card workload. Process-frame cadence is not physical presentation FPS.
var config: Dictionary
var library: CardscapeLibrary
var stage: Node3D
var cards: Array[CardscapeCard] = []
var failures: Array[String] = []
var count: int
var mode: String
var card_scale: float
var columns: int
var rows: int

func _initialize() -> void: call_deferred("run")
func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)

func snapshot() -> Dictionary:
	var particles := 0
	var event_nodes := 0
	var births := 0
	var tiers: Array[String] = []
	var profile: Dictionary = {}
	for card in cards:
		particles += int(card.diagnostics().particles)
		event_nodes += card._particle_event_states.size()
		births += card._particle_birth_cache.size()
		tiers.append(str(card.export_detail_state().level))
		var timings: Dictionary=card.get_meta("benchmark_update_us",{})
		for key in timings:profile[key]=int(profile.get(key,0))+int(timings[key])
	return {"nodes":get_node_count(),"objects":int(Performance.get_monitor(Performance.OBJECT_COUNT)),"resources":int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)),"orphans":int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)),"engine_static_bytes":int(Performance.get_monitor(Performance.MEMORY_STATIC)),"engine_video_bytes":int(Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)),"engine_texture_bytes":int(Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED)),"engine_buffer_bytes":int(Performance.get_monitor(Performance.RENDER_BUFFER_MEM_USED)),"draw_calls":RenderingServer.viewport_get_render_info(root.get_viewport_rid(),RenderingServer.VIEWPORT_RENDER_INFO_TYPE_VISIBLE,RenderingServer.VIEWPORT_RENDER_INFO_DRAW_CALLS_IN_FRAME),"particles":particles,"event_nodes":event_nodes,"birth_cache_entries":births,"shader_modes":library._surface_shader_cache.size(),"texture_requests":library._texture_requests.size(),"texture_consumers":library._texture_consumers.size(),"prepared_textures":library._prepared_textures.size(),"tiers":tiers,"update_profile_us":profile}

func create_cards(amount: int) -> void:
	for index in amount:
		var card := CardscapeCard.new()
		var definition := library.card(str(library.catalog().activeCardId))
		for action in definition.get("actions",[]):
			if action.id in ["cast","sweep",config.get("action","")]: action.loop=true
		if mode=="small":
			for key in ["smallParticles","smallMaterials","smallDecorations"]: definition.exportProfile.settings[key]=true
		card._embedded_definition=definition
		card.library=library
		card.card_id=str(library.catalog().activeCardId)
		card.detail_pixel_width=100000.0 if mode=="large" else 1.0 if mode=="small" else 0.0
		card.particle_budget=floori(128.0/count)
		card.scale=Vector3.ONE*card_scale
		card.position=Vector3((index%columns-(columns-1)/2.0)*1.15*card_scale,((rows-1)/2.0-floori(float(index)/columns))*1.7*card_scale,0)
		stage.add_child(card)
		cards.append(card)
	for frame in 6: await process_frame
	for index in cards.size():
		check(cards[index]._native_meshes.size()==9,"nine genuine skinned parts per card")
		var selected: String=str(config.get("action","alternating"))
		if selected=="alternating":selected="cast" if index%2==0 else "sweep"
		check(cards[index].play_action(selected,0),"real character action available")
		cards[index].inspect(float(index%3-1)*8.0,float(index%2)*5.0)

func wait_tier(target: String = "") -> void:
	var began := Time.get_ticks_msec()
	while Time.get_ticks_msec()-began<30000:
		var ready := true
		for card in cards:
			card._update(0.0)
			if target!="" and card.export_detail_state().level!=target:ready=false
		if ready and library._texture_requests.is_empty():
			for frame in 3: await process_frame
			await RenderingServer.frame_post_draw
			return
		await process_frame
	check(false,"complete texture tier did not settle: "+target)

func freeze() -> void:
	for card in cards:
		card.pause_action(true)
		card.effects_paused=true
		card.set_process(false)

func clocks() -> Array:
	return cards.map(func(card):return [card._clock,card._action_time])

func meshes() -> Array:
	return cards.map(func(card):return card._surfaces.map(func(surface):return surface.mesh.get_instance_id()))

func image_hash() -> String:
	for frame in 3: await process_frame
	await RenderingServer.frame_post_draw
	var digest := HashingContext.new()
	digest.start(HashingContext.HASH_SHA256)
	digest.update(root.get_texture().get_image().get_data())
	return digest.finish().hex_encode()

func free_cards() -> void:
	for card in cards: card.queue_free()
	cards.clear()
	for frame in 6: await process_frame
	# Some engine monitors refresh at up to one-second intervals.
	var settle_until := Time.get_ticks_msec()+1100
	while Time.get_ticks_msec()<settle_until:await process_frame

func summary(values: PackedFloat64Array, size: int, positive_only: bool = false) -> Dictionary:
	var selected := PackedFloat64Array()
	for index in size:
		if not positive_only or values[index]>0: selected.append(values[index])
	selected.sort()
	if selected.is_empty():return {"available":false,"samples":0}
	return {"available":true,"samples":selected.size(),"p50":selected[floori(selected.size()*.5)],"p95":selected[mini(selected.size()-1,floori(selected.size()*.95))],"max":selected[-1]}

func run() -> void:
	config=JSON.parse_string(FileAccess.get_file_as_string(OS.get_environment("CARDSCAPE_BENCHMARK_CONFIG")))
	count=int(config.get("count",1))
	mode=str(config.get("mode","adaptive"))
	root.size=Vector2i(1280,900)
	root.unfocusable=true
	Engine.max_fps=int(config.get("fps",30))
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	RenderingServer.set_default_clear_color(Color("#090d12"))
	library=load("res://library.tres") as CardscapeLibrary
	check(library!=null,"real exported library available")
	if not library:quit(1);return
	var original := library.data_json
	stage=Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.fov=CardscapeCard.preview_fov(root.size)
	camera.current=true
	var aspect := float(root.size.x)/root.size.y
	columns=mini(count,maxi(1,roundi(sqrt(count*aspect/(1.15/1.7)))))
	rows=ceili(float(count)/columns)
	var extent_y := 2.0*(2.7-.15)/2.9
	card_scale=minf(1.0,minf(extent_y*.85/(rows*1.8),extent_y*aspect*.85/(columns*1.3)))
	for frame in 3: await process_frame
	var baseline := snapshot()
	var created_at := Time.get_ticks_usec()
	await create_cards(count)
	await wait_tier(mode if mode in ["small","large"] else "")
	var create_ms := (Time.get_ticks_usec()-created_at)/1000.0
	var warm_began := Time.get_ticks_msec()
	var warm_frames := 0
	while warm_frames<60 or Time.get_ticks_msec()-warm_began<2000:
		await process_frame
		warm_frames+=1
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	var warm := snapshot()
	check(int(warm.draw_calls)>0,"real visible geometry is submitted")
	var seconds := float(config.get("seconds",8))
	var capacity := ceili((seconds+10)*Engine.max_fps*1.1)
	var intervals := PackedFloat64Array()
	var process_ms := PackedFloat64Array()
	var render_cpu_ms := PackedFloat64Array()
	var render_gpu_ms := PackedFloat64Array()
	intervals.resize(capacity)
	process_ms.resize(capacity)
	render_cpu_ms.resize(capacity)
	render_gpu_ms.resize(capacity)
	var samples: Array[Dictionary] = []
	var began := Time.get_ticks_usec()
	var previous := began
	var next_sample := began+1000000
	var frames := 0
	var max_particles := 0
	while Time.get_ticks_usec()-began<seconds*1000000:
		await process_frame
		var now := Time.get_ticks_usec()
		if frames>=capacity:check(false,"bounded frame sample capacity exceeded");break
		intervals[frames]=(now-previous)/1000.0
		previous=now
		process_ms[frames]=Performance.get_monitor(Performance.TIME_PROCESS)*1000.0
		render_cpu_ms[frames]=RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid())+RenderingServer.get_frame_setup_time_cpu()
		render_gpu_ms[frames]=RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid())
		frames+=1
		var particles := 0
		for card in cards: particles+=int(card.diagnostics().particles)
		max_particles=maxi(max_particles,particles)
		check(particles<=128,"whole-scene particle budget")
		if now>=next_sample:
			var point := snapshot()
			point.seconds=(now-began)/1000000.0
			point.frames=frames
			point.count=count
			point.mode=mode
			samples.append(point)
			var progress_file := FileAccess.open(OS.get_environment("CARDSCAPE_BENCHMARK_PROGRESS"),FileAccess.WRITE)
			progress_file.store_string(JSON.stringify(point))
			progress_file.close()
			next_sample=now+1000000
			if samples.size()%30==1:print("GODOT_PERF_PROGRESS "+JSON.stringify(point))
	var elapsed_ms := (Time.get_ticks_usec()-began)/1000.0
	freeze()
	var paused_clocks := clocks()
	var mesh_ids := meshes()
	for frame in 20: await process_frame
	check(clocks()==paused_clocks,"paused clocks stay frozen")
	var steady := snapshot()
	var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not directory.is_empty():root.get_texture().get_image().save_png(directory.path_join("board.png"))
	var swaps: Array[Dictionary] = []
	if int(config.get("swaps",0))>0:
		for card in cards:card.detail_pixel_width=100000
		await wait_tier("large")
		var reference := await image_hash()
		for cycle in int(config.swaps):
			for tier in ["small","large"]:
				for card in cards:card.detail_pixel_width=1 if tier=="small" else 100000
				await wait_tier(tier)
				check(clocks()==paused_clocks,"tier swaps preserve animation and effect clocks")
				check(meshes()==mesh_ids,"tier swaps reuse skinned meshes")
				if tier=="large":check(await image_hash()==reference,"large-tier GPU pixels reproduce exactly")
				swaps.append({"tier":tier,"state":snapshot()})
	# A fixed pose is separate from the measured playback window and supports
	# exact before/after pixel comparison despite different process startup times.
	for card in cards:
		card.detail_pixel_width=100000 if mode=="large" else 1 if mode=="small" else 0
		card.seek_action(.7,true)
		card.seek_effects(.7)
		card.seek_particle_reveal(.7)
	await wait_tier(mode if mode in ["small","large"] else "")
	var canonical_hash := await image_hash()
	if not directory.is_empty():root.get_texture().get_image().save_png(directory.path_join("canonical.png"))
	await free_cards()
	check(get_node_count()==int(baseline.nodes),"card nodes are released")
	var cycles: Array[Dictionary] = []
	for cycle in int(config.get("cycles",2)):
		await create_cards(count)
		await wait_tier(mode if mode in ["small","large"] else "")
		await free_cards()
		check(get_node_count()==int(baseline.nodes),"recreated card nodes are released")
		cycles.append(snapshot())
	check(library._texture_requests.is_empty() and library._texture_consumers.is_empty() and library._prepared_textures.is_empty(),"all temporary texture requests and consumers released")
	check(library.data_json==original,"shared source library remains immutable")
	var result := {"status":"passed" if failures.is_empty() else "failed","failures":failures,"count":count,"mode":mode,"action":str(config.get("action","alternating")),"seconds":seconds,"elapsed_ms":elapsed_ms,"frames":frames,"process_frame_fps":frames*1000.0/elapsed_ms,"max_fps":Engine.max_fps,"viewport":[root.size.x,root.size.y],"renderer":RenderingServer.get_video_adapter_name(),"rendering_method":RenderingServer.get_current_rendering_method(),"create_ms":create_ms,"frame_interval_ms":summary(intervals,frames),"process_monitor_ms":summary(process_ms,frames,true),"render_cpu_ms":summary(render_cpu_ms,frames,true),"render_gpu_ms":summary(render_gpu_ms,frames,true),"baseline":baseline,"warm":warm,"steady":steady,"snapshots":samples,"max_particles":max_particles,"swaps":swaps,"recreate_cycles":cycles,"canonical_hash":canonical_hash,"released":snapshot(),"scope":"Real Godot Compatibility frames; engine monitors are not driver VRAM and process-frame cadence is not presentation FPS. Unsupported zero timers are unavailable."}
	var file := FileAccess.open(OS.get_environment("CARDSCAPE_BENCHMARK_OUTPUT"),FileAccess.WRITE)
	file.store_string(JSON.stringify(result))
	file.close()
	print(JSON.stringify({"status":result.status,"count":count,"mode":mode,"frames":frames,"fps":result.process_frame_fps,"failures":failures}))
	quit(0 if failures.is_empty() else 1)
