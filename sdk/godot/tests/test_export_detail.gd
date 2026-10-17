extends SceneTree
var failures: Array[String]=[]
func _initialize() -> void:call_deferred("run")
func check(condition: bool,message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)
func settle(card: CardscapeCard,level: String) -> void:
	for i in 180:
		await process_frame
		if card.export_detail_state().level==level:
			await RenderingServer.frame_post_draw
			return
	check(false,"detail tier did not finish loading: "+level)
func positions(card: CardscapeCard) -> Dictionary:
	var result: Dictionary={}
	for id in card._native_meshes:
		result[id]=card._native_meshes[id].last_positions.duplicate()
	return result
func art_sizes(card: CardscapeCard) -> Array:
	var result: Array=[]
	for surface in card._surfaces:
		var texture: Texture2D=surface.material_override.get_shader_parameter("art")
		if texture:result.append(texture.get_width())
	return result
func run() -> void:
	var library := load("res://library.tres") as CardscapeLibrary
	var scene := Node3D.new()
	root.add_child(scene)
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.fov=40
	camera.current=true
	scene.add_child(camera)
	var card := CardscapeCard.new()
	card.library=library
	card.card_id=library.catalog().activeCardId
	card.detail_pixel_width=200
	card.effects_paused=true
	scene.add_child(card)
	for i in 5:await process_frame
	var mesh_ids: Array=card._surfaces.map(func(s):return s.mesh.get_instance_id())
	var original: String=library.data_json
	var frames := 0
	var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	var small_widths: Array=[]
	var large_widths: Array=[]
	# Reverse a pending request before it can replace the current small tier.
	card.detail_pixel_width=900
	card._update(0.0)
	card.detail_pixel_width=200
	card._update(0.0)
	for i in 120:await process_frame
	check(library._texture_requests.is_empty(),"rapid zoom drains abandoned threaded requests")
	check(card.export_detail_state().level=="small","rapid zoom keeps the latest requested tier")
	var other := CardscapeCard.new()
	other.library=library
	other.card_id=card.card_id
	other.detail_pixel_width=200
	other.effects_paused=true
	other.visible=false
	scene.add_child(other)
	for i in 3:await process_frame
	card.detail_pixel_width=900
	card._update(0.0)
	other.detail_pixel_width=900
	other._update(0.0)
	card.detail_pixel_width=200
	card._update(0.0)
	await settle(other,"large")
	check(card.export_detail_state().level=="small","cancelling one card preserves another card's pending batch")
	other.queue_free()
	await process_frame
	await process_frame
	for action in card._definition.actions:
		for fraction in [0.0,.5,1.0]:
			check(card.play_action(action.id),"all exported actions can play")
			card.seek_action(float(action.duration)*fraction,true)
			card.detail_pixel_width=200
			await settle(card,"small")
			if fraction==.5 and not directory.is_empty():root.get_texture().get_image().save_png(directory.path_join(str(action.id)+"-small.png"))
			var baseline := positions(card)
			var paused_time: float=card._action_time
			small_widths=art_sizes(card)
			check(not card.export_detail_state().effects.materials,"small tier suppresses material work")
			card.detail_pixel_width=900
			await settle(card,"large")
			large_widths=art_sizes(card)
			check(card.export_detail_state().effects.materials,"large tier restores materials")
			check(card._action_time==paused_time,"LOD preserves paused action time exactly")
			check(baseline==positions(card),"LOD preserves every skinned and FFD vertex at the same action time")
			check(mesh_ids==card._surfaces.map(func(s):return s.mesh.get_instance_id()),"LOD reuses mesh instances")
			frames+=2
			if fraction==.5 and not directory.is_empty():root.get_texture().get_image().save_png(directory.path_join(str(action.id)+"-large.png"))
	check(small_widths.max()<large_widths.max(),"actual GPU art textures change resolution")
	var settings: Dictionary=card._definition.exportProfile.settings
	var rules: Dictionary=settings.layers.duplicate()
	var target_id: String=card._native_meshes.keys()[0]
	var target_surfaces: Array=card._surfaces.filter(func(s):return s.get_meta("layer_id","")==target_id)
	settings.layers[target_id]="detail"
	card.detail_pixel_width=200
	await settle(card,"small")
	check(target_surfaces.all(func(s):return not s.visible),"detail-only layers hide when small")
	card.detail_pixel_width=900
	await settle(card,"large")
	check(target_surfaces.any(func(s):return s.visible),"detail-only layers restore when large")
	settings.layers[target_id]="omit"
	card._update(0.0)
	check(target_surfaces.all(func(s):return not s.visible),"omitted layers remain hidden at full detail")
	settings.layers=rules
	card.particle_settings={"enabled":true,"count":8}
	card.detail_pixel_width=200
	await settle(card,"small")
	check(card._particle_count==0,"small tier stops particle sampling and drawing")
	card.detail_pixel_width=900
	await settle(card,"large")
	check(card._particle_count>0,"large tier restores particles")
	var sprite_key: String=card._definition.layers.filter(func(l):return l.has("asset"))[0].asset
	card.particle_settings={"enabled":true,"count":8,"visual":"sprite","sprite":sprite_key}
	card._update(0.0)
	check(card._particle_count>0,"sprite particles use lazy colour texture paths")
	check(card._particle_node.material_override.get_shader_parameter("sprite_tex")==card._texture(sprite_key),"sprite texture follows the selected detail variant")
	card.play_action(str(card._definition.actions.back().id))
	for i in 3:await process_frame
	var seconds: float=card._action_time
	card.detail_pixel_width=200
	await settle(card,"small")
	check(card._action_time>=seconds,"LOD never restarts the animation clock")
	card.detail_pixel_width=0
	card.scale=Vector3.ONE*.25
	await settle(card,"small")
	card.scale=Vector3.ONE*2
	await settle(card,"large")
	check(card.export_detail_state().pixels>420,"camera projection drives automatic detail")
	check(library._texture_requests.is_empty(),"completed threaded texture requests are consumed")
	check(library.data_json==original,"instance detail does not alter exported data or another card")
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","frames":frames,"meshes":card._native_meshes.size(),"small_width":small_widths.max(),"large_width":large_widths.max(),"rig_unchanged":true,"clock_preserved":true,"failures":failures}))
	scene.queue_free()
	await process_frame
	await process_frame
	quit(0 if failures.is_empty() else 1)
