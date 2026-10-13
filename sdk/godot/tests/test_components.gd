extends SceneTree
var failures: Array[String] = []
func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var library := load("res://library.tres") as CardscapeLibrary
	check(library != null,"library loads")
	if not library:
		quit(1)
		return
	var original := library.data_json
	var data: Dictionary = JSON.parse_string(original)
	var definition: Dictionary = data.cards[0]
	var texture_key: String = library.textures.keys()[0]
	var back: Dictionary = definition.duplicate(true)
	for key in ["backScene","backAsset","componentScenes","cardStats"]:
		back.erase(key)
	back.layers = [{"id":"back-art","kind":"background","asset":texture_key,"visible":true,"spatial":{"role":"far","z":-.1,"clip":true}},{"id":"back-frame","kind":"frame","visible":true}]
	back.frameStyle.color = "#dfb12d"
	back.frameStyle.accent = "#fff3b1"
	back.frameStyle.finish = "metal"
	back.effects.cape = false
	back.effects.flow = false
	back.material = {"enabled":true,"style":"water","target":"background","strength":.4}
	back.shader.fragmentTarget = "all"
	back.particles = {"enabled":true,"visual":"orb","count":30,"size":.012,"speed":.02,"spread":.4,"life":5,"palette":"gold","color":"#f0ca60","opacity":.8,"trajectory":"halo","radius":.03,"emitter":{"shape":"perimeter"}}
	back.slots = [{"id":"anchor","u":.5,"v":.5,"z":0,"scale":1,"rotation":0,"clip":true,"effect":"pulse","strength":.1,"speed":1}]
	back.layers[0].slotId = "anchor"
	var frame: Dictionary = back.duplicate(true)
	frame.layers = [{"id":"ice-frame","kind":"frame","visible":true}]
	frame.frameStyle.finish = "ice"
	frame.frameStyle.color = "#39c8f4"
	frame.particles.count = 20
	frame.material.enabled = false
	definition.backScene = {"schema":"card-back/1","layers":[],"document":back}
	definition.componentScenes = {"frame":{"schema":"card-frame/1","document":frame}}
	definition.particles.count = 12
	definition.particles.enabled = true
	library.data_json = JSON.stringify(data)
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	camera.position.z = float(definition.get("spatial",{}).get("cameraDistance",2.7))
	camera.current = true
	stage.add_child(camera)
	var card := CardscapeCard.new()
	card.library = library
	card.card_id = definition.id
	card.particle_budget = 16
	card.effects_paused = true
	stage.add_child(card)
	for i in 4: await process_frame
	check(card._component_nodes.size()==2,"authored back and frame reuse the main renderer")
	if card._component_nodes.size()!=2:
		quit(1)
		return
	var rear: CardscapeCard = card._component_nodes.back
	var rim: CardscapeCard = card._component_nodes.frame
	check(card.component_node("back")==rear,"game can access the composed back renderer")
	check(not rear.visible and rim.visible,"front composition hides authored reverse")
	check(rear._definition.layers.size()==2,"back retains all authored layers")
	check(rear._definition.frameStyle.color=="#dfb12d","back frame is independent")
	check(is_equal_approx(rear.rotation.y,PI),"reverse composed with a rigid half turn")
	card.seek_effects(1.25)
	check(is_equal_approx(rear._clock,1.25) and is_equal_approx(rim._clock,1.25),"all components share one effect clock")
	check(card.diagnostics().particles<=16,"particle budget spans parent and all components")
	card.material_settings={"enabled":true,"style":"ink","target":"front","strength":1.0}
	card._update(0)
	for surface in rim._surfaces:
		check(surface.material_override.get_shader_parameter("material_style")==5,"whole-front material also reaches authored frame")
	check(rear._definition.material.style=="water","front material leaves independent reverse style intact")
	card.material_settings={}
	card.flip_to_back()
	for i in 3: await process_frame
	check(rear.visible and not rim.visible,"flip changes the active independent component")
	check(card.diagnostics().particles<=16,"reverse also respects the aggregate budget")
	rear._definition.actions=[{"id":"float","event":"idle","duration":2,"loop":true,"motion":1,"emission":1,"bend":0,"tracks":{"x":[{"at":0,"value":0},{"at":1,"value":20}]}}]
	check(rear.play_action("float"),"reverse owns an independent action")
	card._update(.4)
	check(is_equal_approx(rear._action_time,.4),"component action advances once through the parent")
	check(rear._visual.position.x>0,"component action moves its own renderer")
	rear._action={}
	for surface in rear._surfaces:
		var mat := surface.material_override as ShaderMaterial
		check(mat.get_shader_parameter("metrics").x==float(back.frameStyle.width)/1024.0,"reverse owns clipping metrics")
		check(mat.get_shader_parameter("frame_color")==Color("#dfb12d"),"reverse owns frame palette")
		check(mat.get_shader_parameter("custom_effect")==true,"reverse owns its custom shader scope")
		check(mat.get_shader_parameter("clock")==1.25,"paused reverse uses deterministic time")
		check(mat.shader.get_shader_uniform_list().size()>0,"authored reverse shader compiles")
		if surface.get_meta("layer_id")=="back-art":
			check(mat.get_shader_parameter("slot_effect").x==1,"reverse keeps authored Slot effects")
	card._definition.actions=[{"id":"fade","event":"enter","duration":1,"loop":false,"motion":1,"emission":1,"bend":0,"tracks":{"opacity":[{"at":0,"value":.4},{"at":1,"value":.4}]}}]
	check(card.play_action("fade"),"whole-card action exists")
	card.seek_action(.5,true)
	for surface in rear._surfaces:
		check(is_equal_approx(surface.material_override.get_shader_parameter("root_opacity"),.4),"whole-card opacity reaches reverse")
	card.effects_playing=false
	card._update(0)
	check(card.diagnostics().particles==0,"disabling effects also disables component emitters")
	library.data_json = original
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"authored_components":2,"independent_reverse":true,"shared_clock":true,"aggregate_budget":16}))
	stage.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
