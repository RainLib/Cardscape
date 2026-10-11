extends SceneTree
var failures: Array[String] = []
func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var catalog: CardscapeLibrary = load("res://library.tres") as CardscapeLibrary
	check(catalog != null,"catalog Resource loads")
	if not catalog:
		quit(1)
		return
	for shader in catalog.shaders.values():
		check(shader.get_shader_uniform_list().size()>0,"Godot Shader hook compiles")
	var baseline: String = catalog.data_json
	var scene := Node3D.new()
	root.add_child(scene)
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.fov=42
	camera.current=true
	scene.add_child(camera)
	var first := CardscapeCard.new()
	first.library=catalog
	first.card_id=catalog.catalog().activeCardId
	scene.add_child(first)
	var second := CardscapeCard.new()
	second.library=catalog
	second.card_id=first.card_id
	second.visible=false
	scene.add_child(second)
	await process_frame
	await process_frame
	check(first._surfaces.size()>0,"dynamic surfaces exist")
	check(first._surfaces[0].material_override!=second._surfaces[0].material_override,"materials are per instance")
	check(first._surfaces[0].mesh!=null,"geometry loaded")
	for surface in first._surfaces:
		var layer_id: String = surface.get_meta("layer_id","")
		for layer in first._definition.layers:
			if layer.id!=layer_id:
				continue
			if layer.has("splitSourceId") and first._definition.get("spatial",{}).get("enabled",false):
				check(surface.has_meta("attachment_parent"),"split cloth is attached to its parent")
				check(surface.material_override.get_shader_parameter("attached")==true,"attachment shader enabled")
				var weights: Texture2D = surface.material_override.get_shader_parameter("attachment_tex")
				check(weights!=null and weights.get_size()==Vector2(128,192),"small seam field is loaded")
				if weights and layer.get("attachment",{}).has("motion"):
					var arrays := surface.mesh.surface_get_arrays(0)
					var uv: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
					var movement: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV2]
					var image := weights.get_image()
					var roots := 0
					var tips := 0
					for i in uv.size():
						var w := image.get_pixel(clampi(roundi(uv[i].x*127),0,127),clampi(roundi(uv[i].y*191),0,191)).r
						check(is_equal_approx(movement[i].y,0),"cloth motion is independent of rigid body backing")
						check(absf(movement[i].x-w*float(layer.attachment.motion))<.0001,"cloth motion follows the attachment gradient")
						if w==0:
							roots+=1
							check(movement[i].x==0,"cloth root stays pinned")
						if w>.99:
							tips+=1
					check(roots>0 and tips>0,"cloth has both fixed roots and free ends")
			if layer.get("role","") in ["stat-cost","stat-power"]:
				check(surface.material_override.render_priority==-60+(first._definition.layers.size()-1-first._definition.layers.find(layer))*2,"badge follows editable layer order")
				check(surface.material_override.shader.code.contains("depth_test_disabled"),"badge respects painter order independently of depth")
	var inside: MeshInstance3D
	var outside: MeshInstance3D
	var body_id := ""
	for layer in first._definition.layers:
		if layer.kind=="foreground":
			body_id=str(layer.id)
	for surface in first._surfaces:
		if str(surface.get_meta("layer_id",""))!=body_id:
			continue
		if surface.name.ends_with("-inside"):
			inside=surface
		if surface.name.ends_with("-outside"):
			outside=surface
	if inside and outside:
		check(inside.mesh==outside.mesh,"inside/outside share continuous mesh")
		if first._definition.get("spatial",{}).get("enabled",false):
			var shared_geometry: Mesh = inside.mesh
			var baseline_arrays := shared_geometry.surface_get_arrays(0)
			var layer_meshes := {}
			var pieces := 0
			for surface in first._surfaces:
				if surface.name.ends_with("-inside") or surface.name.ends_with("-outside"):
					pieces+=1
					# Cloth owns its motion weights; it retains the same registered vertices and topology.
					var arrays := surface.mesh.surface_get_arrays(0)
					for index in [Mesh.ARRAY_VERTEX,Mesh.ARRAY_TEX_UV,Mesh.ARRAY_INDEX]:
						check(arrays[index]==baseline_arrays[index],"character pieces keep identical registered geometry")
					var layer_id: String = surface.get_meta("layer_id","")
					if layer_meshes.has(layer_id):
						check(surface.mesh==layer_meshes[layer_id],"each cloth inside/outside pair shares one mesh")
					else:
						layer_meshes[layer_id]=surface.mesh
					check(surface.get_meta("registered",false),"character depth preserves front registration")
			var expected_pieces := 0
			for layer in first._definition.layers:
				if layer.get("visible",true) and (layer.kind=="foreground" or layer.get("spatial",{}).get("role","") in ["rear","body","front"]):
					expected_pieces+=2
			check(pieces==expected_pieces,"every character piece has paired clipping passes")
			for layer in first._definition.layers:
				if layer.get("spatial",{}).get("role","")=="far":
					for surface in first._surfaces:
						if surface.get_meta("layer_id","")==layer.id and layer.has("sourceWindow"):
							var extent: Vector2 = surface.material_override.get_shader_parameter("background_extent")
							var size: Vector2 = first.library.textures[layer.asset].get_size()
							var expected: Vector2 = size/Vector2(float(layer.sourceWindow.width),float(layer.sourceWindow.height))
							check(extent.is_equal_approx(expected),"full background overscan reaches the renderer")
		var points: PackedVector3Array = inside.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		first.set_layer_transform(str(inside.get_meta("layer_id")),Vector2(12,20),1.1)
		check(points==inside.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX],"transform never reshapes weapon geometry")
	first.locale="en"
	await process_frame
	await process_frame
	check(first.locale=="en" and second.locale=="zh-CN","locale override stays local")
	first.material_settings={"enabled":true,"style":"holographic","strength":.35,"target":"both"}
	first.particle_settings={"enabled":true,"count":96,"size":.015,"spread":.5,"speed":.1}
	first._update(0)
	check(first.diagnostics().particles==96,"behind-card particle overrides render")
	for kind in ["frame","background","back"]:
		for component in catalog.catalog().components:
			if component.kind==kind:
				check(first.set_component(kind,component.id,component.versions[0].version),"replace "+kind)
				break
	await process_frame
	await process_frame
	check(second.component_overrides.is_empty(),"components remain independent across cards")
	check(catalog.data_json==baseline,"shared catalog immutable")
	check(first.play_action("enter"),"entry action available")
	first.seek_action(0)
	check(is_equal_approx(first._visual.position.y,-1100.0/1024.0),"entry starts below")
	first.seek_action(1.2)
	check(first._visual.position.is_equal_approx(Vector3.ZERO),"entry ends centered")
	check(first._visual.scale.is_equal_approx(Vector3.ONE),"entry ends full size")
	check(first.set_stats(4,7),"gameplay stats supported")
	check(not first.set_stats(-1,7),"gameplay values bounded")
	first.inspect(-18,7)
	first.locale="zh-CN"
	await process_frame
	await process_frame
	check(first.gameplay_stats=={"cost":4,"power":7},"gameplay numbers survive language and component rebuilds")
	check(first._stats_root!=null,"gameplay labels are active after rebuild")
	if "--capture" in OS.get_cmdline_user_args():
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		check(image!=null and image.get_width()>0,"GPU viewport captured")
		if image:
			image.save_png("res://sdk-preview.png")
	print("CARDSCAPE_SDK_RESULT "+JSON.stringify({"ok":failures.is_empty(),"failures":failures,"cards":catalog.catalog().cards.size(),"components":catalog.catalog().components.size(),"diagnostics":first.diagnostics()}))
	quit(0 if failures.is_empty() else 1)
