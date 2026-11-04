extends SceneTree
var failures: Array[String] = []
func _initialize() -> void:call_deferred("run")
func check(condition: bool, message: String) -> void:
	if not condition:failures.append(message)
func run() -> void:
	var library:=load("res://library.tres") as CardscapeLibrary
	var scene:=Node3D.new()
	root.add_child(scene)
	var camera:=Camera3D.new()
	scene.add_child(camera)
	camera.position.z=2.7
	camera.current=true
	var card:=CardscapeCard.new()
	card.library=library
	card.card_id=str(library.catalog().activeCardId)
	card.detail_pixel_width=100000
	scene.add_child(card)
	for frame in 6:await process_frame
	card.set_process(false)
	card.effects_paused=true
	var surfaces:=card._surfaces.size()
	check(surfaces>0,"real materials exist")
	var fronts:=card._surfaces.filter(func(surface):return not surface.get_meta("reverse",false))
	var backs:=card._surfaces.filter(func(surface):return surface.get_meta("reverse",false))
	check(fronts.size()>1 and not backs.is_empty(),"both front and back branches are exercised")
	if fronts.size()<2 or backs.is_empty():quit(1);return
	# Exercise the overlay guard with a real material, independent of whether
	# the source artwork contains an optional material document layer.
	var overlay: MeshInstance3D=fronts[0]
	var previous_overlay: bool=overlay.get_meta("material_overlay",false)
	overlay.set_meta("material_overlay",true)
	card._definition["backScene"]=card._definition.get("backScene",{}).duplicate(true)
	card._definition.backScene["material"]={"enabled":true,"style":"ink","strength":.2,"speed":.4,"frequency":3.0,"color":"#abcdef","accent":"#fedcba","backgroundMode":"replace"}
	for index in CardscapeCard.MATERIAL_STYLES.size():
		card.material_settings={"enabled":true,"style":CardscapeCard.MATERIAL_STYLES[index],"target":"front","strength":.45,"speed":.7,"frequency":5.0,"color":"#12abef","accent":"#efab12","backgroundMode":"replace"}
		card._update(0)
		for surface in card._surfaces:
			var mat:=surface.material_override as ShaderMaterial
			var reverse: bool=surface.get_meta("reverse",false)
			check(mat.get_shader_parameter("material_style")== (5 if reverse else index),"material enum index and back override are retained")
			check(mat.get_shader_parameter("material_color")==Color("#abcdef" if reverse else "#12abef"),"independent front/back colors are applied")
			check(mat.get_shader_parameter("holographic")== (not reverse and index==1),"holographic flag is applied")
			var expected:=Vector4(.2,.4,3,5) if reverse else Vector4(.45,.7,5,3)
			check((mat.get_shader_parameter("component_material") as Vector4).is_equal_approx(expected),"front/back material scope is retained")
			check(mat.get_shader_parameter("material_replace")== (0.0 if surface.get_meta("material_overlay",false) else 1.0),"replacement respects overlay surfaces")
	overlay.set_meta("material_overlay",previous_overlay)
	card.set_effect_parameter("frame_color",Color("#010203"))
	card.depth_strength=1.2
	card._update(0)
	for surface in card._surfaces:
		var mat:=surface.material_override as ShaderMaterial
		check(mat.get_shader_parameter("frame_color")==Color(card._definition.frameStyle.color),"SDK frame values overwrite temporary gameplay overrides on the next update")
		check(is_equal_approx(float(mat.get_shader_parameter("depth")),1.2),"live gameplay properties remain responsive")
	card._detail_effects={"materials":false,"particles":false,"decorations":false}
	card._detail_parent={"level":"small","effects":card._detail_effects}
	card._update(0)
	for surface in card._surfaces:
		var mat:=surface.material_override as ShaderMaterial
		check(is_zero_approx((mat.get_shader_parameter("component_material") as Vector4).x),"small material LOD disables strength")
		check(is_zero_approx(float(mat.get_shader_parameter("material_replace"))),"small material LOD keeps source artwork")
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","surfaces":surfaces,"styles":CardscapeCard.MATERIAL_STYLES.size(),"failures":failures}))
	scene.queue_free()
	for frame in 3:await process_frame
	quit(0 if failures.is_empty() else 1)
