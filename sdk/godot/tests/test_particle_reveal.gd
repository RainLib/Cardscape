extends SceneTree
func _initialize() -> void:
	call_deferred("_run")
func _run() -> void:
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library != null)
	var reference: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/reveal-reference.json"))
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	definition.get("componentScenes",{}).erase("particles")
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.current=true
	var card := CardscapeCard.new()
	card.library=library
	card._embedded_definition=definition
	card.particle_settings=reference.config
	card.particle_budget=128
	card.effects_paused=true
	stage.add_child(card)
	for i in 4:await process_frame
	var batch := card._particle_node.multimesh
	for sample in reference.frames:
		card.particle_settings=sample.get("config",reference.config)
		card.seek_effects(float(sample.time))
		card.seek_particle_reveal(float(sample.age))
		assert(card._particle_node.multimesh==batch)
		assert(card._particle_count==sample.count)
		if sample.get("config",{}).get("visual","")=="cosmic":
			assert(card._particle_front_node != null)
			assert(card._particle_front_node.multimesh==batch)
			assert(card._particle_front_node.visible)
			assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("cosmic_pass")==-1.0)
			assert((card._particle_front_node.material_override as ShaderMaterial).get_shader_parameter("cosmic_pass")==1.0)
		if sample.get("config",{}).get("visual","")=="wakanda":
			assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual")==20)
			assert(card._particle_front_node == null or not card._particle_front_node.visible)
		if sample.get("config",{}).get("visual","")=="adamantium":
			assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual")==25)
			assert(card._particle_front_node == null or not card._particle_front_node.visible)
		if sample.get("config",{}).get("visual","")=="bubble":
			assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual")==8)
			assert(card._particle_front_node == null or not card._particle_front_node.visible)
		if sample.get("config",{}).get("visual","")=="banana":
			assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual")==13)
			assert(card._particle_node.multimesh.instance_count==256)
		if sample.get("config",{}).get("visual","") in ["diamond","streak"]:
			assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual")==7 if sample.config.visual=="diamond" else (card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual")==3)
			assert(card._particle_node.multimesh.instance_count==256)
			assert(is_equal_approx((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("particle_speed"),float(sample.config.speed)))
		var icon_index := ["flower","paw","pizza"].find(sample.get("config",{}).get("visual",""))
		if icon_index>=0:
			assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual")==21+icon_index)
			assert(card._particle_front_node == null or not card._particle_front_node.visible)
		for i in sample.count:
			var at: Array = sample.samples.slice(i*7,i*7+7)
			var transform := batch.get_instance_transform(i)
			assert(transform.origin.distance_to(Vector3(at[0],at[1],at[2]))<.0001,JSON.stringify({"config":sample.get("config",reference.config),"time":sample.time,"index":i,"actual":[transform.origin.x,transform.origin.y,transform.origin.z],"expected":at.slice(0,3)}))
			var custom := batch.get_instance_custom_data(i)
			var kind := roundi(custom.b*32)-1 if custom.b>.01 else -1
			assert(kind==sample.visuals[i])
			# Custom angles must retain a full turn, including negative idle angles.
			assert(absf(sin(custom.g-at[5]))<.008)
			assert(absf(cos(custom.g-at[5])-1.0)<.008)
			assert(absf(batch.get_instance_color(i).a-at[4])<.008)
			assert(absf(transform.basis.y.length()-at[3]*2)<.0001)
		var before := batch.get_instance_transform(0)
		await process_frame
		await process_frame
		assert(batch.get_instance_transform(0).is_equal_approx(before))
		if sample.has("capture"):
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(str(sample.capture))
	card.particle_settings=reference.config
	card.seek_effects(100.0)
	assert(card._particle_front_node != null and not card._particle_front_node.visible)
	card.play_particle_reveal()
	assert(card._particle_reveal_count==44)
	for child in card._component_nodes.values():
		assert(child._particle_reveal_started==card._particle_reveal_started)
	for budget in [1,8,16,32,128,256]:
		card.particle_budget=budget
		card.seek_particle_reveal(.09)
		assert(card._particle_count<=budget)
		assert(card._particle_reveal_count>0)
	card.inspect(180)
	assert(card._particle_count==0)
	await process_frame
	assert(card._particle_count==0)
	card.inspect(0)
	card.effects_playing=false
	card.seek_particle_reveal(0)
	assert(card._particle_count==0)
	print(JSON.stringify({"status":"passed","reveal_and_idle":true,"cross_renderer_samples":true,"pause":true,"one_shot":true,"shared_budget":true,"component_clock":true,"front_only":true,"fixed_batch":true,"cosmic_shared_batch":true,"cosmic_legacy_switch":true,"wakanda_shapes_regions_and_clock":true,"adamantium_shapes_regions_and_clock":true,"bubble_regions_directions_zero_radius_and_clock":true,"banana_shapes_directions_zero_radius_and_clock":true,"diamond_regions_directions_zero_radius_and_clock":true,"source_glyph_reveal":true,"trails_empty_after_reveal":true,"zero_speed":true}))
	stage.queue_free()
	await process_frame
	quit(0)
