extends RefCounted
## Connected, bounded ribbon. Node, mesh and material survive pause and seeking.
static func _world_edges(samples: Array, index: int) -> PackedVector3Array:
	var s: Array=samples[index]
	var previous: Array=samples[maxi(0,index-1)]
	var next: Array=samples[mini(samples.size()-1,index+1)]
	var center:=Vector3(s[0],s[1],s[2])
	var a:=center-Vector3(previous[0],previous[1],previous[2])
	var b:=Vector3(next[0],next[1],next[2])-center
	if a.length()<1e-9:a=b
	if b.length()<1e-9:b=a
	var plane:=Vector3(s[7],s[8],s[9])
	var up:=Vector3(s[10],s[11],s[12])
	var left:=plane.cross(a)
	var right:=plane.cross(b)
	if left.length()<1e-9:left=up
	if right.length()<1e-9:right=up
	if left.length()<1e-9:left=Vector3.UP
	if right.length()<1e-9:right=Vector3.UP
	left=left.normalized()
	right=right.normalized()
	var normal:=left+right
	if normal.length()<1e-9:normal=right
	normal=normal.normalized()
	var width: float=float(s[3])/maxf(.4,absf(normal.dot(right)))
	return PackedVector3Array([center+normal*width,center-normal*width])

static func update(state: Dictionary, samples: Array, parent: Node3D, tint: Color, blend: String, priority: int, opacity: float) -> void:
	var count := samples.size()
	if count < 2:
		state.trail_samples=[]
		state.trail_positions=PackedVector3Array()
		if state.has("trail"): state.trail.visible=false
		return
	if not state.has("trail"):
		var node := MeshInstance3D.new()
		node.name="ActionTrail"
		node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.mesh=ArrayMesh.new()
		node.material_override=ShaderMaterial.new()
		parent.add_child(node)
		state.trail=node
	var node: MeshInstance3D=state.trail
	var mesh := node.mesh as ArrayMesh
	var mat := node.material_override as ShaderMaterial
	if mat.get_meta("blend","")!=blend:
		var shader := Shader.new()
		shader.code=preload("res://addons/cardscape/action_trail.gdshader").code.replace("blend_mix","blend_mix" if blend=="normal" else "blend_add")
		mat.shader=shader
		mat.set_meta("blend",blend)
	mat.render_priority=priority
	mat.set_shader_parameter("tint",tint)
	mat.set_shader_parameter("opacity",opacity)
	var edges: Array[PackedVector3Array]=[]
	for i in count:
		if samples[i].size()>7:
			edges.append(_world_edges(samples,i))
			continue
		var center := Vector2(samples[i][0],samples[i][1])
		var a := center-Vector2(samples[maxi(0,i-1)][0],samples[maxi(0,i-1)][1])
		var b := Vector2(samples[mini(count-1,i+1)][0],samples[mini(count-1,i+1)][1])-center
		var al := a.length()
		var bl := b.length()
		if al>1e-9: a/=al
		if bl>1e-9: b/=bl
		if al<=1e-9: a=b
		if bl<=1e-9: b=a
		var normal := Vector2(-a.y-b.y,a.x+b.x)
		if normal.length()<1e-9: normal=Vector2(-b.y,b.x)
		if normal.length()<1e-9: normal=Vector2(0,1)
		normal=normal.normalized()
		var width: float=float(samples[i][3])/maxf(.4,absf(normal.dot(Vector2(-b.y,b.x))))
		var left:=center+normal*width
		var right:=center-normal*width
		edges.append(PackedVector3Array([Vector3(left.x,left.y,samples[i][2]),Vector3(right.x,right.y,samples[i][2])]))
	var points := PackedVector3Array()
	var attributes := PackedFloat32Array()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	for i in count-1:
		for corner in [Vector2i(i,0),Vector2i(i,1),Vector2i(i+1,0),Vector2i(i+1,0),Vector2i(i,1),Vector2i(i+1,1)]:
			var s: Array=samples[corner.x]
			var p: Vector3=edges[corner.x][corner.y]
			var v := Vector2(float(s[5]),1.0 if corner.y==0 else -1.0)
			points.append(p)
			uv.append(v)
			uv2.append(Vector2(float(s[4]),0))
			attributes.append_array(PackedFloat32Array([v.x,v.y,float(s[4]),0]))
	if state.get("trail_vertices",0)!=points.size():
		mesh.clear_surfaces()
		var arrays: Array=[]
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX]=points
		arrays[Mesh.ARRAY_TEX_UV]=uv
		arrays[Mesh.ARRAY_TEX_UV2]=uv2
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays,[],{},Mesh.ARRAY_FLAG_USE_DYNAMIC_UPDATE)
		state.trail_vertices=points.size()
	else:
		mesh.surface_update_vertex_region(0,0,points.to_byte_array())
		mesh.surface_update_attribute_region(0,0,attributes.to_byte_array())
	mesh.custom_aabb=AABB(Vector3(-8,-8,-8),Vector3(16,16,16))
	state.trail_positions=points
	state.trail_samples=samples
	node.visible=true
