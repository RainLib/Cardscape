extends SceneTree
var camera: Camera3D
var material: ShaderMaterial
func _initialize():
	call_deferred("_run")
func _image() -> Image:
	for i in 3: await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func _pixel(image: Image,p: Vector2) -> Color:
	var at := camera.unproject_position(Vector3(p.x*.7,p.y*.7,0))
	return image.get_pixel(roundi(at.x),roundi(at.y))
func _difference(a: Image,b: Image) -> float:
	var sum := 0.0
	for y in range(0,a.get_height(),4):
		for x in range(0,a.get_width(),4):
			var p := a.get_pixel(x,y)
			var q := b.get_pixel(x,y)
			sum+=absf(p.r-q.r)+absf(p.g-q.g)+absf(p.b-q.b)
	return sum
func _run():
	RenderingServer.set_default_clear_color(Color.BLACK)
	var stage := Node3D.new()
	root.add_child(stage)
	camera=Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.current=true
	var node := MultiMeshInstance3D.new()
	var mesh := QuadMesh.new()
	mesh.size=Vector2.ONE
	var batch := MultiMesh.new()
	batch.transform_format=MultiMesh.TRANSFORM_3D
	batch.use_colors=true
	batch.use_custom_data=true
	batch.mesh=mesh
	batch.instance_count=1
	batch.set_instance_transform(0,Transform3D(Basis.from_scale(Vector3.ONE*1.4),Vector3.ZERO))
	batch.set_instance_color(0,Color.WHITE)
	batch.set_instance_custom_data(0,Color(.67,0,0,0))
	node.multimesh=batch
	material=ShaderMaterial.new()
	material.shader=load("res://addons/cardscape/card_particles.gdshader")
	node.material_override=material
	stage.add_child(node)
	var rows := []
	for kind in [21,22,23,25,8,13,7,3]:
		batch.set_instance_color(0,Color("#53b4e8") if kind==8 else Color("#ffb729") if kind==25 else Color("#f1b83d") if kind==13 else Color("#ffcb79") if kind==7 else Color("#74ddff") if kind==3 else Color.WHITE)
		material.set_shader_parameter("visual",kind)
		material.set_shader_parameter("rainbow",1.0 if kind in [21,22] else 0.0)
		material.set_shader_parameter("particle_time",.7)
		var a := await _image()
		if kind==21:
			assert(_pixel(a,Vector2.ZERO).get_luminance()<.01)
			assert(_pixel(a,Vector2(.361,.117)).get_luminance()>.2)
		elif kind==22:
			assert(_pixel(a,Vector2(0,.35)).get_luminance()<.01)
			for point in [Vector2(-.45,.29),Vector2(-.17,.52),Vector2(.17,.52),Vector2(.45,.29)]:assert(_pixel(a,point).get_luminance()>.2)
		elif kind==25:
			var yellow := _pixel(a,Vector2(0,.40))
			var blue := _pixel(a,Vector2(.63,-.1))
			assert(yellow.r>.9 and yellow.g>.6 and yellow.b<.25)
			assert(blue.b>blue.r*3 and blue.b>blue.g*1.5)
			assert(_pixel(a,Vector2(.365,.073)).get_luminance()>.8)
			assert(_pixel(a,Vector2(-.365,.073)).get_luminance()>.8)
			assert(_pixel(a,Vector2(.55,.45)).get_luminance()<.05)
			assert(_pixel(a,Vector2(.9,-.7)).get_luminance()<.01)
		elif kind==8:
			var film := _pixel(a,Vector2.ZERO)
			var glint := _pixel(a,Vector2(-.03,-.32))
			assert(film.b>film.g and film.g>film.r*2)
			assert(glint.get_luminance()>film.get_luminance()*1.3)
			assert(_pixel(a,Vector2(.9,0)).get_luminance()<.01)
		elif kind==13:
			var gold := _pixel(a,Vector2(0,-.19))
			var tip := _pixel(a,Vector2(.82,.17))
			assert(gold.r>gold.g and gold.g>gold.b*2)
			assert(gold.get_luminance()>tip.get_luminance()*1.5)
			assert(tip.get_luminance()>.01)
			assert(_pixel(a,Vector2(0,.20)).get_luminance()<.01)
			assert(_pixel(a,Vector2(.9,-.5)).get_luminance()<.01)
		elif kind==7:
			var gold := _pixel(a,Vector2.ZERO)
			assert(gold.r>gold.b and gold.g>gold.b)
			assert(gold.get_luminance()>.15)
			assert(_pixel(a,Vector2(.9,.9)).get_luminance()<.01)
		elif kind==3:
			var core := _pixel(a,Vector2.ZERO)
			assert(core.r>.8 and core.g>.8 and core.b>.8)
			assert(_pixel(a,Vector2(0,.4)).get_luminance()<core.get_luminance()*.25)
			assert(_pixel(a,Vector2(.9,.8)).get_luminance()<.01)
		else:
			var red := _pixel(a,Vector2(0,.06))
			var cheese := _pixel(a,Vector2(.16,.12))
			var crust := _pixel(a,Vector2(0,.56))
			assert(red.r>red.g*2)
			assert(cheese.g>.4)
			assert(crust.g<cheese.g)
		if kind in [25,8,13,7,3] and OS.has_environment("CARDSCAPE_CAPTURE_DIR"):
			var directory := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
			DirAccess.make_dir_recursive_absolute(directory)
			a.save_png(directory.path_join("bubble-glyph.png" if kind==8 else "banana-glyph.png" if kind==13 else "diamond-glyph.png" if kind==7 else "trail-glyph.png" if kind==3 else "adamantium-glyph.png"))
		material.set_shader_parameter("particle_time",1.4)
		var b := await _image()
		var motion := _difference(a,b)
		assert(motion>.1 if kind in [21,22,7] else motion==0.0)
		assert(_difference(b,await _image())==0.0)
		if kind==7:
			material.set_shader_parameter("particle_speed",0.0)
			var still := await _image()
			material.set_shader_parameter("particle_time",86400.0)
			assert(_difference(still,await _image())==0.0)
			material.set_shader_parameter("particle_speed",.25)
		rows.append({"visual":kind,"silhouette":true,"palette_motion":motion,"pause":true})
	print(JSON.stringify({"status":"passed","actual_gpu":true,"particles":rows}))
	stage.queue_free()
	await process_frame
	quit(0)
