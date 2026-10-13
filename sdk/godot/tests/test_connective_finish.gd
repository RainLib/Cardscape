extends SceneTree
var card: CardscapeCard
var source_image: Image
var source_texture: ImageTexture
func _initialize():
	call_deferred("_run")
func _image() -> Image:
	for i in 3: await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func _difference(a: Image,b: Image) -> float:
	var difference := 0.0
	for y in range(0,900,5):
		for x in range(0,600,5):
			var c := a.get_pixel(x,y)
			var d := b.get_pixel(x,y)
			difference+=absf(c.r-d.r)+absf(c.g-d.g)+absf(c.b-d.b)
	return difference
func _run():
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library != null)
	var fixture: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://tests/finish-reference.json"))
	var definition := library.card(library.catalog().activeCardId).duplicate(true)
	definition.componentScenes={}
	definition.erase("backScene")
	definition.erase("backAsset")
	definition.erase("cardStats")
	definition.erase("assetKind")
	definition.layers=[{"id":"qa-background","kind":"background","asset":"qa-flat","visible":true,"x":0,"y":0,"scale":1,"opacity":1}]
	definition.layers.append({"id":"qa-near","kind":"image","asset":"qa-near","visible":true,"x":0,"y":0,"scale":1,"opacity":1,"spatial":{"role":"near","z":.02,"clip":true}})
	definition.particles={"enabled":false}
	definition.maskAssets={}
	definition.cosmetics={"schema":"card-cosmetics/1","level":"authored","finish":"original","flare":"none","border":"custom","quality":"balanced"}
	source_image=Image.create(2,2,false,Image.FORMAT_RGBA8)
	source_image.fill(Color("#ff1493"))
	source_texture=ImageTexture.create_from_image(source_image)
	library.textures["qa-flat"]=source_texture
	var near_image := Image.create(2,2,false,Image.FORMAT_RGBA8)
	near_image.fill(Color("#40f0a059"))
	library.textures["qa-near"]=ImageTexture.create_from_image(near_image)
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.keep_aspect=Camera3D.KEEP_HEIGHT
	camera.fov=CardscapeCard.preview_fov(Vector2(600,900))
	camera.current=true
	stage.add_child(camera)
	definition.material=fixture.recipes[0].recipe.duplicate(true)
	card=CardscapeCard.new()
	card.library=library
	card._embedded_definition=definition
	card.effects_paused=true
	stage.add_child(card)
	for i in 5: await process_frame
	var results := []
	var prior: Image
	for recipe in fixture.recipes:
		card.material_settings=recipe.recipe.duplicate(true)
		card.seek_effects(.7)
		var a: Image=await _image()
		if prior != null: assert(_difference(prior,a)>10.0,"Palettes must look different")
		prior=a
		for surface in card._surfaces:
			assert((surface.material_override as ShaderMaterial).get_shader_parameter("material_style")==24)
			assert(surface.visible==(surface.get_meta("layer_id","")=="qa-background"),"Only one original background plane may render the replacement finish")
		card.seek_effects(1.4)
		var b: Image=await _image()
		var motion := _difference(a,b)
		assert(motion>1.0,"Satin reflection must move on GPU")
		assert(_difference(b,await _image())<.001,"Paused finish must remain stable")
		source_image.fill(Color("#00cfff"))
		source_texture.update(source_image)
		card.seek_effects(.7)
		assert(_difference(a,await _image())<.001,"Replacement must hide source art")
		card.material_settings.backgroundMode="overlay"
		card.material_settings.strength=.5
		var blue: Image=await _image()
		for surface in card._surfaces: assert(surface.visible,"Overlay must restore original background planes")
		source_image.fill(Color("#ff1493"))
		source_texture.update(source_image)
		assert(_difference(blue,await _image())>100.0,"Overlay must retain source art")
		card.material_settings=recipe.recipe.duplicate(true)
		card.material_settings.speed=0.0
		card.seek_effects(0.0)
		var still: Image=await _image()
		card.seek_effects(100.0)
		assert(_difference(still,await _image())<.001,"Speed zero must freeze reflection")
		card.material_settings=recipe.recipe.duplicate(true)
		card.seek_effects(.7)
		card.inspect(-18,13)
		assert(_difference(a,await _image())>100.0,"Inspection must update view and projection")
		card.inspect(0,0)
		if fixture.has("captureDirectory"):
			assert((await _image()).save_png(str(fixture.captureDirectory).path_join(recipe.id+".png"))==OK)
		results.append({"id":recipe.id,"motion_difference":motion,"pause_stable":true,"speed_zero_stable":true,"replacement_covers_source":true,"overlay_keeps_source":true})
	print(JSON.stringify({"status":"passed","gpu":true,"recipes":results}))
	stage.queue_free()
	await process_frame
	quit(0)
