extends SceneTree
var failures: Array[String] = []
var captures := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
var started := Time.get_ticks_msec()
func phase(message: String) -> void:
	print("CARDSCAPE_FRAME_ART_PHASE "+JSON.stringify({"phase":message,"elapsed_ms":Time.get_ticks_msec()-started}))
func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)
func _initialize() -> void:
	call_deferred("run")
func shot(card: CardscapeCard, seconds: float, name: String) -> Image:
	phase("capture "+name)
	card.seek_effects(seconds)
	for surface in card._surfaces:
		surface.visible=false
	var back := card.component_node("back")
	if back: back.visible=false
	if card._particle_node: card._particle_node.visible=false
	if card._particle_front_node: card._particle_front_node.visible=false
	card.visible=true
	await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if not captures.is_empty(): check(image.save_png(captures.path_join(name+".png"))==OK,"capture saved: "+name)
	return image
func difference(a: Image, b: Image) -> float:
	var total := 0.0
	for y in range(0,a.get_height(),3):
		for x in range(0,a.get_width(),3):
			var p := a.get_pixel(x,y)
			var q := b.get_pixel(x,y)
			total+=absf(p.r-q.r)+absf(p.g-q.g)+absf(p.b-q.b)
	return total
func alpha_motion(a: Image, b: Image) -> Dictionary:
	var total := 0.0
	var changed_coverage := 0
	for y in range(0,a.get_height(),2):
		for x in range(0,a.get_width(),2):
			var first := a.get_pixel(x,y).a
			var second := b.get_pixel(x,y).a
			total+=absf(first-second)
			if (first>.12)!=(second>.12): changed_coverage+=1
	return {"difference":total,"changed_coverage_samples":changed_coverage}
func current_shot(name: String) -> Image:
	await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if not captures.is_empty(): check(image.save_png(captures.path_join(name+".png"))==OK,"current playback capture saved: "+name)
	return image
func verify_autoplay(card: CardscapeCard, frame: CardscapeCard) -> Dictionary:
	phase("real process playback, pause, and resume")
	var start := await shot(card,0,"autoplay-start")
	card.effects_paused=false
	card.set_process(true)
	await create_timer(.35).timeout
	var playing := await current_shot("autoplay-playing")
	card.effects_paused=true
	var playing_clock := card._clock
	check(playing_clock>.1,"real process advances parent clock without manual seeking")
	check(is_equal_approx(frame._clock,playing_clock),"nested frame follows the real playback clock")
	var frozen := await current_shot("autoplay-freeze")
	await create_timer(.2).timeout
	var paused := await current_shot("autoplay-paused")
	check(is_equal_approx(card._clock,playing_clock) and is_equal_approx(frame._clock,playing_clock),"pause freezes parent and nested frame clocks")
	var paused_pixels := difference(frozen,paused)
	check(paused_pixels<.01,"real process pause freezes the rendered output")
	card.effects_paused=false
	await create_timer(.25).timeout
	var resumed := await current_shot("autoplay-resumed")
	card.effects_paused=true
	card.set_process(false)
	var resumed_clock := card._clock
	check(resumed_clock>playing_clock+.1 and is_equal_approx(frame._clock,resumed_clock),"resume advances both clocks from the paused position")
	var playing_pixels := difference(start,playing)
	var resumed_pixels := difference(paused,resumed)
	check(playing_pixels>1 and resumed_pixels>1,"automatic playback and resume change rendered pixels")
	return {"playing_seconds":playing_clock,"resumed_seconds":resumed_clock,"playing_difference":playing_pixels,"paused_difference":paused_pixels,"resumed_difference":resumed_pixels}
func composition_shot(card: CardscapeCard, name: String) -> void:
	phase("capture full composition "+name)
	for surface in card._surfaces: surface.visible=true
	if card._particle_node: card._particle_node.visible=true
	if card._particle_front_node: card._particle_front_node.visible=true
	# Reapply authored visibility, selected material replacement, and face rules.
	card.seek_effects(1)
	await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if not captures.is_empty(): check(image.save_png(captures.path_join(name+".png"))==OK,"composition capture saved: "+name)
func run() -> void:
	phase("load actual exported library")
	RenderingServer.set_default_clear_color(Color.BLACK)
	var library := load("res://library.tres") as CardscapeLibrary
	check(library!=null,"actual exported library loads")
	if not library: quit(1);return
	phase("create card and compile GPU materials")
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.fov=CardscapeCard.preview_fov(Vector2(600,900))
	camera.current=true
	root.add_child(camera)
	var card := CardscapeCard.new()
	card.library=library
	card.card_id=library.catalog().activeCardId
	var fixture: bool = not library.card(card.card_id).get("verificationFixture",{}).is_empty()
	phase("offline fixture" if fixture else "client export")
	card.effects_paused=true
	# The test isolates this exported frame; avoid compiling unrelated hero/back
	# shaders for two transient startup frames before the surfaces are hidden.
	card.visible=false
	root.add_child(card)
	# Godot auto-enables _process when the node enters the tree.
	card.set_process(false)
	await process_frame
	await process_frame
	phase("card ready")
	var frame := card.component_node("frame")
	check(frame!=null,"frame uses authored component scene")
	if not frame: quit(1);return
	var artwork := 0
	var metal_mesh: Mesh
	var channels: Dictionary = {}
	for surface in frame._surfaces:
		if surface.get_meta("layer_id","") in ["stellar-metal","stellar-flow-rear","stellar-flow"]:
			artwork+=1
			var mat := surface.material_override as ShaderMaterial
			var channel := int(mat.get_shader_parameter("surfaceChannel"))
			channels[channel]=surface
			check(mat.get_shader_parameter("art")!=null,"separate transparent production texture exported")
			check(surface.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX].size()==4,"artwork uses a rigid quad")
			check(surface.position.z<=.0491 and surface.position.z>=.0429,"artwork is attached close to the frame face")
			check(mat.get_shader_parameter("surfaceTransparent")==bool(channel in [2,3]),"only flowing layers can emit outside source alpha")
			check(mat.shader.get_shader_uniform_list().size()>0,"portable flow shader compiles")
			if surface.get_meta("layer_id","")=="stellar-metal": metal_mesh=surface.mesh
	check(artwork==3 and channels.has(1) and channels.has(2) and channels.has(3),"metal and front/rear ribbons export as three distinct channels")
	var front_eye := Vector3.ZERO
	if channels.size()==3:
		check(channels[2].position.z<channels[1].position.z and channels[1].position.z<channels[3].position.z,"rear ribbon, metal, and front ribbon retain depth order")
		var rear_material := channels[2].material_override as ShaderMaterial
		var front_material := channels[3].material_override as ShaderMaterial
		check(rear_material.get_shader_parameter("art")==front_material.get_shader_parameter("art"),"front/rear ribbons reuse one texture resource")
		check(rear_material!=front_material and rear_material.shader==front_material.shader,"channels share compiled code with independent material parameters")
		front_eye=(channels[1].material_override as ShaderMaterial).get_shader_parameter("surfaceEye")
	var zero := await shot(card,0,"frame-0")
	var one := await shot(card,1,"frame-1")
	var again := await shot(card,1,"frame-paused")
	var loop := await shot(card,4,"frame-loop")
	var moving := difference(zero,one)
	var paused_difference := difference(one,again)
	var loop_difference := difference(zero,loop)
	check(moving>1,"real GPU ribbon highlights move")
	check(paused_difference<.01,"paused frame is stable")
	check(loop_difference<.3,"four-second light cycle wraps continuously")
	var center := zero.get_pixel(zero.get_width()/2,zero.get_height()/2)
	check(center.r<.01 and center.g<.01 and center.b<.01,"inner window has no opaque artwork fill")
	var opaque_window_samples := 0
	for y in range(5):
		for x in range(5):
			var sample := zero.get_pixel(roundi(zero.get_width()*(.35+x*.075)),roundi(zero.get_height()*(.35+y*.075)))
			if maxf(sample.r,maxf(sample.g,sample.b))>.01: opaque_window_samples+=1
	check(opaque_window_samples==0,"inner window remains clear away from its center too")
	root.transparent_bg=true
	var transparent := await shot(card,0,"frame-alpha")
	var transparent_one := await shot(card,1,"frame-alpha-1")
	var alpha_change := alpha_motion(transparent,transparent_one)
	check(alpha_change.difference>1 and alpha_change.changed_coverage_samples>20,"flow changes actual GPU alpha coverage, not only RGB brightness")
	root.transparent_bg=false
	var opaque_alpha_samples := 0
	for y in range(5):
		for x in range(5):
			if transparent.get_pixel(roundi(transparent.get_width()*(.35+x*.075)),roundi(transparent.get_height()*(.35+y*.075))).a>.01: opaque_alpha_samples+=1
	check(opaque_alpha_samples==0,"GPU output retains transparent alpha across the inner window")
	var sequence_frames := clampi(int(OS.get_environment("CARDSCAPE_SEQUENCE_FRAMES")),0,48)
	if not captures.is_empty() and sequence_frames>0:
		for index in range(sequence_frames):
			await shot(card,4.0*index/sequence_frames,"sequence-%03d"%index)
	var autoplay := await verify_autoplay(card,frame)
	card.inspect(-24,12)
	await shot(card,1,"frame-tilted")
	for surface in frame._surfaces:
		if surface.get_meta("layer_id","")=="stellar-metal": check(surface.mesh==metal_mesh,"pose changes reuse the artwork mesh")
		var mat := surface.material_override as ShaderMaterial
		check(mat.get_shader_parameter("surfaceEye").is_equal_approx(mat.get_shader_parameter("card_eye")),"portable surface view follows the actual pose")
		if int(mat.get_shader_parameter("surfaceChannel"))==1:
			check(not mat.get_shader_parameter("surfaceEye").is_equal_approx(front_eye),"metal reflection receives the changed view direction")
	card.flip_to_back()
	card.seek_effects(1)
	await process_frame
	check(not frame.visible,"front frame glow disappears when viewing the back")
	card.inspect(0,0)
	await composition_shot(card,"card-front")
	card.inspect(-24,12)
	await composition_shot(card,"card-tilted")
	card.flip_to_back()
	await composition_shot(card,"card-back")
	print("CARDSCAPE_FRAME_ART_RESULT "+JSON.stringify({"status":"passed" if failures.is_empty() else "failed","fixture":fixture,"ui_applied":not fixture,"failures":failures,"artwork_layers":artwork,"moving_difference":moving,"alpha_motion":alpha_change,"autoplay":autoplay,"paused_difference":paused_difference,"loop_difference":loop_difference,"window_center":[center.r,center.g,center.b],"opaque_window_samples":opaque_window_samples,"opaque_alpha_samples":opaque_alpha_samples,"sequence_frames":sequence_frames}))
	quit(0 if failures.is_empty() else 1)
