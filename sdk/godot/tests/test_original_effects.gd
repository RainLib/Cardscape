extends SceneTree
var camera: Camera3D
var probe_material: ShaderMaterial
func _initialize():
	call_deferred("_run")
func _image() -> Image:
	for i in 3: await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func _difference(a: Image,b: Image) -> float:
	var total := 0.0
	var count := 0
	for y in range(0,a.get_height(),4):
		for x in range(0,a.get_width(),4):
			var p := a.get_pixel(x,y)
			var q := b.get_pixel(x,y)
			total+=absf(p.r-q.r)+absf(p.g-q.g)+absf(p.b-q.b)
			count+=3
	return total/count
func _run():
	var library := load("res://library.tres") as CardscapeLibrary
	assert(library != null)
	var definition := library.card(library.catalog().activeCardId)
	assert(definition.frameStyle.finish in ["orbit-silver","twin-aurora"])
	assert(definition.material.style=="caustics" and definition.material.backgroundMode=="replace")
	assert(definition.particles.visual=="starcore" and definition.particles.count==32)
	assert(definition.particles.emitter.side=="front")
	assert(not definition.has("framePreview"))
	var stage := Node3D.new()
	root.add_child(stage)
	camera=Camera3D.new()
	camera.position.z=2.7
	camera.keep_aspect=Camera3D.KEEP_HEIGHT
	camera.fov=CardscapeCard.preview_fov(root.get_visible_rect().size)
	camera.current=true
	stage.add_child(camera)
	RenderingServer.set_default_clear_color(Color("#242b2c"))
	var card := CardscapeCard.new()
	card.library=library
	card.card_id=definition.id
	card.effects_paused=true
	card.particle_budget=128
	stage.add_child(card)
	for i in 8: await process_frame
	card.seek_effects(.7)
	var batch := card._particle_node.multimesh
	assert(card._particle_count==32)
	assert((card._particle_node.material_override as ShaderMaterial).get_shader_parameter("visual")==24)
	assert(card.component_node("frame") != null)
	assert(not card.component_node("frame")._visual.get_node("frame-aura").visible)
	var output := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if output.is_empty(): output="user://original-effects/"
	DirAccess.make_dir_recursive_absolute(output)
	if not output.ends_with("/"): output+="/"
	for pose in [["front",0,0],["tilt",-18,13],["back",180,0]]:
		card.inspect(pose[1],pose[2])
		var image := await _image()
		assert(card._particle_count==(0 if pose[0]=="back" else 32))
		assert(image.save_png(output+"original-"+pose[0]+".png")==OK)
	card.inspect(0)
	for budget in [8,48,128]:
		card.particle_budget=budget
		card.seek_effects(100.0)
		assert(card._particle_count==mini(32,budget))
		assert(card._particle_node.multimesh==batch)
		for i in card._particle_count:
			var at := batch.get_instance_transform(i).origin
			assert(absf(at.x)<=.60 and absf(at.y)<=.85)
	# Compare authored JavaScript samples against actual runtime transforms.
	var expectation_path := "res://tests/original-particle-samples.json"
	if FileAccess.file_exists(expectation_path):
		var expected: Array = JSON.parse_string(FileAccess.get_file_as_string(expectation_path))
		card.particle_budget=128
		for row in expected:
			card.seek_effects(float(row.time))
			for i in 32:
				var sample: Array = row.samples[i]
				var transform := batch.get_instance_transform(i)
				assert(transform.origin.distance_to(Vector3(sample[0],sample[1],sample[2]))<.00005)
				assert(absf(transform.basis.y.length()-sample[3]*2)<.00005)
				assert(absf(batch.get_instance_color(i).a-sample[4])<.0041)
	card.visible=false
	var surface: Shader = load("res://addons/cardscape/card_surface.gdshader")
	var begin := surface.code.find("// Shared procedural finish")
	var end := surface.code.find("\nvoid fragment()",begin)
	assert(begin>=0 and end>begin)
	var shared := surface.code.substr(begin,end-begin)
	var probe_shader := Shader.new()
	probe_shader.code="shader_type spatial;render_mode unshaded,cull_disabled;uniform float sample_clock=0.;uniform float sample_kind=0.;uniform bool replace_art=true;"+shared+"""
void fragment(){
 vec3 low=vec3(.02745,.20392,.29804),hi=vec3(.56863,.96078,.89804);
	 if(sample_kind<1.5){
  vec4 metrics=vec4(22./1024.,48./1024.,16./1024.,3./1024.);
  float d=rimDistance(UV*vec2(1.,1.5),metrics.y);if(d<0.||d>metrics.x)discard;
	  ALBEDO=rimColor(vec3(.141,.216,.267),vec3(.737,.914,1.),UV,vec2(0.),sample_clock,metrics,19.+sample_kind,vec2(0.,1.),1.);
 }else{
  vec3 base=vec3(.12+(1.-UV.y)*.3,.23+UV.x*.25,.27);
  ALBEDO=finishColor(base,UV,sample_clock,vec2(0.),28.,4.,low,hi,replace_art);
 }
}
"""
	var mesh := QuadMesh.new()
	mesh.size=Vector2(1,1.5)
	var plane := MeshInstance3D.new()
	plane.mesh=mesh
	probe_material=ShaderMaterial.new()
	probe_material.shader=probe_shader
	plane.material_override=probe_material
	stage.add_child(plane)
	var results := []
	for kind in [0,1,2]:
		probe_material.set_shader_parameter("sample_kind",kind)
		probe_material.set_shader_parameter("sample_clock",0)
		var zero := await _image()
		probe_material.set_shader_parameter("sample_clock",1)
		var one := await _image()
		var motion := _difference(zero,one)
		assert(motion>.00001,str(kind)+" no motion")
		probe_material.set_shader_parameter("sample_clock",8 if kind==0 else 10)
		var cycle := _difference(zero,await _image())
		assert(cycle<.001,str(kind)+" loop seam")
		probe_material.set_shader_parameter("sample_clock",.7)
		var paused := await _image()
		assert(_difference(paused,await _image())==0)
		assert(paused.save_png(output+["frame","twin-aurora","caustics"][kind]+".png")==OK)
		var overlay_delta := 0.0
		if kind==2:
			probe_material.set_shader_parameter("replace_art",false)
			overlay_delta=_difference(paused,await _image())
			assert(overlay_delta>.02)
		results.append({"kind":kind,"motion":motion,"cycle":cycle,"paused":true,"overlay_difference":overlay_delta})
	print(JSON.stringify({"status":"passed","actual_export":true,"original_designs":["F01","F02","P01","B05"],"shared_shaders":results,"single_particle_batch":true,"budgets":[8,48,128],"textures":library.textures.size()}))
	stage.queue_free()
	await process_frame
	quit(0)
