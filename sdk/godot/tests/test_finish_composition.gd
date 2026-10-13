extends SceneTree
var card: CardscapeCard
var source_image: Image
var source_texture: ImageTexture
func _initialize():
	call_deferred("_run")
func _color_at_center() -> Vector3:
	for i in 3: await process_frame
	await RenderingServer.frame_post_draw
	var color := root.get_texture().get_image().get_pixel(300,450)
	return Vector3(color.r,color.g,color.b)
func _run():
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library != null)
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	definition.componentScenes={}
	definition.erase("assetKind")
	definition.layers=[{"id":"qa-background","name":"QA Background","kind":"background","asset":"qa-flat","visible":true,"x":0,"y":0,"scale":1,"opacity":1}]
	definition.cosmetics={"schema":"card-cosmetics/1","level":"authored","finish":"original","flare":"authored","border":"custom","quality":"balanced"}
	definition.particles={"enabled":false}
	definition.maskAssets={}
	definition.material={"enabled":true,"style":"prism","target":"background","backgroundMode":"replace","strength":1.0,"speed":.65,"frequency":4.0,"color":"#799dff","accent":"#ff8ee4"}
	source_image=Image.create(2,2,false,Image.FORMAT_RGBA8)
	source_image.fill(Color("#ff1493"))
	source_texture=ImageTexture.create_from_image(source_image)
	library.textures["qa-flat"]=source_texture
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.keep_aspect=Camera3D.KEEP_HEIGHT
	camera.fov=CardscapeCard.preview_fov(Vector2(600,900))
	camera.current=true
	stage.add_child(camera)
	card=CardscapeCard.new()
	card.library=library
	card._embedded_definition=definition
	card.effects_paused=true
	stage.add_child(card)
	for i in 5: await process_frame
	card.seek_effects(.7)
	var full: Vector3=await _color_at_center()
	card.material_settings={"strength":.2}
	card.seek_effects(.7)
	var weak: Vector3=await _color_at_center()
	assert(full.distance_to(weak)>.08,"Replacement strength must change the rendered effect")
	source_image.fill(Color("#00cfff"))
	source_texture.update(source_image)
	var replaced: Vector3=await _color_at_center()
	assert(weak.distance_to(replaced)<.01,"Replacement cannot leak original art")
	card.material_settings={"backgroundMode":"overlay","strength":.2}
	card.seek_effects(.7)
	var blue: Vector3=await _color_at_center()
	source_image.fill(Color("#ff1493"))
	source_texture.update(source_image)
	var pink: Vector3=await _color_at_center()
	assert(blue.distance_to(pink)>.3,"Overlay must retain original art")
	print(JSON.stringify({"status":"passed","gpu_replacement_strength":true,"replacement_covers_original":true,"overlay_preserves_original":true,"samples":{"full":str(full),"weak":str(weak),"blue":str(blue),"pink":str(pink)}}))
	stage.queue_free()
	await process_frame
	quit(0)
