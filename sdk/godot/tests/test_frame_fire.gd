extends SceneTree
var card: CardscapeCard
var camera: Camera3D
var recipes: Array
var capture_directory := ""
func _initialize():
	call_deferred("_run")
func _image() -> Image:
	for i in 3: await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func _difference(a: Image,b: Image) -> float:
	var sum := 0.0
	for y in range(0,a.get_height(),4):
		for x in range(0,a.get_width(),4):
			var c := a.get_pixel(x,y)
			var d := b.get_pixel(x,y)
			sum+=absf(c.r-d.r)+absf(c.g-d.g)+absf(c.b-d.b)
	return sum
func _outside_count(image: Image,top: bool) -> int:
	var at := camera.unproject_position(Vector3(0,.75 if top else -.75,.044))
	var left := camera.unproject_position(Vector3(-.5,0,.044)).x
	var right := camera.unproject_position(Vector3(.5,0,.044)).x
	var count := 0
	for dy in range(2,30):
		var y := int(at.y)-dy if top else int(at.y)+dy
		for x in range(int(left)+20,int(right)-20,2):
			var c := image.get_pixel(x,y)
			if maxf(c.r,maxf(c.g,c.b))>.25: count+=1
	return count
func _run():
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library != null)
	var reference: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://tests/fire-reference.json"))
	recipes=reference.recipes
	capture_directory=reference.get("captureDirectory","")
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	definition.componentScenes={}
	definition.erase("backScene")
	definition.erase("backAsset")
	definition.erase("cardStats")
	definition.erase("assetKind")
	definition.layers=[{"id":"qa-frame","kind":"frame","visible":true}]
	definition.particles={"enabled":false}
	definition.material={"enabled":false}
	definition.cosmetics={"schema":"card-cosmetics/1","level":"authored","finish":"original","flare":"none","border":"custom","quality":"balanced"}
	var stage := Node3D.new()
	root.add_child(stage)
	camera=Camera3D.new()
	camera.position.z=2.7
	camera.keep_aspect=Camera3D.KEEP_HEIGHT
	camera.fov=CardscapeCard.preview_fov(Vector2(600,900))
	camera.current=true
	stage.add_child(camera)
	var environment := WorldEnvironment.new()
	environment.environment=Environment.new()
	environment.environment.background_mode=Environment.BG_COLOR
	environment.environment.background_color=Color("#14181c")
	stage.add_child(environment)
	card=CardscapeCard.new()
	card.library=library
	card._embedded_definition=definition
	card.effects_paused=true
	stage.add_child(card)
	for i in 5: await process_frame
	var aura := card._visual.get_node("frame-aura") as MeshInstance3D
	var rim := card._visual.get_node("frame-rim") as MeshInstance3D
	var fixed_mesh := rim.mesh
	var results := []
	var top_count := 0
	var bottom_count := 0
	for recipe in recipes:
		card._definition.frameStyle=recipe.style.duplicate(true)
		card.seek_effects(.7)
		var a: Image=await _image()
		assert(aura.visible)
		assert(rim.mesh==fixed_mesh)
		assert((rim.material_override as ShaderMaterial).get_shader_parameter("frame_finish")== (11 if recipe.style.finish=="fire-iridescent" else 10))
		card.seek_effects(1.4)
		var b: Image=await _image()
		var changing := _difference(a,b)
		assert(changing>1.0,"Flame must change on GPU")
		var paused: Image=await _image()
		assert(_difference(b,paused)<.001,"Paused frame must stay stable")
		top_count+=_outside_count(a,true)
		bottom_count+=_outside_count(a,false)
		var center := a.get_pixel(300,450)
		assert(maxf(center.r,maxf(center.g,center.b))<.15,"Aura must not cover the card center")
		results.append({"id":recipe.id,"motion_difference":changing,"pause_stable":true})
		if not capture_directory.is_empty():
			assert(a.save_png(capture_directory.path_join(recipe.id+".png"))==OK)
	assert(top_count>bottom_count*1.3,"Top flames must extend farther than the bottom")
	card._definition.frameStyle.animationSpeed=0.0
	card.seek_effects(0.0)
	var still0: Image=await _image()
	card.seek_effects(100.0)
	var still1: Image=await _image()
	assert(_difference(still0,still1)<.001,"Speed zero must freeze the intrinsic fire field")
	card.inspect(180)
	await _image()
	assert(not aura.visible)
	print(JSON.stringify({"status":"passed","actual_sdk":true,"palettes":results,"top_outside_pixels":top_count,"bottom_outside_pixels":bottom_count,"speed_zero_static":true,"back_hides_aura":true,"frame_mesh_reused":true,"center_clear":true}))
	stage.queue_free()
	await process_frame
	quit(0)
