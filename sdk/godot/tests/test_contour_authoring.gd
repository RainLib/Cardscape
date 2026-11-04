extends SceneTree
var failures: Array[String]=[]
func check(value: bool,message: String) -> void:
	if not value:failures.append(message)
func _initialize() -> void:call_deferred("run")
func image() -> Image:
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func save(image: Image,name: String) -> void:
	var directory:=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not directory.is_empty():image.save_png(directory.path_join(name+".png"))
func run() -> void:
	root.transparent_bg=true
	var library=load("res://library.tres") as CardscapeLibrary
	check(library!=null,"actual curved export library loads")
	if not library:quit(1);return
	var stage:=Node3D.new()
	root.add_child(stage)
	var camera:=Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.fov=CardscapeCard.preview_fov(root.size)
	camera.current=true
	var card:=CardscapeCard.new()
	print("CONTOUR_NATIVE_STAGE create-card")
	card.library=library
	card.card_id=library.catalog().activeCardId
	card.effects_paused=true
	stage.add_child(card)
	for i in 6:await process_frame
	print("CONTOUR_NATIVE_STAGE first-frame")
	card.play_action("idle")
	card.seek_action(0,true)
	card.set_process(false)
	var contour: Dictionary=card._definition.frameStyle.contour
	check(contour.paths.schema=="card-contour-paths/1","editable curve metadata is preserved")
	if not contour.has("islands"):check(contour.paths.windows[0][0].has("incoming"),"ellipse handles are preserved")
	var rings: Array=[contour.outline]+contour.windows
	for island in contour.get("islands",[]):rings.append(island.outline);rings.append_array(island.windows)
	var polygons: Array[PackedVector2Array]=[]
	var count:=0
	for ring in rings:
		var points:=PackedVector2Array()
		for p in ring:points.append(Vector2(float(p[0]),float(p[1])))
		polygons.append(points)
		count+=points.size()
	if contour.has("islands") or count>64:
		check(card._contour_field!=null,"complex export has a GPU distance texture")
		check(card._contour_counts.y>0,"custom clipping remains enabled")
		if card._contour_field:
			var data_image: Image=card._contour_field.get_image()
			if data_image.is_compressed():data_image.decompress()
			check(data_image.get_size()==Vector2i(2016,1856),"padded distance and arc atlas retains source resolution")
			for probe in JSON.parse_string(FileAccess.get_file_as_string("res://tests/contour-field-probes.json")):
				var pixel: Color=data_image.get_pixel(int(probe.x),int(probe.y))
				for channel in 4:check(absi(roundi(pixel[channel]*255)-int(probe.rgba[channel]))==0,"packed distance bytes remain lossless after native import")
	else:check(card._contour_counts==Vector2(contour.outline.size(),count),"all baked edges reach GPU uniforms")
	check(card._definition.frameGeometry.sides.indices.size()==count*6,"each curve segment has a closed physical side wall")
	for surface in card._surfaces:surface.visible=str(surface.get_meta("layer_id","")).begins_with("frame-")
	if card._stats_root:card._stats_root.visible=false
	if card._particle_node:card._particle_node.visible=false
	if card._particle_front_node:card._particle_front_node.visible=false
	for state in card._particle_event_states.values():
		state.node.visible=false
		if state.front:state.front.visible=false
	var mask: Image=await image()
	var probes:=0
	for x in range(0,1025,64):
		for y in range(0,1537,64):
			var point:=Vector2(x,y)
			var edge:=false
			for polygon in polygons:
				for i in polygon.size():
					if point.distance_to(Geometry2D.get_closest_point_to_segment(point,polygon[i],polygon[(i+1)%polygon.size()]))<8:edge=true
			if edge:continue
			var solid: bool=false
			for polygon in polygons:
				if Geometry2D.is_point_in_polygon(point,polygon):solid=not solid
			var pixel: Vector2=camera.unproject_position(Vector3(float(x)/1024-.5,.75-float(y)/1024,.045))
			var alpha: float=mask.get_pixel(roundi(pixel.x),roundi(pixel.y)).a
			check(alpha>.95 if solid else alpha<.05,"curve aperture pixel "+str(point)+" expected "+str(solid)+" alpha "+str(alpha))
			probes+=1
	save(mask,"frame-mask")
	var materials: Dictionary={}
	print("CONTOUR_NATIVE_STAGE mask-probes ",probes)
	if FileAccess.file_exists("res://tests/contour-material-reference.json"):
		materials=await preload("res://tests/contour_materials.gd").run(self,card,camera)
		for failure in materials.failures:failures.append(failure)
	card.inspect(20,12)
	save(await image(),"tilted")
	card.flip_to_back()
	save(await image(),"back")
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"contour_edges":count,"pixel_probes":probes,"side_triangles":count*2,"materials":materials}))
	quit(0 if failures.is_empty() else 1)
