extends SceneTree
func _initialize() -> void:
	var library := CardscapeLibrary.new()
	var base := Shader.new()
	base.code="shader_type spatial; render_mode unshaded, depth_draw_never, shadows_disabled; uniform float gain=1.; void fragment(){ALBEDO=vec3(gain); ALPHA=1.;}"
	library.shaders={"test":base}
	assert(library.surface_shader("test",false,false)==base)
	var ordered := library.surface_shader("test",true,false)
	assert(ordered==library.surface_shader("test",true,false),"identical surface render modes reuse the Shader")
	assert("depth_test_disabled" in ordered.code and not "depth_test_disabled" in base.code,"painter order is enabled only on the requested variant")
	var additive := library.surface_shader("test",true,true)
	assert(additive!=ordered and "blend_add" in additive.code,"different blend modes retain different Shader programs")
	var first := ShaderMaterial.new()
	var second := ShaderMaterial.new()
	first.shader=ordered
	second.shader=ordered
	first.set_shader_parameter("gain",.3)
	second.set_shader_parameter("gain",.8)
	assert(is_equal_approx(first.get_shader_parameter("gain"),.3) and is_equal_approx(second.get_shader_parameter("gain"),.8),"instance uniforms remain independent")
	base.code=base.code.replace("vec3(gain)","vec3(gain*.5)")
	assert(library.surface_shader("test",true,false)!=ordered,"changed source invalidates the cached Shader")
	assert(library.surface_shader("missing",true,false)==null)
	print(JSON.stringify({"status":"passed","checks":7,"scope":"shader reuse and instance isolation"}))
	quit()
