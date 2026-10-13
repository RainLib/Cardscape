extends SceneTree
var surface: MeshInstance3D
var material: ShaderMaterial
func _initialize():call_deferred("_run")
func _image() -> Image:
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func _difference(a: Image,b: Image) -> float:
	var total := 0.0
	var count := 0
	for y in range(390,510,2):
		for x in range(260,340,2):
			var p := a.get_pixel(x,y)
			var q := b.get_pixel(x,y)
			total+=absf(p.r-q.r)+absf(p.g-q.g)+absf(p.b-q.b)
			count+=3
	return total/count
func _configure(scale: float,extent: float,offset: Vector2):
	surface.position=Vector3(offset.x,offset.y,0)
	surface.scale=Vector3(scale,scale,1)
	material.set_shader_parameter("layer_transform",surface.transform)
	material.set_shader_parameter("background_extent",Vector2.ONE*extent)
func _run():
	RenderingServer.set_default_clear_color(Color.BLACK)
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	stage.add_child(camera)
	camera.position.z=2.7
	camera.current=true
	surface=MeshInstance3D.new()
	var mesh := QuadMesh.new()
	mesh.size=Vector2(1,1.5)
	surface.mesh=mesh
	material=ShaderMaterial.new()
	material.shader=load("res://addons/cardscape/card_surface.gdshader")
	var image := Image.create(1,1,false,Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	material.set_shader_parameter("art",ImageTexture.create_from_image(image))
	material.set_shader_parameter("background",true)
	material.set_shader_parameter("material_style",27)
	material.set_shader_parameter("component_material",Vector4(1,.35,4,1))
	material.set_shader_parameter("material_color",Color("#070b13"))
	material.set_shader_parameter("material_accent",Color("#e5edf2"))
	material.set_shader_parameter("material_replace",1.0)
	material.set_shader_parameter("clock",.7)
	surface.material_override=material
	stage.add_child(surface)
	_configure(1,1.18,Vector2.ZERO)
	var a := await _image()
	_configure(1.3,1.8,Vector2(.1,.05))
	material.set_shader_parameter("source_rect",Vector4(.12,.23,.60,.50))
	var b := await _image()
	var replacement_difference := _difference(a,b)
	assert(replacement_difference<.002)
	assert(_difference(b,await _image())==0.0)
	material.set_shader_parameter("material_replace",0.0)
	_configure(1,1.18,Vector2.ZERO)
	var original := await _image()
	_configure(1.3,1.8,Vector2(.1,.05))
	var shifted := await _image()
	var overlay_difference := _difference(original,shifted)
	assert(overlay_difference>.005)
	print(JSON.stringify({"status":"passed","actual_gpu":true,"replacement_difference":replacement_difference,"overlay_difference":overlay_difference,"pause":true,"source_crop_retained":true}))
	stage.queue_free()
	await process_frame
	quit(0)
