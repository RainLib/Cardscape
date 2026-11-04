extends SceneTree
## Measures actual resource parsing, synchronous card creation and the first
## GPU frame separately. Driver/OS caches are outside this test's control.
func _initialize() -> void:call_deferred("run")
func run() -> void:
	root.transparent_bg=true
	var began:=Time.get_ticks_usec()
	print("STARTUP_STAGE library")
	var library:=load("res://library.tres") as CardscapeLibrary
	if library and OS.get_environment("CARDSCAPE_GENERIC_ONLY")=="1":
		for key in library.shaders.keys():
			if ":finish:" in str(key):library.shaders.erase(key)
	var loaded:=Time.get_ticks_usec()
	if not library:print(JSON.stringify({"status":"failed","reason":"library"}));quit(1);return
	var stage:=Node3D.new()
	root.add_child(stage)
	var camera:=Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.fov=CardscapeCard.preview_fov(root.size)
	camera.current=true
	var card:=CardscapeCard.new()
	card.library=library
	card.card_id=library.catalog().activeCardId
	card.effects_paused=true
	print("STARTUP_STAGE create")
	stage.add_child(card)
	card.set_process(false)
	if OS.get_environment("CARDSCAPE_PROBE_HOOK")=="1":
		card.set_effect_parameter("custom_effect",true)
		card.set_effect_parameter("custom_strength",1.0)
	var created:=Time.get_ticks_usec()
	print("STARTUP_STAGE first-draw")
	await RenderingServer.frame_post_draw
	var drawn:=Time.get_ticks_usec()
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	var capture:=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not capture.is_empty():root.get_texture().get_image().save_png(capture.path_join("startup.png"))
	var code_lengths:Array[int]=[]
	for surface in card._surfaces:
		var material:=surface.material_override as ShaderMaterial
		if material and material.shader and not code_lengths.has(material.shader.code.length()):code_lengths.append(material.shader.code.length())
	print(JSON.stringify({"status":"passed","library_ms":(loaded-began)/1000.0,"create_ms":(created-loaded)/1000.0,"first_draw_ms":(drawn-created)/1000.0,"total_ms":(drawn-began)/1000.0,"surfaces":card._surfaces.size(),"bones":card._character_compiled.order.size(),"surface_shader_lengths":code_lengths}))
	quit()
