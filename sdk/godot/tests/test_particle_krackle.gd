extends SceneTree
var camera: Camera3D
func _initialize():
	call_deferred("_run")
func _image() -> Image:
	for i in 3: await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func _pixel(image: Image,p: Vector2) -> Color:
	var at := camera.unproject_position(Vector3(p.x*.7,p.y*.7,0))
	return image.get_pixel(roundi(at.x),roundi(at.y))
func _run():
	RenderingServer.set_default_clear_color(Color.BLACK)
	var stage := Node3D.new()
	root.add_child(stage)
	camera=Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.current=true
	var node := MultiMeshInstance3D.new()
	var batch := MultiMesh.new()
	batch.transform_format=MultiMesh.TRANSFORM_3D
	batch.use_colors=true
	batch.use_custom_data=true
	var mesh := QuadMesh.new()
	mesh.size=Vector2.ONE
	batch.mesh=mesh
	batch.instance_count=1
	batch.set_instance_transform(0,Transform3D(Basis.from_scale(Vector3.ONE*1.4),Vector3.ZERO))
	batch.set_instance_color(0,Color("#3fe7ff"))
	node.multimesh=batch
	var material := ShaderMaterial.new()
	material.shader=load("res://addons/cardscape/card_particles.gdshader")
	material.set_shader_parameter("visual",2)
	material.set_shader_parameter("rainbow",0.0)
	node.material_override=material
	stage.add_child(node)
	var luminance := []
	for seed in [.1,.35,.6,.9]:
		batch.set_instance_custom_data(0,Color(seed,0,0,0))
		var image := await _image()
		var center := _pixel(image,Vector2.ZERO)
		var inside := _pixel(image,Vector2(.5,0))
		var outside := _pixel(image,Vector2(.98,0))
		assert(absf(center.get_luminance()-inside.get_luminance())<.01,"A filled disc must retain a solid center")
		assert(outside.get_luminance()<.025,"Halo must stay within the narrow disc edge")
		assert(center.b>center.r*2,"Particle tint must remain blue")
		luminance.append(center.get_luminance())
	assert(luminance[3]>luminance[0]*3,"Dark and bright circles must form distinct depth bands")
	for i in range(1,4):assert(luminance[i]>luminance[i-1])
	print(JSON.stringify({"status":"passed","actual_gpu":true,"solid_centers":true,"narrow_halo":true,"distinct_brightness":luminance,"single_batch":true}))
	stage.queue_free()
	await process_frame
	quit(0)
