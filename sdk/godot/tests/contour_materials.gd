extends RefCounted
static func isolate(card: CardscapeCard,markers: bool=false) -> void:
	for surface in card._surfaces:
		var id: String=surface.get_meta("layer_id","")
		surface.visible=surface.visible and (id.begins_with("frame-") or markers and id.begins_with("material-marker-"))
static func image(tree: SceneTree) -> Image:
	for i in 3:await tree.process_frame
	await RenderingServer.frame_post_draw
	return tree.root.get_texture().get_image()
static func save(img: Image,name: String) -> void:
	var directory:=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not directory.is_empty():img.save_png(directory.path_join("material-"+name+".png"))
static func pixel(img: Image,camera: Camera3D,x: float,y: float,z: float=.045) -> Color:
	var at: Vector2=camera.unproject_position(Vector3(x/1024-.5,.75-y/1024,z))
	return img.get_pixel(roundi(at.x),roundi(at.y))
static func run(tree: SceneTree,card: CardscapeCard,camera: Camera3D) -> Dictionary:
	var failures: Array[String]=[]
	var reference: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://tests/contour-material-reference.json"))
	var style: Dictionary=card._definition.frameStyle
	var original: Dictionary=style.duplicate(true)
	card.inspect(0,0)
	card.detail_pixel_width=900
	var rim: MeshInstance3D=card._surfaces.filter(func(s):return s.get_meta("layer_id","")=="frame-rim")[0]
	var vertices: PackedVector3Array=rim.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	var low: float=1
	var high: float=-1
	for v in vertices:low=minf(low,v.z);high=maxf(high,v.z)
	if high-low<4.9/1024:failures.append("native cap must have a real bevel")
	for finish in ["metal","glow","fire","chains","halloween-stickers"]:
		print("CONTOUR_NATIVE_FINISH ",finish)
		style.finish=finish
		card._update(0)
		isolate(card)
		save(await image(tree),finish)
	style.finish="glow"
	style.animation="none"
	card.seek_effects(0)
	isolate(card)
	var glow:=await image(tree)
	var z: float=.045-minf(float(style.bevel),float(style.depth)*.45)/1024-.001
	var alphas: Array=[]
	for i in reference.glowProbes.size():
		var p: Array=reference.glowProbes[i]
		var alpha: float=pixel(glow,camera,float(p[0]),float(p[1]),z).a*255
		alphas.append(alpha)
		if alpha<=20:failures.append("native halo follows real boundary "+str(p))
		if absf(alpha-float(reference.liveAlpha[i]))>=45:failures.append("native halo agrees with WebGL coverage "+str(p))
	if pixel(glow,camera,10,10,z).a>.001:failures.append("no rectangular ghost aura")
	style.finish="metal"
	style.animation="flow"
	style.animationSpeed=1.0
	card.seek_effects(0)
	isolate(card)
	var start:=await image(tree)
	card.seek_effects(.8)
	isolate(card)
	var later:=await image(tree)
	card.seek_effects(0)
	isolate(card)
	var replay:=await image(tree)
	if start.get_data()==later.get_data():failures.append("native flow must advance")
	if start.get_data()!=replay.get_data():failures.append("native paused replay is deterministic")
	save(start,"flow-start")
	save(later,"flow-later")
	style.animation="none"
	card._update(0)
	isolate(card,true)
	var markers:=await image(tree)
	var broad_variation: float=0
	for x in range(300,501,10):
		for y in range(230,301,10):
			var a:=pixel(markers,camera,x,y)
			var b:=pixel(markers,camera,x+3,y+3)
			for channel in 3:broad_variation=maxf(broad_variation,absf(a[channel]-b[channel])*255)
	if broad_variation>=8:failures.append("native broad face has no nearest-loop seams "+str(broad_variation))
	var sites: Array=[Vector2(400,140),Vector2(900,700),Vector2(250,415)]
	for i in 3:
		var color: Color=pixel(markers,camera,sites[i].x,sites[i].y)
		for channel in 3:
			if absf(color[channel]-(1.0 if channel==i else 0.0))>.02:failures.append("native image decoration keeps source UV "+str(i))
	save(markers,"markers")
	card.inspect(25,15)
	isolate(card,true)
	save(await image(tree),"tilted")
	style.clear()
	style.merge(original,true)
	card.inspect(0,0)
	var legacy: int=await legacy_mask(tree,card,camera,failures)
	print("CONTOUR_NATIVE_STAGE legacy-probes ",legacy)
	return {"failures":failures,"haloProbes":alphas,"flowAndReplay":true,"imageMarkers":true,"broadFaceVariation":broad_variation,"bevelRange":high-low,"legacyPixelProbes":legacy}

static func legacy_mask(tree: SceneTree,card: CardscapeCard,camera: Camera3D,failures: Array[String]) -> int:
	# A full quad proves both solids and holes through the new decoder, without
	# allowing the already-tessellated bevel mesh to hide a decoding error.
	for surface in card._surfaces:surface.visible=false
	var source: String=preload("res://addons/cardscape/card_surface.gdshader").code
	var shader:=Shader.new()
	shader.code=source.substr(0,source.find("void fragment(){"))+"void fragment(){vec2 shape=contour_at(vec2(UV.x-.5,.75-UV.y*1.5));ALBEDO=vec3(1.);ALPHA=shape.x*(1.-shape.y);if(ALPHA<.01)discard;}"
	var mat:=ShaderMaterial.new()
	mat.shader=shader
	mat.set_shader_parameter("contour_texture",1.0)
	mat.set_shader_parameter("contour_counts",Vector2(1,1))
	mat.set_shader_parameter("contour_field_info",Vector4(1024,1536,1,0))
	var data:=Image.load_from_file("res://tests/contour-legacy-field.png")
	mat.set_shader_parameter("contour_field",ImageTexture.create_from_image(data))
	var quad:=MeshInstance3D.new()
	var mesh:=QuadMesh.new()
	mesh.size=Vector2(1,1.5)
	quad.mesh=mesh
	quad.material_override=mat
	quad.position.z=.045
	card._visual.add_child(quad)
	var mask:=await image(tree)
	var contour: Dictionary=card._definition.frameStyle.contour
	var rings: Array=[contour.outline]+contour.windows
	for island in contour.get("islands",[]):rings.append(island.outline);rings.append_array(island.windows)
	var polygons: Array[PackedVector2Array]=[]
	for ring in rings:
		var polygon:=PackedVector2Array()
		for p in ring:polygon.append(Vector2(float(p[0]),float(p[1])))
		polygons.append(polygon)
	var probes:=0
	for x in range(0,1025,64):
		for y in range(0,1537,64):
			var p:=Vector2(x,y)
			var near:=false
			var solid:=false
			for polygon in polygons:
				if Geometry2D.is_point_in_polygon(p,polygon):solid=not solid
				for i in polygon.size():
					if p.distance_to(Geometry2D.get_closest_point_to_segment(p,polygon[i],polygon[(i+1)%polygon.size()]))<8:near=true
			if near:continue
			var alpha: float=pixel(mask,camera,x,y).a
			if (solid and alpha<.95) or (not solid and alpha>.05):failures.append("legacy RGB12 mask "+str(p))
			probes+=1
	save(mask,"legacy-mask")
	quad.queue_free()
	return probes
