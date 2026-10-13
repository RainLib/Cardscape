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
func _chain_holes(image: Image,width: float) -> int:
	var outer := camera.unproject_position(Vector3(-.5,.6,.045))
	var inner := camera.unproject_position(Vector3(-.5+width/1024.0,-.6,.045))
	var count := 0
	var bright := 0
	for y in range(int(outer.y)+1,int(inner.y)-1):
		for x in range(int(outer.x)+1,int(inner.x)-1):
			var c := image.get_pixel(x,y)
			if maxf(c.r,maxf(c.g,c.b))<.15: count+=1
			else: bright+=1
	assert(bright>100,"Chain links must stay visible beside the cutouts")
	return count
func _brain_shades(image: Image,width: float) -> Dictionary:
	var outer := camera.unproject_position(Vector3(-.5,.6,.045))
	var inner := camera.unproject_position(Vector3(-.5+width/1024.0,-.6,.045))
	var shades := {"bright":0,"body":0,"groove":0}
	for y in range(int(outer.y)+2,int(inner.y)-2):
		for x in range(int(outer.x)+2,int(inner.x)-2):
			var c := image.get_pixel(x,y)
			var luminance := (c.r+c.g+c.b)/3.0
			if luminance>.75:shades.bright+=1
			elif luminance>.28 and luminance<.70:shades.body+=1
			elif luminance<.18:shades.groove+=1
	assert(shades.bright>50 and shades.body>100 and shades.groove>50,"Brain folds require separate white reflections, silver body and dark grooves")
	return shades
func _candy_shades(image: Image,width: float) -> Dictionary:
	var outer := camera.unproject_position(Vector3(-.5,.6,.045))
	var inner := camera.unproject_position(Vector3(-.5+width/1024.0,-.6,.045))
	var shades := {"orange":0,"purple":0}
	for y in range(int(outer.y)+2,int(inner.y)-2):
		for x in range(int(outer.x)+2,int(inner.x)-2):
			var c := image.get_pixel(x,y)
			if c.r>.4 and c.g>.1 and c.r>c.b*1.4:shades.orange+=1
			elif c.r>.2 and c.b>.3 and c.b>c.g*1.4:shades.purple+=1
	assert(shades.orange>100 and shades.purple>100,"Halloween candy must preserve both orange and purple painted bands")
	return shades
func _sticker_pixels(image: Image) -> int:
	var outer := camera.unproject_position(Vector3(-.5,.6,.045))
	var bottom := camera.unproject_position(Vector3(-.5,-.6,.045))
	var count := 0
	for y in range(int(outer.y),int(bottom.y)):
		for x in range(maxi(0,int(outer.x)-65),int(outer.x)-4):
			var c := image.get_pixel(x,y)
			if c.g>.45 and c.g>c.b*2.0:count+=1
	assert(count>100,"Halloween silhouettes must remain visible outside the rim")
	return count
func _run():
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library != null)
	var reference: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://tests/frame-detail-reference.json"))
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
	var aura := card._visual.get_node_or_null("frame-aura") as MeshInstance3D
	var rim := card._visual.get_node("frame-rim") as MeshInstance3D
	var fixed_mesh := rim.mesh
	var results := []
	var top_count := 0
	var bottom_count := 0
	for recipe in recipes:
		card._embedded_definition.frameStyle=recipe.style.duplicate(true)
		card._embedded_definition.frameGeometry=recipe.geometry.duplicate(true)
		card.rebuild()
		aura=card._visual.get_node_or_null("frame-aura") as MeshInstance3D
		rim=card._visual.get_node("frame-rim") as MeshInstance3D
		fixed_mesh=rim.mesh
		card.seek_effects(.7)
		var a: Image=await _image()
		assert((aura!=null and aura.visible)==recipe.aura)
		assert(rim.mesh==fixed_mesh)
		assert((rim.material_override as ShaderMaterial).get_shader_parameter("frame_finish")==recipe.styleIndex)
		card.seek_effects(1.4)
		var b: Image=await _image()
		var changing := _difference(a,b)
		assert(changing>.05 if recipe.dynamic else changing<.001,"Animated reflections must move; static detail topology stays fixed")
		card.inspect(-18,13)
		assert(_difference(a,await _image())>1.0,"Detail rim must reflect the viewing angle")
		card.inspect(0,0)
		var paused: Image=await _image()
		assert(_difference(b,paused)<.001,"Paused frame must stay stable")
		if not recipe.aura:
			top_count+=_outside_count(a,true)
			bottom_count+=_outside_count(a,false)
		var center := a.get_pixel(300,450)
		assert(maxf(center.r,maxf(center.g,center.b))<.15,"Aura must not cover the card center")
		var neon_pixels := 0
		if recipe.style.finish=="neonnights":
			for panel_center in [Vector3(-.526,.41,.045),Vector3(1.026-.5,-.12,.045)]:
				var screen := camera.unproject_position(panel_center)
				for y in range(int(screen.y)-35,int(screen.y)+35):
					for x in range(int(screen.x)-15,int(screen.x)+15):
						var color := a.get_pixel(x,y)
						if color.r>.35 and color.b>.2 and color.r>color.g*1.5:neon_pixels+=1
			assert(neon_pixels>150,"Neon lettered panels must be visible outside both side rails")
		var holes := _chain_holes(a,float(recipe.style.width)) if recipe.style.finish=="chains" else 0
		if recipe.style.finish=="chains": assert(holes>100,"Chain holes must expose the viewport, rather than black paint")
		var spray_pixels := 0
		if recipe.style.finish=="pax":
			spray_pixels=_outside_count(a,true)+_outside_count(a,false)
			assert(spray_pixels>50,"Penny Arcade spray must be visible outside the printed rim")
		var brain_shades := {}
		if recipe.style.finish=="brains":brain_shades=_brain_shades(a,recipe.style.width)
		var candy_shades := {}
		if recipe.style.finish=="candy-halloween":candy_shades=_candy_shades(a,recipe.style.width)
		var sticker_pixels := _sticker_pixels(a) if recipe.style.finish=="halloween-stickers" else 0
		card._definition.frameStyle.animationSpeed=0.0
		card.seek_effects(0.0)
		var still_a: Image=await _image()
		card.seek_effects(100.0)
		assert(_difference(still_a,await _image())<.001,"Zero speed must freeze detail reflections")
		results.append({"id":recipe.id,"motion_difference":changing,"pause_stable":true,"aura":recipe.aura,"chain_hole_pixels":holes,"neon_panel_pixels":neon_pixels,"spray_pixels":spray_pixels,"brain_shades":brain_shades,"candy_shades":candy_shades,"sticker_pixels":sticker_pixels,"speed_zero_static":true})
		if not capture_directory.is_empty():
			assert(a.save_png(capture_directory.path_join(recipe.id+".png"))==OK)
	assert(top_count==0 and bottom_count==0,"Non-emissive rims must have no invented aura")
	card._definition.frameStyle.animationSpeed=0.0
	card.seek_effects(0.0)
	var still0: Image=await _image()
	card.seek_effects(100.0)
	var still1: Image=await _image()
	assert(_difference(still0,still1)<.001,"Zero speed keeps all detail rims fixed")
	card.inspect(180)
	await _image()
	assert(aura==null or not aura.visible)
	print(JSON.stringify({"status":"passed","actual_sdk":true,"palettes":results,"top_outside_pixels":top_count,"bottom_outside_pixels":bottom_count,"speed_zero_static":true,"chain_no_outer_aura":true,"frame_mesh_reused":true,"center_clear":true}))
	stage.queue_free()
	await process_frame
	quit(0)
