@tool
class_name CardscapeCard
extends Node3D
## Game owns placement/state; each instance owns its materials and overrides.
signal action_finished(id: String)
@export var library: CardscapeLibrary:
	set(value):
		library = value
		_queue_rebuild()
@export var card_id: String = "":
	set(value):
		card_id = value
		_queue_rebuild()
@export var locale: String = "zh-CN":
	set(value):
		locale = value
		_queue_rebuild()
@export var component_overrides: Dictionary = {}:
	set(value):
		component_overrides = value.duplicate(true)
		_queue_rebuild()
@export_range(0.0, 1.5, .01) var depth_strength: float = 1.0
@export var gameplay_stats: Dictionary = {}:
	set(value):
		if gameplay_stats == value:
			return
		gameplay_stats = value.duplicate(true)
		_queue_rebuild()
@export var effects_playing: bool = true
@export var material_settings: Dictionary = {}
@export var particle_settings: Dictionary = {}
var _queued: bool = false
var _visual: Node3D
var _surfaces: Array[MeshInstance3D] = []
var _definition: Dictionary = {}
var _attachment_masks: Dictionary = {}
var _clock: float = 0.0
var _action: Dictionary = {}
var _action_time: float = 0.0
var _paused: bool = false
var _particle_node: MultiMeshInstance3D
var _particle_count: int = 0
var _stats_root: Node3D
var _base_pose: Vector3 = Vector3.ZERO

func _ready() -> void:
	_queue_rebuild()

func _queue_rebuild() -> void:
	if not is_inside_tree() or _queued:
		return
	_queued = true
	call_deferred("rebuild")

func set_component(kind: String, resource_id: String, version: int = 0) -> bool:
	if not library or library.component(kind, resource_id, version).is_empty():
		return false
	var changed = component_overrides.duplicate(true)
	changed[kind] = {"resourceId": resource_id, "version": version}
	component_overrides = changed
	return true

func clear_component(kind: String) -> void:
	var changed = component_overrides.duplicate(true)
	changed.erase(kind)
	component_overrides = changed

func set_layer_transform(id: String, offset: Vector2, layer_scale: float = 1.0, z: float = NAN) -> bool:
	var found := false
	for surface in _surfaces:
		if surface.get_meta("layer_id", "") != id:
			continue
		if is_finite(z):
			surface.position.z = z
			surface.set_meta("depth_override",true)
		var registration: float = (_camera_distance()-surface.position.z)/(_camera_distance()-.045) if surface.get_meta("registered",false) else 1.0
		surface.set_meta("registration",registration)
		surface.position.x = offset.x / 1024.0 * registration
		surface.position.y = -offset.y / 1024.0 * registration
		surface.scale = Vector3(layer_scale*registration, layer_scale*registration, 1.0)
		found = true
	return found

func set_effect_parameter(name: String, value: Variant) -> void:
	for surface in _surfaces:
		(surface.material_override as ShaderMaterial).set_shader_parameter(name, value)

func set_custom_shader(shader: Shader, layer_id: String = "") -> void:
	for surface in _surfaces:
		if layer_id.is_empty() or surface.get_meta("layer_id", "") == layer_id:
			(surface.material_override as ShaderMaterial).shader = shader

func inspect(yaw_degrees: float, pitch_degrees: float = 0.0) -> void:
	_base_pose = Vector3(deg_to_rad(pitch_degrees), deg_to_rad(yaw_degrees), 0.0)
	if _visual:
		_visual.rotation = _base_pose

func flip_to_back() -> void:
	inspect(180.0, 0.0)

func play_action(id_or_event: String) -> bool:
	for action in _definition.get("actions", []):
		if action.id == id_or_event or action.event == id_or_event:
			_action = action
			_action_time = 0.0
			_paused = false
			return true
	return false

func seek_action(seconds: float, paused: bool = true) -> void:
	_action_time = maxf(0.0, seconds)
	_paused = paused
	_update(0.0)

func pause_action(paused: bool = true) -> void:
	_paused = paused

func _texture(key: String) -> Texture2D:
	return library.texture(key) if library else null

func _resolve_definition() -> Dictionary:
	var result = library.card(card_id)
	for kind in component_overrides:
		var binding: Dictionary = component_overrides[kind]
		var value = library.component(kind, str(binding.get("resourceId", "")), int(binding.get("version", 0)))
		if value.is_empty():
			continue
		if kind == "frame":
			result.frameStyle = value.style
			result.frameGeometry = value.geometry
			var has_frame := false
			for layer in result.layers:
				if layer.kind=="frame":
					layer.visible=true
					has_frame=true
			if not has_frame:
				result.layers.append({"id":"shared-frame","kind":"frame","visible":true})
		elif kind == "back":
			result.backAsset = value.src
			result.backAdjustments = value.get("adjustments", {})
		elif kind == "material" or kind == "particles":
			result[kind] = value
		elif kind == "effect":
			result.shader_key = value.shader_key
			result.shader.fragmentStrength = value.fragmentStrength
			result.shader.fragmentMask = value.fragmentMask
			result.shader.fragmentTarget = value.targetKind
			result.effects.merge(value.effects, true)
		else:
			var found_image := false
			for layer in result.layers:
				if (kind == "background" and layer.kind == "background") or (kind == "base" and layer.get("role", "") == "baseplate"):
					found_image=true
					layer.asset = value.src
					layer.componentAdjustments = value.get("adjustments", {})
					if value.has("sourceWindow"):
						layer.sourceWindow = value.sourceWindow
					else:
						layer.erase("sourceWindow")
			if not found_image:
				var layer={"id":"shared-"+kind,"kind":"background" if kind=="background" else "image","asset":value.src,"visible":true,"componentAdjustments":value.get("adjustments",{})}
				if kind=="base":
					layer.role="baseplate"
				if value.has("sourceWindow"):
					layer.sourceWindow=value.sourceWindow
				result.layers.append(layer)
	return result

func rebuild() -> void:
	_queued = false
	if _visual:
		remove_child(_visual)
		_visual.queue_free()
	_surfaces.clear()
	_particle_node = null
	_particle_count = 0
	_stats_root = null
	if not library:
		return
	_attachment_masks.clear()
	_definition = _resolve_definition()
	if _definition.is_empty():
		push_warning("Cardscape: unknown card " + card_id)
		return
	_visual = Node3D.new()
	_visual.name = "CardVisual"
	add_child(_visual)
	_visual.rotation = _base_pose
	var style: Dictionary = _definition.frameStyle
	var frame: Dictionary = _definition.frameGeometry
	var order := 0
	var layers: Array = _definition.layers.duplicate()
	layers.reverse()
	var character_mesh: Mesh = _mesh(_definition.foregroundGeometry,true)
	for layer in layers:
		order=layers.find(layer)
		if not layer.get("visible", true) or layer.kind == "frame":
			continue
		var bg: bool = layer.kind == "background" or layer.get("role", "") in ["baseplate", "background-candidate"] or layer.get("spatial",{}).get("role","") in ["far","mid","near"]
		var fg: bool = layer.kind == "foreground" or layer.get("spatial",{}).get("role","") in ["rear","body","front"]
		var z := float(frame.back) + .002 if bg else .13 + order * .002
		if fg:
			z = .045 + .045 * depth_strength
		var geometry: Dictionary = _definition.foregroundGeometry if fg else _quad()
		if _definition.get("spatial",{}).get("enabled",false):
			z = .045 + float(layer.get("spatial",{}).get("z",-.18 if bg else .075 if fg else .2 if layer.has("titleArt") else .015 if layer.get("role","") in ["cost","power","stat-cost","stat-power"] else .10))
		if fg and layer.has("splitSourceId") and _definition.get("spatial",{}).get("enabled",false):
			for parent in layers:
				if parent.id==layer.splitSourceId:
					var parent_z := .045+float(parent.get("spatial",{}).get("z",.075))
					var limit := float(layer.get("attachment",{}).get("maxOffset",.025))
					z=parent_z+clampf(z-parent_z,-limit,limit)
		var shared_mesh: Mesh = _mesh(geometry,true,layer) if fg and layer.get("attachment",{}).has("motion") else character_mesh if fg else _mesh(geometry, false)
		if fg:
			_surface(layer, shared_mesh, z, -60+order*2, 1.0, bg)
			_surface(layer, shared_mesh, z, -60+order*2, 2.0, bg)
		else:
			_surface(layer, shared_mesh, z, -100 if bg else -60+order*2, 0.0, bg)
	var frame_visible := false
	for layer in _definition.layers:
		if layer.kind == "frame" and layer.get("visible", true):
			frame_visible = true
	if frame_visible:
		for part in ["rim", "sides", "rear"]:
			var node := _surface({"id":"frame-"+part,"kind":"frame"}, _mesh(frame[part]), 0.0, -64, 0.0, false)
			var mat := node.material_override as ShaderMaterial
			mat.set_shader_parameter("frame_part", 1.0)
			mat.set_shader_parameter("face_mode", 1 if part == "rear" else 2 if part == "sides" else 0)
	if _definition.get("backAsset", "") != "":
		var node := _surface({"id":"back","kind":"image","asset":_definition.backAsset,"adjustments":_definition.get("backAdjustments",{})}, _mesh(_quad()), float(frame.back)+.002, 1, 0.0, false)
		var mat := node.material_override as ShaderMaterial
		mat.set_shader_parameter("back_side", true)
		mat.set_shader_parameter("face_mode", 1)
	_setup_particles()
	if gameplay_stats.has("cost") and gameplay_stats.has("power"):
		set_stats(int(gameplay_stats.cost),int(gameplay_stats.power))
	_update(0.0)

func _quad() -> Dictionary:
	return {"positions":[-.5,.75,0,.5,.75,0,-.5,-.75,0,.5,-.75,0],"uv":[0,0,1,0,0,1,1,1],"indices":[0,2,1,1,2,3]}

func _mesh(data: Dictionary, foreground: bool = false, cloth: Dictionary = {}) -> ArrayMesh:
	var positions := PackedVector3Array()
	var uvs := PackedVector2Array()
	var colors := PackedColorArray()
	var locks := PackedFloat32Array()
	var img: Image
	if foreground and not cloth.get("attachment",{}).has("motion"):
		var tex := _texture(_definition.get("maskAssets", {}).get("rigid", ""))
		if tex:
			img = tex.get_image()
	for i in range(data.positions.size()/3):
		positions.append(Vector3(data.positions[i*3],data.positions[i*3+1],data.positions[i*3+2]))
		uvs.append(Vector2(data.uv[i*2],data.uv[i*2+1]))
		locks.append(0.0)
		colors.append(Color(1,1,data.get("weights",[])[i*4+2] if data.get("weights",[]).size()>i*4+2 else 1,1))
	if img:
		for t in range(0, data.indices.size(), 3):
			var ids: Array = [data.indices[t],data.indices[t+1],data.indices[t+2]]
			var low := Vector2(INF, INF)
			var high := Vector2.ZERO
			for i in ids:
				var pixel := uvs[i] * Vector2(img.get_width()-1,img.get_height()-1)
				low = low.min(pixel)
				high = high.max(pixel)
			var maximum := 0.0
			for y in range(maxi(0,floori(low.y)),mini(img.get_height()-1,ceili(high.y))+1):
				for x in range(maxi(0,floori(low.x)),mini(img.get_width()-1,ceili(high.x))+1):
					maximum = maxf(maximum,img.get_pixel(x,y).r)
			if maximum >= .5:
				maximum = 1.0
			for i in ids:
				locks[i] = maxf(locks[i],maximum)
	var uv2 := PackedVector2Array()
	var motion_tex := _texture(_definition.get("maskAssets", {}).get("motion", ""))
	var motion_img: Image = motion_tex.get_image() if motion_tex and foreground else null
	var cloth_texture := _attachment_mask(cloth) if cloth.get("attachment",{}).has("motion") else null
	var cloth_image: Image = cloth_texture.get_image() if cloth_texture else null
	for i in uvs.size():
		var weight := 0.0
		if motion_img:
			weight = motion_img.get_pixel(clampi(roundi(uvs[i].x*(motion_img.get_width()-1)),0,motion_img.get_width()-1),clampi(roundi(uvs[i].y*(motion_img.get_height()-1)),0,motion_img.get_height()-1)).r
		if cloth_image:
			weight=cloth_image.get_pixel(clampi(roundi(uvs[i].x*(cloth_image.get_width()-1)),0,cloth_image.get_width()-1),clampi(roundi(uvs[i].y*(cloth_image.get_height()-1)),0,cloth_image.get_height()-1)).r*float(cloth.attachment.motion)
		uv2.append(Vector2(weight*(1.0-locks[i]),locks[i]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = positions
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_TEX_UV2] = uv2
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = PackedInt32Array(data.indices)
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

func _attachment_mask(layer: Dictionary) -> Texture2D:
	if _attachment_masks.has(layer.id):
		return _attachment_masks[layer.id]
	var anchor: Dictionary = layer.get("attachment",{}).get("anchor",{})
	if not anchor.is_empty() and anchor.get("edge","boundary")!="boundary":
		var image := Image.create(128,192,false,Image.FORMAT_L8)
		for y in 192:
			for x in 128:
				var px := float(x)/127*1024
				var py := float(y)/191*1536
				var value: float = {"top":py,"bottom":1536-py,"left":px,"right":1024-px}[anchor.edge]
				var t := clampf((value-float(anchor.pin))/(float(anchor.release)-float(anchor.pin)),0,1)
				value=t*t*(3-2*t)
				image.set_pixel(x,y,Color(value,value,value,1))
		var texture := ImageTexture.create_from_image(image)
		_attachment_masks[layer.id]=texture
		return texture
	var owned := _texture(str(layer.get("ownershipAsset","")))
	var full := _texture(str(_definition.get("maskAssets",{}).get("coverage","")))
	if not owned or not full:
		return null
	var own := owned.get_image()
	var coverage := full.get_image()
	var w := 128
	var h := 192
	var inside := PackedByteArray()
	var solid := PackedByteArray()
	var distance := PackedFloat32Array()
	inside.resize(w*h)
	solid.resize(w*h)
	distance.resize(w*h)
	distance.fill(1000000.0)
	for y in h:
		for x in w:
			var px := roundi(float(x)/(w-1)*(own.get_width()-1))
			var py := roundi(float(y)/(h-1)*(own.get_height()-1))
			inside[y*w+x]=1 if own.get_pixel(px,py).r>.35 else 0
			solid[y*w+x]=1 if coverage.get_pixel(roundi(float(x)/(w-1)*(coverage.get_width()-1)),roundi(float(y)/(h-1)*(coverage.get_height()-1))).r>.35 else 0
	for y in range(1,h-1):
		for x in range(1,w-1):
			var i := y*w+x
			if inside[i]==0:
				continue
			for j in [i-1,i+1,i-w,i+w]:
				if solid[j]>0 and inside[j]==0:
					distance[i]=0.0
	for y in h:
		for x in w:
			var i := y*w+x
			if x>0: distance[i]=minf(distance[i],distance[i-1]+1.0)
			if y>0: distance[i]=minf(distance[i],distance[i-w]+1.0)
	for y in range(h-1,-1,-1):
		for x in range(w-1,-1,-1):
			var i := y*w+x
			if x<w-1: distance[i]=minf(distance[i],distance[i+1]+1.0)
			if y<h-1: distance[i]=minf(distance[i],distance[i+w]+1.0)
	var result := Image.create(w,h,false,Image.FORMAT_L8)
	var band := float(layer.get("attachment",{}).get("blendWidth",64))
	for y in h:
		for x in w:
			var t := minf(1.0,distance[y*w+x]*8.0/band)
			var value := t*t*(3.0-2.0*t)
			result.set_pixel(x,y,Color(value,value,value,1))
	var texture := ImageTexture.create_from_image(result)
	_attachment_masks[layer.id]=texture
	return texture

func _camera_distance() -> float:
	return float(_definition.get("spatial",{}).get("cameraDistance",2.7))

func _surface(layer: Dictionary, mesh: Mesh, z: float, priority: int, pass_id: float, bg: bool) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.name = str(layer.id) + ("-inside" if pass_id==1.0 else "-outside" if pass_id==2.0 else "")
	node.set_meta("layer_id", str(layer.id))
	node.mesh = mesh
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.position = Vector3(float(layer.get("x",0))/1024.0,-float(layer.get("y",0))/1024.0,z)
	node.scale = Vector3(float(layer.get("scale",1)),float(layer.get("scale",1)),1)
	for slot in _definition.get("slots", []):
		if slot.id == layer.get("slotId", ""):
			node.position += Vector3(float(slot.u)-.5,.75-float(slot.v)*1.5,float(slot.z) if _definition.get("spatial",{}).get("enabled",false) else float(slot.z)-z)
			node.scale *= Vector3(float(slot.scale),float(slot.scale),1)
			node.rotation.z = -deg_to_rad(float(slot.rotation))
	var registered: bool = _definition.get("spatial",{}).get("enabled",false) and layer.kind!="frame" and layer.id!="back"
	var registration := (_camera_distance()-node.position.z)/(_camera_distance()-.045) if registered else 1.0
	node.scale.x*=registration
	node.scale.y*=registration
	node.position.x*=registration
	node.position.y*=registration
	node.set_meta("registered",registered)
	node.set_meta("registration",registration)
	node.set_meta("depth_override",registered)
	_visual.add_child(node)
	var mat := ShaderMaterial.new()
	mat.shader = library.shaders.get(_definition.shader_key)
	mat.render_priority = clampi(priority,-128,127)
	node.material_override = mat
	_surfaces.append(node)
	var asset: String = str(layer.get("asset", ""))
	if layer.has("titleArt"):
		var variant: Dictionary = layer.titleArt.variants[0]
		for candidate in layer.titleArt.variants:
			if candidate.locale == locale:
				variant = candidate
		asset = str(variant.rasterAsset)
		var sweep: Dictionary = layer.titleArt.sweep
		mat.set_shader_parameter("title_sweep",_sweep(sweep))
		mat.set_shader_parameter("title_color",Color(sweep.color))
		mat.set_shader_parameter("title_bounds",Vector2(float(variant.get("bounds",[0,1])[0]),float(variant.get("bounds",[0,1])[1])))
	mat.set_shader_parameter("art",_texture(asset))
	if layer.has("splitSourceId") and registered:
		var join_texture := _attachment_mask(layer)
		if join_texture:
			node.set_meta("attachment_parent",str(layer.splitSourceId))
			mat.set_shader_parameter("attached",true)
			mat.set_shader_parameter("attachment_tex",join_texture)
	if not bg and layer.kind!="frame" and layer.id!="back":
		mat.shader=mat.shader.duplicate()
		mat.shader.code=mat.shader.code.replace("depth_draw_never,","depth_draw_never, depth_test_disabled,")
	mat.set_shader_parameter("foreground_pass",pass_id)
	mat.set_shader_parameter("background",bg)
	mat.set_shader_parameter("clipped",bool(layer.get("spatial",{}).get("clip",false)))
	for slot in _definition.get("slots",[]):
		if slot.id==layer.get("slotId",""):
			mat.set_shader_parameter("clipped",slot.clip)
			mat.set_shader_parameter("slot_effect",Vector3(1 if slot.effect=="pulse" else 2 if slot.effect=="flow" else 0,float(slot.strength),float(slot.speed)))
	mat.set_shader_parameter("opacity",float(layer.get("opacity",1)))
	var shader: Dictionary = _definition.shader
	mat.set_shader_parameter("custom_effect",shader.fragmentTarget in ["all",layer.id,layer.kind])
	mat.set_shader_parameter("custom_masked",shader.fragmentMask!="none")
	mat.set_shader_parameter("custom_strength",float(shader.fragmentStrength))
	mat.set_shader_parameter("custom_mask_tex",_texture(_definition.get("maskAssets",{}).get(shader.fragmentMask,"")))
	for name in ["motion","inset","emission","phase","foil"]:
		mat.set_shader_parameter(name+"_tex",_texture(_definition.get("maskAssets",{}).get(name,"")))
	if layer.has("sourceWindow") and _texture(asset):
		var r: Dictionary = layer.sourceWindow
		var size := _texture(asset).get_size()
		if bg and registered:
			mat.set_shader_parameter("background_extent",size/Vector2(float(r.width),float(r.height)))
		mat.set_shader_parameter("source_rect",Vector4(float(r.x)/size.x,float(r.y)/size.y,float(r.width)/size.x,float(r.height)/size.y))
	var adj: Dictionary = layer.get("adjustments",{})
	var shared_adj: Dictionary = layer.get("componentAdjustments",{})
	mat.set_shader_parameter("adjustment",Vector4((float(adj.get("brightness",0))+float(shared_adj.get("brightness",0)))/100.0,(1+float(adj.get("contrast",0))/100.0)*(1+float(shared_adj.get("contrast",0))/100.0),float(adj.get("saturation",100))*float(shared_adj.get("saturation",100))/10000.0,float(adj.get("gamma",1))*float(shared_adj.get("gamma",1))))
	return node

func _sweep(s: Dictionary) -> Vector4:
	return Vector4(float(s.get("strength",.7)) if s.get("enabled",false) else 0.0,float(s.get("duration",2)),float(s.get("period",6)),float(s.get("width",.09)))

func _sample(frames: Array, progress: float, fallback: float) -> float:
	if frames.is_empty():
		return fallback
	if progress <= frames[0].at:
		return frames[0].value
	for i in range(1,frames.size()):
		var right: Dictionary = frames[i]
		var left: Dictionary = frames[i-1]
		if progress <= right.at:
			var t := (progress-float(left.at))/(float(right.at)-float(left.at))
			if left.get("ease", "linear") == "smooth":
				t = t*t*(3-2*t)
			elif left.get("ease", "linear") == "hold":
				t = 1.0 if progress == right.at else 0.0
			return lerpf(float(left.value),float(right.value),t)
	return float(frames.back().value)

func _process(delta: float) -> void:
	if effects_playing:
		_clock += delta
	if not _paused:
		_action_time += delta
	_update(delta)

func _update(_delta: float) -> void:
	if not _visual or _definition.is_empty():
		return
	var progress := 0.0
	var root_alpha := 1.0
	var motion := 1.0
	var flow := 1.0
	var extra_bend := 0.0
	if not _action.is_empty():
		var duration := float(_action.duration)
		progress = fmod(_action_time,duration)/duration if _action.loop else minf(1.0,_action_time/duration)
		var tracks: Dictionary = _action.get("tracks",{})
		var envelope := 1.0 if _action.loop else sin(progress*PI)
		_visual.position = Vector3(_sample(tracks.get("x",[]),progress,0)/1024.0,-_sample(tracks.get("y",[]),progress,0)/1024.0,_sample(tracks.get("z",[]),progress,0))
		_visual.scale = Vector3.ONE * _sample(tracks.get("scale",[]),progress,1)
		_visual.rotation = _base_pose + Vector3(deg_to_rad(_sample(tracks.get("pitch",[]),progress,0)),deg_to_rad(_sample(tracks.get("yaw",[]),progress,progress*180 if _action.event=="flip" else 0)),0)
		root_alpha = _sample(tracks.get("opacity",[]),progress,1)
		motion = _sample(tracks.get("motion",[]),progress,1+(float(_action.motion)-1)*envelope)
		flow = _sample(tracks.get("emission",[]),progress,1+(float(_action.emission)-1)*envelope)
		extra_bend = _sample(tracks.get("bend",[]),progress,float(_action.bend)*envelope)
		if not _action.loop and progress >= 1 and not _paused:
			_paused = true
			action_finished.emit(str(_action.id))
	var camera := get_viewport().get_camera_3d()
	var eye := _visual.global_transform.affine_inverse() * camera.global_position if camera else Vector3(0,0,2.7)
	var front := eye.z > .03
	if _stats_root:
		_stats_root.visible = front
		for child in _stats_root.get_children():
			if child is Label3D:
				child.modulate.a = root_alpha
			elif child is MeshInstance3D:
				(child.material_override as ShaderMaterial).set_shader_parameter("root_opacity",root_alpha)
	var style: Dictionary = _definition.frameStyle
	var armor: Dictionary = _definition.get("armor",{})
	var composition: Dictionary = _definition.get("composition",{})
	var material: Dictionary = _definition.get("material",{}).duplicate()
	material.merge(material_settings,true)
	for surface in _surfaces:
		var mat := surface.material_override as ShaderMaterial
		if float(mat.get_shader_parameter("foreground_pass")) > 0 and not surface.get_meta("depth_override",false):
			surface.position.z = .045 + .045 * depth_strength
		mat.set_shader_parameter("layer_transform",surface.transform)
		if surface.has_meta("attachment_parent"):
			for parent in _surfaces:
				if parent.get_meta("layer_id","")==surface.get_meta("attachment_parent"):
					mat.set_shader_parameter("attachment_transform",parent.transform)
					break
		mat.set_shader_parameter("card_eye",eye)
		mat.set_shader_parameter("front_visible",front)
		mat.set_shader_parameter("clock",_clock)
		mat.set_shader_parameter("root_opacity",root_alpha)
		mat.set_shader_parameter("depth",depth_strength)
		mat.set_shader_parameter("geometry_bend",float(_definition.get("deformation",{}).get("bend",0))+extra_bend)
		mat.set_shader_parameter("motion_gain",motion*float(_definition.get("deformation",{}).get("wind",1)) if effects_playing and _definition.effects.get("cape",false) else 0.0)
		mat.set_shader_parameter("flow_gain",flow if effects_playing and _definition.effects.get("flow",false) else 0.0)
		mat.set_shader_parameter("wind_speed",float(_definition.get("deformation",{}).get("speed",1)))
		mat.set_shader_parameter("metrics",Vector4(float(style.width)/1024.0,float(style.corner)/1024.0,float(style.depth)/1024.0,minf(float(style.bevel),float(style.width)*.4)/1024.0))
		mat.set_shader_parameter("pop_sides",Vector4(float(composition.get("top",true)),float(composition.get("right",true)),float(composition.get("bottom",false)),float(composition.get("left",true))))
		mat.set_shader_parameter("frame_color",Color(style.color))
		mat.set_shader_parameter("frame_accent",Color(style.accent))
		mat.set_shader_parameter("frame_finish",["flat","metal","glow"].find(style.finish))
		mat.set_shader_parameter("armor_sweep",_sweep(armor))
		mat.set_shader_parameter("armor_color",Color(armor.get("color","#badfff")))
		mat.set_shader_parameter("component_material",Vector4(float(material.get("strength",.3)) if effects_playing and material.get("enabled",false) else 0,float(material.get("speed",.25)),float(material.get("frequency",4)),1 if material.get("target","both")=="background" else 2 if material.get("target","both")=="back" else 0))
		mat.set_shader_parameter("material_color",Color(material.get("color","#78cfff")))
		mat.set_shader_parameter("material_accent",Color(material.get("accent","#fa8dde")))
		mat.set_shader_parameter("holographic",material.get("style","")=="holographic")
	_update_particles(root_alpha)

func _particle_config() -> Dictionary:
	var result: Dictionary = _definition.get("particles",{}).duplicate()
	result.merge(particle_settings,true)
	return result

func _setup_particles() -> void:
	_particle_node = MultiMeshInstance3D.new()
	_particle_node.name = "BehindCardParticles"
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.use_colors = true
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	multi.mesh = quad
	multi.instance_count = 256
	multi.visible_instance_count = 0
	_particle_node.multimesh = multi
	_particle_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var shader := Shader.new()
	shader.code = "shader_type spatial; render_mode unshaded, cull_disabled, blend_add, depth_draw_never; void fragment(){float d=length(UV-.5)*2.;if(d>1.)discard;ALBEDO=COLOR.rgb;ALPHA=COLOR.a*pow(1.-d,2.);}"
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.render_priority = -10
	_particle_node.material_override = mat
	_visual.add_child(_particle_node)

func _hash(i: int, seed: int) -> float:
	var x := sin((i+1)*127.1+seed*311.7)*43758.5453
	return x-floor(x)

func _update_particles(root_alpha: float) -> void:
	if not _particle_node:
		return
	var p := _particle_config()
	_particle_count = clampi(int(p.get("count",64)),1,256) if effects_playing and p.get("enabled",false) else 0
	_particle_node.multimesh.visible_instance_count = _particle_count
	for i in _particle_count:
		var seed := int(p.get("seed",1))
		var r := _hash(i,seed)
		var life := maxf(.3,float(p.get("lifetime",3)))
		var phase := fmod(_clock/life+r,1.0)
		var edge := _hash(i+379,seed)*4
		var origin: Vector2
		var direction: Vector2
		if edge<1:
			origin=Vector2(edge-.5,.75);direction=Vector2(origin.x*.8,1)
		elif edge<2:
			origin=Vector2(.5,.75-(edge-1)*1.5);direction=Vector2(1,origin.y*.5)
		elif edge<3:
			origin=Vector2(.5-(edge-2),-.75);direction=Vector2(origin.x*.8,-1)
		else:
			origin=Vector2(-.5,-.75+(edge-3)*1.5);direction=Vector2(-1,origin.y*.5)
		var pos := origin+direction.normalized()*phase*(float(p.get("spread",.5))+float(p.get("speed",.25))*life)
		var size := float(p.get("size",.012))*(.5+.5*r)*(1-.55*phase)*2
		_particle_node.multimesh.set_instance_transform(i,Transform3D(Basis.IDENTITY.scaled(Vector3(size,size,size)),Vector3(pos.x,pos.y,float(p.get("z",-.08)))))
		var color := Color(p.get("color","#ffcb79"))
		color.a = pow(sin(PI*phase),2)*root_alpha
		_particle_node.multimesh.set_instance_color(i,color)

func diagnostics() -> Dictionary:
	return {"card_id":card_id,"locale":locale,"surfaces":_surfaces.size(),"particles":_particle_count,"frame_planar":true,"action":_action.get("id",""),"action_seconds":_action_time,"overrides":component_overrides.duplicate(true)}

## Gameplay numbers are independent from decorative raster wordmarks.
func set_stats(cost: int, power: int) -> bool:
	if cost<0 or cost>99 or power< -99 or power>999 or not _visual:
		return false
	gameplay_stats={"cost":cost,"power":power}
	if _stats_root:
		_visual.remove_child(_stats_root)
		_stats_root.queue_free()
	_stats_root=Node3D.new()
	_stats_root.name="GameplayStats"
	_visual.add_child(_stats_root)
	for surface in _surfaces:
		if surface.get_meta("layer_id","") in [_definition.get("cardStats",{}).get("costLayerId",""),_definition.get("cardStats",{}).get("powerLayerId","")]:
			surface.visible=false
	for item in [[cost,-.4082,Color("#1276d2"),false,"costLayerId"],[power,.4082,Color("#f6a72d"),true,"powerLayerId"]]:
		var priority := 100
		for surface in _surfaces:
			if surface.get_meta("layer_id","")==_definition.get("cardStats",{}).get(item[4],""):
				priority=surface.material_override.render_priority
		var badge:=MeshInstance3D.new()
		var quad:=QuadMesh.new()
		var stat_z: float = .06 if _definition.get("spatial",{}).get("enabled",false) else .151
		var registration: float = (_camera_distance()-stat_z)/(_camera_distance()-.045) if _definition.get("spatial",{}).get("enabled",false) else 1.0
		quad.size=Vector2(.162,.162)*registration
		badge.mesh=quad
		badge.position=Vector3(float(item[1])*registration,.6582*registration,stat_z)
		var shader:=Shader.new()
		shader.code="shader_type spatial;render_mode unshaded,cull_disabled,depth_draw_never,depth_test_disabled;uniform vec4 tint:source_color;uniform bool shield=false;uniform float root_opacity=1.;void fragment(){vec2 p=(UV-.5)*2.;float d=length(p);if(shield){if(abs(p.x)>.95||(p.y>.4&&abs(p.x)>1.-(p.y-.4))||(p.y<-.8&&abs(p.x)-p.y>1.8))discard;}else if(d>1.)discard;ALBEDO=tint.rgb*(.55+.45*(1.-UV.y));ALPHA=root_opacity;}"
		var material:=ShaderMaterial.new()
		material.shader=shader
		material.render_priority=priority
		material.set_shader_parameter("tint",item[2])
		material.set_shader_parameter("shield",item[3])
		badge.material_override=material
		_stats_root.add_child(badge)
		var label:=Label3D.new()
		label.text=str(item[0])
		label.position=badge.position+Vector3(0,0,.001)
		label.pixel_size=.0012*registration
		label.font_size=84
		label.outline_size=8
		label.modulate=Color.WHITE
		label.render_priority=mini(127,priority+1)
		label.no_depth_test=true
		_stats_root.add_child(label)
	return true
