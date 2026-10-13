extends SceneTree
func _initialize() -> void:
	call_deferred("_run")
func _run() -> void:
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library != null)
	var definition := library.card(library.catalog().activeCardId)
	assert(definition.cosmetics.level == "infinity")
	assert(definition.frameStyle.animation == "infinity")
	assert(definition.material.style == "gold")
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	stage.add_child(camera)
	camera.position.z = 2.7
	camera.current = true
	var card := CardscapeCard.new()
	card.library=library
	card.card_id=library.catalog().activeCardId
	card.particle_budget=16
	stage.add_child(card)
	for i in 4:
		await process_frame
	assert(card.diagnostics().particles == 16)
	if definition.material.has("document"):
		assert(definition.material.document.layers.size()==1)
		assert(not definition.material.document.layers[0].has("src"))
		assert(library.texture(definition.material.document.layers[0].asset)!=null)
		var overlay := card._visual.get_node("material-texture") as MeshInstance3D
		assert(overlay != null)
		assert((overlay.material_override as ShaderMaterial).render_priority == -90)
	card.inspect(20,13)
	var expected := Basis(Vector3.RIGHT,deg_to_rad(13.0))*Basis(Vector3.UP,deg_to_rad(20.0))
	assert((card._visual.basis*Vector3(.2,.3,.1)).distance_to(expected*Vector3(.2,.3,.1))<.00001)
	assert(absf(CardscapeCard.preview_fov(Vector2(960,900))-38.051212)<.0001)
	assert(CardscapeCard.preview_fov(Vector2(400,900))>CardscapeCard.preview_fov(Vector2(960,900)))
	card.inspect(0)
	card.material_settings={"style":"ink","target":"artwork","backgroundMode":"replace"}
	await process_frame
	for surface in card._surfaces:
		if not surface.get_meta("reverse",false):
			var m := surface.material_override as ShaderMaterial
			assert(m.get_shader_parameter("material_style")==5)
			assert((m.get_shader_parameter("component_material") as Vector4).w==4)
			if surface.get_meta("material_overlay",false):
				assert(m.get_shader_parameter("material_replace")==0.0)
	var material_styles := ["iridescent","holographic","foil","prism","gold","ink","copper","steel","goldprism","blackprism","cosmic","glass","fire","water","rays","refraction","psychedelic","foilmetallic","goldmetallic","gildedprism","glasscircuits","wakandanglass","galacticstorm","bananas","symbiote"]
	for style in material_styles:
		card.material_settings={"style":style,"target":"background","backgroundMode":"replace"}
		await process_frame
		for surface in card._surfaces:
			if not surface.get_meta("reverse",false):
				assert((surface.material_override as ShaderMaterial).get_shader_parameter("material_style")==material_styles.find(style))
	card.material_settings={}
	var frame_finishes := ["flat","metal","glow","cosmic","distressed","web","candy","ice","snow","wrapping","fire","fire-iridescent"]
	var aura := card._visual.get_node("frame-aura") as MeshInstance3D
	assert(aura != null)
	assert((aura.material_override as ShaderMaterial).get_shader_parameter("frame_part")==2.0)
	for finish in frame_finishes:
		card._definition.frameStyle.finish=finish
		for i in 2: await process_frame
		assert(aura.visible==(finish in ["glow","cosmic","ice","fire","fire-iridescent"]))
		for surface in card._surfaces:
			if str(surface.get_meta("layer_id","")).begins_with("frame-"):
				assert((surface.material_override as ShaderMaterial).get_shader_parameter("frame_finish")==frame_finishes.find(finish))
	card.effects_paused=true
	card.seek_effects(3.25)
	for i in 2: await process_frame
	assert(card._clock==3.25)
	card.effects_paused=false
	var batch := card._particle_node.multimesh
	assert(batch.instance_count == 256)
	for visual in ["dust","glimmer","krackle","streak","ember","snow","confetti","diamond","bubble","orb","mixed","tech","banana","pixel","heart","leaf","tone","shard","cosmic"]:
		card.particle_settings={"visual":visual,"palette":"rainbow"}
		await process_frame
		assert(card._particle_node.multimesh == batch)
		assert(card.diagnostics().particles == 16)
		assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual") == ["dust","glimmer","krackle","streak","ember","snow","confetti","diamond","bubble","sprite","orb","mixed","tech","banana","pixel","heart","leaf","tone","shard","cosmic"].find(visual))
	card.particle_settings={"visual":"heart","placement":"front","trajectory":"float","z":.25,"blend":"normal","emitter":{"target":"card","shape":"rect","u":.3,"v":.4,"width":.2,"height":.25,"side":"front"}}
	await process_frame
	assert((card._particle_node.material_override as ShaderMaterial).render_priority==120)
	assert("depth_test_disabled" in (card._particle_node.material_override as ShaderMaterial).shader.code)
	for clock_value in [0.0,12.0,3600.0]:
		card._clock=clock_value
		card._update_particles(1.0,true)
		for i in 16:
			var p := batch.get_instance_transform(i).origin
			assert(absf(p.x+.2)<=.1001 and absf(p.y-.15)<=.1876)
	card.particle_settings={"placement":"behind"}
	await process_frame
	assert((card._particle_node.material_override as ShaderMaterial).render_priority < -100)
	# A behind batch must render before every card surface, including transparent cloth.
	var behind_material := card._particle_node.material_override as ShaderMaterial
	for surface in card._surfaces:
		assert(behind_material.render_priority < (surface.material_override as ShaderMaterial).render_priority)
	card.particle_settings={"emitter":{"target":"card","regionId":"missing"}}
	await process_frame
	assert(card.diagnostics().particles == 0)
	card.particle_settings={"emitter":{"target":"card","shape":"point","u":.5,"v":.5,"direction":"up"},"visual":"krackle"}
	await process_frame
	assert(card.diagnostics().particles == 16)
	var sprite_image := Image.create(32,32,false,Image.FORMAT_RGBA8)
	sprite_image.fill(Color.WHITE)
	library.textures["test-sprite"]=ImageTexture.create_from_image(sprite_image)
	card.particle_settings={"visual":"sprite","sprite":"test-sprite","blend":"normal","spriteTint":true}
	await process_frame
	assert(card.diagnostics().particles==16)
	assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("sprite_tex")!=null)
	assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("sprite_tint")==true)
	# High speed and long lifetime cannot push a halo away from its rim.
	card.particle_settings={"enabled":true,"trajectory":"halo","radius":.055,"opacity":.6,"speed":2.0,"lifetime":12.0,"spread":2.0,"visual":"mixed","emitter":{"target":"card","shape":"perimeter","u":.5,"v":.5,"width":1.0,"height":1.0,"regionId":"","layerId":"","side":"both"}}
	var path := card._halo_path(card.particle_settings.emitter,float(definition.frameStyle.get("corner",48))/1024.0,.055)
	var gpu_available := DisplayServer.get_name()!="headless"
	for clock_value in ([0.0,.3,12.0,100.0,86400.0] if gpu_available else []):
		card._clock=clock_value
		card._update_particles(1.0,true)
		assert(card._particle_node.multimesh==batch)
		for i in 16:
			var position := batch.get_instance_transform(i).origin
			var distance := INF
			for segment in path.segments:
				var a: Vector2 = segment.origin
				var b: Vector2 = segment.origin+segment.delta
				var nearest := Geometry2D.get_closest_point_to_segment(Vector2(position.x,position.y),a,b)
				distance=minf(distance,nearest.distance_to(Vector2(position.x,position.y)))
			assert(distance<=.05501)
			assert(batch.get_instance_color(i).a<=.601)
			# Compatibility backends may quantize custom colors to eight bits.
			assert(absf(batch.get_instance_custom_data(i).r-card._hash(i,int(definition.particles.get("seed",1))))<=1.0/255.0+.00001)
	card.effects_playing=false
	await process_frame
	assert(card.diagnostics().particles == 0)
	print(JSON.stringify({"status":"passed","level":"infinity","particle_shapes":18,"material_styles":material_styles.size(),"frame_finishes":frame_finishes.size(),"effect_clock":true,"projection_and_rotation":true,"halo_bound":gpu_available,"custom_seeds":gpu_available,"particle_budget":16,"fixed_instances":256,"missing_region_hidden":true,"effects_disabled":true,"material_scope":true,"material_images":definition.material.has("document")}))
	stage.queue_free()
	await process_frame
	quit(0)
