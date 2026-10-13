extends SceneTree
var failures: Array[String] = []
func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)
func _initialize() -> void:
	call_deferred("run")
func reverse_nodes(card: CardscapeCard) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	for surface in card._surfaces:
		if surface.get_meta("reverse",false):
			result.append(surface)
	return result
func run() -> void:
	var library := load("res://library.tres") as CardscapeLibrary
	check(library != null,"library loads")
	if not library:
		quit(1)
		return
	var original := library.data_json
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.current=true
	root.add_child(camera)
	var first := CardscapeCard.new()
	first.library=library
	first.card_id=library.catalog().activeCardId
	root.add_child(first)
	var second := CardscapeCard.new()
	second.library=library
	second.card_id=first.card_id
	root.add_child(second)
	await process_frame
	await process_frame
	var reverse := reverse_nodes(first)
	var authored := first.component_node("back")
	if authored:
		check(not authored._definition.layers.is_empty(),"authored reverse contains exported layers")
		check(reverse.is_empty(),"legacy layers are not duplicated over authored reverse")
		check(authored._definition.maskAssets==first._definition.backScene.document.maskAssets,"reverse owns its masks")
		check(authored._definition.frameStyle==first._definition.backScene.document.frameStyle,"reverse owns its frame settings")
		for surface in authored._surfaces:
			var material := surface.material_override as ShaderMaterial
			check(material.shader.get_shader_uniform_list().size()>0,"authored reverse shader compiles")
			if surface.get_meta("layer_id","").begins_with("frame-"):
				continue
			check(material.get_shader_parameter("art")!=null,"authored reverse texture is exported")
	else:
		check(reverse.size()==first._definition.get("backScene",{}).get("layers",[]).size(),"all reverse layers instantiate outside the hero stack")
		check(reverse.size()>1,"layered reverse fixture")
	first.material_settings={"enabled":true,"strength":.95,"target":"both"}
	first._update(0)
	for surface in reverse:
		var mat := surface.material_override as ShaderMaterial
		check(mat.get_shader_parameter("back_side")==true,"reverse UV direction")
		check(mat.get_shader_parameter("face_mode")==1,"reverse visible only after flip")
		check(mat.get_shader_parameter("custom_effect")==false,"hero effect cannot leak into reverse asset")
		check(is_equal_approx(mat.get_shader_parameter("component_material").x,float(first._definition.backScene.material.strength)),"reverse owns its material")
		check(mat.get_shader_parameter("art")!=null,"reverse texture is exported")
		check(mat.shader.get_shader_uniform_list().size()>0,"reverse shader compiles")
	if not reverse.is_empty():
		check(reverse[0].position.z>reverse.back().position.z,"foreground projects toward the rear camera")
	first.flip_to_back()
	check(is_equal_approx(first._visual.rotation.y,PI),"card flips to independent reverse face")
	for component in library.catalog().components:
		if component.kind=="back" and component.versions.size()>1:
			check(first.set_component("back",component.id,component.versions.back().version),"game replaces reverse asset version")
			break
	await process_frame
	await process_frame
	if first.component_node("back"):
		check(first.component_node("back").visible,"authored reverse displays after flip")
	check(second.component_overrides.is_empty(),"second instance keeps its own binding")
	check(library.data_json==original,"shared reverse catalog unchanged")
	print("CARDSCAPE_BACK_RESULT "+JSON.stringify({"status":"passed" if failures.is_empty() else "failed","ok":failures.is_empty(),"failures":failures,"reverse_layers":reverse_nodes(first).size(),"authored_reverse":first.component_node("back")!=null}))
	quit(0 if failures.is_empty() else 1)
