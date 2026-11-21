@tool
class_name CardscapeCard
extends Node3D
const ActionAudio = preload("res://addons/cardscape/action_audio.gd")
const CharacterAnimation = preload("res://addons/cardscape/character_animation.gd")
const ActionTrail = preload("res://addons/cardscape/action_trail.gd")
const ParticleWorldHistory = preload("res://addons/cardscape/particle_world.gd")
const ParticlePhysics = preload("res://addons/cardscape/particle_physics.gd")
const FRAME_FINISHES: Array[String] = ["flat","metal","glow","cosmic","distressed","web","candy","ice","snow","wrapping","fire","fire-iridescent","chains","glyphs","refraction","overloaded","neonnights","distressed-copper","distressed-rainbow","orbit-silver","twin-aurora","pax","brains","candy-halloween","halloween-stickers"]
const MATERIAL_STYLES: Array[String] = ["iridescent","holographic","foil","prism","gold","ink","copper","steel","goldprism","blackprism","cosmic","glass","fire","water","rays","refraction","psychedelic","foilmetallic","goldmetallic","gildedprism","glasscircuits","wakandanglass","galacticstorm","bananas","symbiote","circuits","frosted","raysrainbow","caustics","rayspurple","laser-foil"]
const LASER_PATTERNS: Array[String] = ["plain","cosmos","sunburst","silk","crystal","pastel","kintsugi","sakura","frost","aurora","shatter","neon","inferno","lightning","grating","contours","mercury"]
const LASER_SIGNATURES: Array[String] = ["off","auto","star","streak"]
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
@export var audio_enabled: bool = false:
	set(value):
		audio_enabled=value
		if _action_audio:_action_audio.set_enabled(value)
var _action_audio: ActionAudio

func audio_state() -> Dictionary:
	return _action_audio.state() if _action_audio else {"enabled":audio_enabled,"voices":[],"starts":0,"error":"","globalVoices":ActionAudio.total_voices}

@export var effects_playing: bool = true
@export var effects_paused: bool = false
@export var material_settings: Dictionary = {}
@export var particle_settings: Dictionary = {}
@export_range(8, 256, 1) var particle_budget: int = 128
## Positive width overrides camera projection for UI render textures.
@export var detail_pixel_width: float = 0.0
var _detail_level: String = "large"
var _detail_pixels: float = 0.0
var _detail_parent: Dictionary = {}
var _detail_effects: Dictionary = {"particles":true,"materials":true,"decorations":true}
var _queued: bool = false
var _visual: Node3D
var _surfaces: Array[MeshInstance3D] = []
var _definition: Dictionary = {}
var _character_compiled: Dictionary = {}
var _native_meshes: Dictionary = {}
var _attachment_masks: Dictionary = {}
var _pop_bounds := Vector4.ZERO
var _clock: float = 0.0
var _particle_reveal_started: float = 0.0
var _particle_reveal_count: int = 0
var _action: Dictionary = {}
var _action_time: float = 0.0
var _contour_edges := PackedVector4Array()
var _contour_counts := Vector2.ZERO
var _contour_field: Texture2D
var _transition: Dictionary = {}
var _rendered_action: Dictionary = {}
var _rendered_progress: float = 0.0
var _paused: bool = false
var _particle_node: MultiMeshInstance3D
var _particle_front_node: MultiMeshInstance3D
var _particle_count: int = 0
var _particle_event_states: Dictionary = {}
var _particle_event_config: Dictionary = {}
var _particle_event_count: int = 0
var _particle_births := PackedFloat64Array()
var _particle_birth_cache: Dictionary = {}
var _particle_birth_source: int = 0
var _particle_world_history: ParticleWorldHistory
var _particle_world_source: int = 0
var _particle_world_cycle: float = 0.0
var _particle_world_time_offset: float = 0.0
var _particle_world_sampling: bool = false
var _particle_color_sampling: bool = false
var _particle_physics: ParticlePhysics
var _particle_world_alphas:=PackedFloat64Array()
var _particle_world_sampler: Callable

## sampler(action_id, unwrapped_action_seconds, fallback) returns
## {transform: Transform3D, opacity: float} for the complete visual root at birth.
func set_particle_world_sampler(sampler: Callable) -> void:
	_particle_world_sampler=sampler
var _particle_sample_births: bool = false
var _stats_root: Node3D
var _base_pose: Vector3 = Vector3.ZERO
var _embedded_definition: Dictionary = {}
var _component_nodes: Dictionary = {}
var _inherited_opacity: float = 1.0

## Matches the editor's vertical projection, including narrow preview panes.
static func preview_fov(viewport_size: Vector2) -> float:
	var fit := minf(1.0,maxf(.01,viewport_size.x/maxf(1.0,viewport_size.y))/.85)
	return rad_to_deg(2.0*atan(1.0/(2.9*fit)))

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

func component_node(kind: String) -> CardscapeCard:
	return _component_nodes.get(kind) as CardscapeCard

func set_layer_transform(id: String, offset: Vector2, layer_scale: float = 1.0, z: float = NAN) -> bool:
	var found := false
	for surface in _surfaces:
		if surface.get_meta("layer_id", "") != id:
			continue
		if surface.has_meta("character_base"):
			surface.transform=surface.get_meta("character_base")
		if is_finite(z):
			surface.position.z = z
			surface.set_meta("depth_override",true)
		var registration: float = (_camera_distance()-surface.position.z)/(_camera_distance()-.045) if surface.get_meta("registered",false) else 1.0
		surface.set_meta("registration",registration)
		surface.position.x = offset.x / 1024.0 * registration
		surface.position.y = -offset.y / 1024.0 * registration
		surface.scale = Vector3(layer_scale*registration, layer_scale*registration, 1.0)
		surface.set_meta("character_base",surface.transform)
		found = true
	_update(0.0)
	return found

func set_effect_parameter(name: String, value: Variant) -> void:
	for surface in _surfaces:
		if name=="opacity":surface.set_meta("character_opacity",float(value))
		var mat:=surface.material_override as ShaderMaterial
		if name=="frame_finish" and (value is int or value is float):_refresh_surface_shader(surface,mat,int(value))
		mat.set_shader_parameter(name, value)

func set_custom_shader(shader: Shader, layer_id: String = "") -> void:
	for surface in _surfaces:
		if layer_id.is_empty() or surface.get_meta("layer_id", "") == layer_id:
			surface.set_meta("custom_shader_override",true)
			(surface.material_override as ShaderMaterial).shader = shader

func _finish_index(style: Dictionary) -> int:
	var finish: String=str(style.get("finish","metal"))
	return FRAME_FINISHES.find(finish if _detail_effects.materials else "flat" if finish=="flat" else "metal")

func _refresh_surface_shader(surface: MeshInstance3D, mat: ShaderMaterial, finish: int) -> void:
	# Direct assignments and in-place user edits remain owned by the game.
	if surface.get_meta("custom_shader_override",false) or not mat.shader:return
	if mat.shader!=surface.get_meta("library_shader") or mat.shader.code!=surface.get_meta("library_shader_code",""):return
	var next:=library.surface_shader(str(surface.get_meta("shader_source_key")),bool(surface.get_meta("shader_painter_order")),bool(surface.get_meta("shader_additive")),finish)
	if not next or next==mat.shader:return
	# Preserve game overrides, textures and per-instance values across a variant
	# switch. All generated variants retain the same uniform declarations.
	var parameters: Dictionary={}
	for uniform in mat.shader.get_shader_uniform_list():
		var value: Variant=mat.get_shader_parameter(uniform.name)
		if value!=null:parameters[uniform.name]=value
	mat.shader=next
	for name in parameters:mat.set_shader_parameter(name,parameters[name])
	surface.set_meta("library_shader",next)
	surface.set_meta("library_shader_code",next.code)

func inspect(yaw_degrees: float, pitch_degrees: float = 0.0) -> void:
	_base_pose = Vector3(deg_to_rad(pitch_degrees), deg_to_rad(yaw_degrees), 0.0)
	if _visual:
		_visual.rotation = _base_pose
		# Flip visibility must follow an explicit inspection immediately, including
		# paused effects and callers running before this frame's _process callback.
		_update(0.0)

func flip_to_back() -> void:
	inspect(180.0, 0.0)

func play_action(id_or_event: String, transition_seconds: float = -1.0) -> bool:
	for action in _definition.get("actions", []):
		if action.id == id_or_event or action.event == id_or_event:
			var duration: float=float(action.get("transitionDuration",0)) if transition_seconds<0 else transition_seconds
			if not is_finite(duration) or duration<0 or duration>2:return false
			_transition={"from":CharacterAnimation.snapshot(_character_compiled,_rendered_action,_rendered_progress),"duration":duration,"seconds":0.0} if duration>0 and _action.get("id","")!=action.id and not _rendered_action.is_empty() else {}
			if _action_audio:_action_audio.stop()
			_action = action
			_action_time = 0.0
			_particle_world_time_offset=0.0
			if _particle_world_history:_particle_world_history.clear()
			_paused = false
			if action.get("event","")=="enter":
				play_particle_reveal()
			return true
	return false

func seek_action(seconds: float, paused: bool = true) -> void:
	if _action_audio:_action_audio.stop()
	_transition.clear()
	_particle_world_time_offset=0.0
	_action_time = maxf(0.0, seconds)
	_paused = paused
	_update(0.0)

func pause_action(paused: bool = true) -> void:
	if paused and not _paused and _action.get("loop",false):
		_particle_world_time_offset+=floorf(_action_time/float(_action.duration))*float(_action.duration)
		_action_time=fmod(_action_time,float(_action.duration))
	_paused = paused
	_update(0.0)

func seek_effects(seconds: float) -> void:
	_clock = maxf(0.0, seconds)
	_update(0.0)

## A reveal runs once; sustained particles keep their existing clock and seed.
func play_particle_reveal() -> void:
	_particle_reveal_started = _clock
	_update(0.0)

func seek_particle_reveal(seconds: float) -> void:
	_particle_reveal_started = _clock-maxf(0.0,seconds)
	_update(0.0)

func _exit_tree() -> void:
	if _action_audio:_action_audio.dispose()
	if library:library.release_prepared([],get_instance_id(),true)

func _set_surface_art(material: ShaderMaterial, texture_value: Texture2D) -> void:
	material.set_shader_parameter("art",texture_value)
	material.set_shader_parameter("_cardscape_source_alpha_bounds",library.alpha_bounds(texture_value) if library else Vector4(0,0,1,1))

func _texture(key: String) -> Texture2D:
	var variant: Dictionary=_definition.get("exportProfile",{}).get("textures",{}).get(key,{})
	return library.texture(str(variant.get(_detail_level,{}).get("asset",key))) if library else null

func _export_settings() -> Dictionary:
	return _definition.get("exportProfile",{}).get("settings",{})

func _projected_detail_width() -> float:
	if detail_pixel_width>0:return detail_pixel_width
	var camera := get_viewport().get_camera_3d()
	if not camera or not _visual:return 0.0
	var center := _visual.global_position
	if camera.is_position_behind(center):return 0.0
	var half_width := camera.global_basis.x*global_basis.get_scale().x*_visual.scale.x*.5
	return camera.unproject_position(center-half_width).distance_to(camera.unproject_position(center+half_width))

func _detail_visible(id: String) -> bool:
	var rule: String=_export_settings().get("layers",{}).get(id,"always")
	return rule!="omit" and (rule!="detail" or _detail_level=="large" or _detail_effects.decorations)

func _update_detail() -> void:
	var settings := _export_settings()
	if not _detail_parent.is_empty():
		_detail_level=_detail_parent.level
		_detail_effects=_detail_parent.effects
		return
	if settings.is_empty():return
	_detail_pixels=_projected_detail_width()
	var threshold := float(settings.get("threshold",420))*(.85 if _detail_level=="large" else 1.0)
	var desired := "large" if _detail_pixels>=threshold else "small"
	if not settings.get("adaptive",false):desired="small" if settings.get("preset","")=="mobile-list" else "large"
	if desired!=_detail_level:
		var keys: Array=[]
		for surface in _surfaces:
			var key: String=surface.get_meta("texture_asset","")
			var variant: Dictionary=_definition.get("exportProfile",{}).get("textures",{}).get(key,{})
			if not variant.is_empty():keys.append(str(variant.get(desired,variant.large).asset))
		if library and not library.prepare_textures(keys,get_instance_id()):return
		_detail_level=desired
		for surface in _surfaces:
			if surface.has_meta("texture_asset"):_set_surface_art(surface.material_override as ShaderMaterial,_texture(surface.get_meta("texture_asset")))
		if library:library.release_prepared(keys,get_instance_id())
	elif library:library.release_prepared([],get_instance_id())
	_detail_effects={"particles":_detail_level=="large" or settings.get("smallParticles",false),"materials":_detail_level=="large" or settings.get("smallMaterials",false),"decorations":_detail_level=="large" or settings.get("smallDecorations",false)}

func export_detail_state() -> Dictionary:
	return {"level":_detail_level,"pixels":_detail_pixels,"effects":_detail_effects.duplicate(),"action_seconds":_action_time}

func _resolve_definition() -> Dictionary:
	if not _embedded_definition.is_empty():
		return _embedded_definition.duplicate(true)
	var result = library.card(card_id)
	for kind in component_overrides:
		var binding: Dictionary = component_overrides[kind]
		var value = library.component(kind, str(binding.get("resourceId", "")), int(binding.get("version", 0)))
		if value.is_empty():
			continue
		if kind == "frame":
			result.frameStyle = value.style
			result.frameGeometry = value.geometry
			var scenes: Dictionary = result.get("componentScenes", {}).duplicate(true)
			scenes["frame"] = value
			result.componentScenes = scenes
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
			if value.get("schema", "") == "card-back/1":
				result.backScene = value.duplicate(true)
			else:
				result.erase("backScene")
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
	if _action_audio:
		_action_audio.dispose()
		_action_audio=null
	_transition.clear()
	_rendered_action.clear()
	_queued = false
	if _visual:
		remove_child(_visual)
		_visual.queue_free()
	_surfaces.clear()
	_component_nodes.clear()
	_particle_node = null
	_particle_front_node = null
	_particle_count = 0
	_particle_event_count=0
	_particle_event_states.clear()
	_particle_birth_cache.clear()
	if _particle_world_history:_particle_world_history.clear()
	_particle_world_source=0
	_particle_world_alphas=PackedFloat64Array()
	if _particle_physics:_particle_physics.clear()
	_particle_births.resize(256)
	_particle_event_config.clear()
	_stats_root = null
	if not library:
		return
	_attachment_masks.clear()
	_native_meshes.clear()
	_definition = _resolve_definition()
	_detail_level="large"
	_detail_effects={"particles":true,"materials":true,"decorations":true}
	_character_compiled = CharacterAnimation.compile(_definition.get("characterRig",{}))
	if _definition.is_empty():
		push_warning("Cardscape: unknown card " + card_id)
		return
	_visual = Node3D.new()
	# Editor applies yaw before pitch; Godot defaults to the opposite order.
	_visual.rotation_order = EULER_ORDER_XYZ
	_visual.name = "CardVisual"
	add_child(_visual)
	_visual.rotation = _base_pose
	var initial_settings := _export_settings()
	if not initial_settings.is_empty():
		var initial_small: bool = _projected_detail_width()<float(initial_settings.get("threshold",420)) if initial_settings.get("adaptive",false) else initial_settings.get("preset","")=="mobile-list"
		if library and not library.initial_detail_level.is_empty():initial_small=library.initial_detail_level=="small"
		_detail_level="small" if initial_small else "large"
		_detail_effects={"particles":not initial_small or initial_settings.get("smallParticles",false),"materials":not initial_small or initial_settings.get("smallMaterials",false),"decorations":not initial_small or initial_settings.get("smallDecorations",false)}
	var style: Dictionary = _definition.frameStyle
	var frame: Dictionary = _definition.frameGeometry
	var order := 0
	var layers: Array = _definition.layers.duplicate()
	_contour_edges.clear()
	_contour_counts=Vector2.ZERO
	_contour_field=_texture(str(_definition.get("contourFieldAsset",""))) if _definition.has("contourFieldAsset") else null
	var contour: Dictionary=_definition.get("frameStyle",{}).get("contour",{})
	var edge := float(style.width)/1024.0
	_pop_bounds = Vector4(.75-edge,.5-edge,-.75+edge,-.5+edge)
	if not contour.get("windows",[]).is_empty():
		_pop_bounds = Vector4(-INF,-INF,INF,INF)
		for window in contour.windows:
			for point in window:
				var x := float(point[0])/1024.0-.5
				var y := .75-float(point[1])/1024.0
				_pop_bounds = Vector4(maxf(_pop_bounds.x,y),maxf(_pop_bounds.y,x),minf(_pop_bounds.z,y),minf(_pop_bounds.w,x))
	if not contour.is_empty():
		var rings: Array=[contour.outline]
		rings.append_array(contour.windows)
		for ring in rings:
			for i in range(ring.size()):
				var a: Array=ring[i]
				var b: Array=ring[(i+1)%ring.size()]
				_contour_edges.append(Vector4(float(a[0])/1024.0-.5,.75-float(a[1])/1024.0,float(b[0])/1024.0-.5,.75-float(b[1])/1024.0))
		_contour_counts=Vector2(contour.outline.size(),_contour_edges.size())
		if _contour_field:_contour_counts.y=maxf(1.0,_contour_counts.y)
		_contour_edges.resize(64)
	var finish: Dictionary = _definition.get("material",{})
	if finish.get("enabled",false) and finish.get("target","background")!="back":
		for item in finish.get("document",{}).get("layers",[]):
			if item.get("previewReference",false) or not item.get("visible",true) or not item.has("asset"):
				continue
			var overlay: Dictionary = item.duplicate(true)
			overlay.id="material-"+str(item.id)
			overlay.kind="image"
			overlay.role="background-candidate"
			overlay.spatial={"role":"near","z":-.08+clampf(float(item.get("spatial",{}).get("z",0)),-.12,.05),"clip":true}
			overlay["material_overlay"]=true
			layers.append(overlay)
	layers.reverse()
	var character_mesh: Mesh = _mesh(_definition.foregroundGeometry,true)
	var rigid_character_mesh: Mesh = _mesh(_quad(),false)
	for layer in layers:
		order=layers.find(layer)
		if not layer.get("visible", true) or layer.kind == "frame":
			continue
		var bg: bool = layer.kind == "background" or layer.get("role", "") in ["baseplate", "background-candidate"] or layer.get("spatial",{}).get("role","") in ["far","mid","near"]
		var fg: bool = layer.kind == "foreground" or layer.get("spatial",{}).get("role","") in ["rear","body","front"]
		var z := .045+float(layer.spatial.z) if layer.get("material_overlay",false) else float(frame.back) + .002 if bg else .13 + order * .002
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
		var shared_mesh: Mesh = rigid_character_mesh if fg and _rigid_part(layer) else _mesh(geometry,true,layer) if fg and not _rigid_part(layer) and layer.get("attachment",{}).has("motion") else character_mesh if fg else _mesh(geometry, false)
		for skin in (_character_compiled.meshes if _definition.get("cosmeticPreview",{}).get("motion",true) else []):
			if skin.layerId!=layer.id:continue
			var points: Array=[]
			for i in range(skin.vertices.size()/2):points.append_array([float(skin.vertices[i*2])/1024.0-.5,.75-float(skin.vertices[i*2+1])/1024.0,float(skin.get("depths",[])[i]) if skin.has("depths") else 0.0])
			shared_mesh=_mesh({"positions":points,"uv":skin.uv,"indices":skin.triangles},false,{},true)
			_native_meshes[layer.id]={"mesh":shared_mesh,"spec":skin,"rest":shared_mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]}
		if fg:
			_surface(layer, shared_mesh, z, -60+order*2, 1.0, bg)
			if _definition.get("characterEffects",{}).get("breakout",{}).get("enabled",true):
				_surface(layer, shared_mesh, z, -60+order*2, 2.0, bg)
		else:
			_surface(layer, shared_mesh, z, -90 if layer.get("material_overlay",false) else -100 if bg else -60+order*2, 0.0, bg)
	var frame_visible := false
	var frame_layer: Dictionary = {}
	for layer in _definition.layers:
		if layer.kind == "frame" and layer.get("visible", true):
			frame_visible = true
			frame_layer = layer
	var authored_back: bool = not _definition.get("backScene",{}).get("document",{}).is_empty()
	var authored_frame: bool = not _definition.get("componentScenes",{}).get("frame",{}).get("document",{}).is_empty()
	if frame_visible and authored_frame:
		_embed_component("frame",_definition.componentScenes.frame.document,Vector3.ZERO)
		var frame_node: CardscapeCard = _component_nodes.frame
		frame_node.position=Vector3(float(frame_layer.get("x",0))/1024.0,-float(frame_layer.get("y",0))/1024.0,0)
		frame_node.scale=Vector3.ONE*float(frame_layer.get("scale",1))
		frame_node.rotation.z=-deg_to_rad(float(frame_layer.get("rotation",0)))
		frame_node.set_meta("binding_opacity",float(frame_layer.get("opacity",1)))
	if frame_visible:
		for part in ["rim", "sides", "rear", "aura"]:
			if not frame.has(part) or frame[part].get("indices",[]).is_empty():
				continue
			if (part == "rear" and authored_back) or (authored_frame and part != "rear" and part != "sides"):
				continue
			var node := _surface({"id":"frame-"+part,"kind":"frame"}, _mesh(frame[part]), 0.0, -64, 0.0, false)
			if authored_frame and part == "sides":
				node.set_meta("reverse_only",true)
			var mat := node.material_override as ShaderMaterial
			mat.set_shader_parameter("frame_part", 2.0 if part=="aura" else 1.0)
			mat.set_shader_parameter("contour_wall",part=="sides")
			mat.set_shader_parameter("face_mode", 1 if part == "rear" else 2 if part == "sides" else 0)
	if authored_back:
		_embed_component("back",_definition.backScene.document,Vector3(0,0,float(frame.back)))
	elif _definition.has("backScene"):
		var reverse: Dictionary = _definition.backScene
		var index := 0
		for item in reverse.get("layers", []):
			if not item.get("visible",true):
				continue
			var z := float(frame.back)+.001-float(item.depth)*float(reverse.get("parallax",1))
			var registration := (_camera_distance()+z)/(_camera_distance()+float(frame.back))
			var layer := {"id":"back-"+str(item.id),"kind":"image","reverse":true,"asset":item.src,"x":-float(item.x)*registration,"y":float(item.y)*registration,"scale":float(item.scale)*registration,"opacity":item.opacity,"blend":item.get("blend","normal"),"adjustments":reverse.get("adjustments",{})}
			var node := _surface(layer,_mesh(_quad()),z,1+index,0.0,false)
			var mat := node.material_override as ShaderMaterial
			mat.set_shader_parameter("back_side",true)
			mat.set_shader_parameter("face_mode",1)
			index+=1
	elif _definition.get("backAsset", "") != "":
		var node := _surface({"id":"back","kind":"image","asset":_definition.backAsset,"adjustments":_definition.get("backAdjustments",{}),"reverse":true}, _mesh(_quad()), float(frame.back)+.002, 1, 0.0, false)
		var mat := node.material_override as ShaderMaterial
		mat.set_shader_parameter("back_side", true)
		mat.set_shader_parameter("face_mode", 1)
	_setup_particles()
	if gameplay_stats.has("cost") and gameplay_stats.has("power"):
		set_stats(int(gameplay_stats.cost),int(gameplay_stats.power))
	_update(0.0)

func _embed_component(kind: String, document: Dictionary, offset: Vector3) -> void:
	var child := CardscapeCard.new()
	child.name = "Component"+kind.capitalize()
	child._embedded_definition = document.duplicate(true)
	# Only the parent composes assets; a component cannot recursively bind itself.
	child._embedded_definition.erase("backScene")
	child._embedded_definition.erase("componentScenes")
	child._embedded_definition.erase("backAsset")
	child._embedded_definition.erase("cardStats")
	child._embedded_definition["spatial"] = document.get("spatial",{}).duplicate(true)
	child._embedded_definition.spatial["cameraDistance"] = _camera_distance()
	child.library = library
	child.locale = locale
	child.position = offset
	if kind == "back":
		child.rotation.y = PI
	child.depth_strength = float(document.get("effects",{}).get("depth",1.0))
	child._queued = true
	_visual.add_child(child)
	child.rebuild()
	child.set_process(false)
	_component_nodes[kind] = child

func _quad() -> Dictionary:
	return {"positions":[-.5,.75,0,.5,.75,0,-.5,-.75,0,.5,-.75,0],"uv":[0,0,1,0,0,1,1,1],"indices":[0,2,1,1,2,3]}

func _mesh(data: Dictionary, foreground: bool = false, cloth: Dictionary = {}, dynamic: bool=false) -> ArrayMesh:
	var positions := PackedVector3Array()
	var uvs := PackedVector2Array()
	var colors := PackedColorArray()
	var locks := PackedFloat32Array()
	var img: Image
	var rigid_bytes := PackedByteArray()
	var rigid_stride := 0
	if foreground and not cloth.get("attachment",{}).has("motion"):
		var tex := _texture(_definition.get("maskAssets", {}).get("rigid", ""))
		if tex:
			img = tex.get_image()
			if img:
				match img.get_format():
					Image.FORMAT_L8, Image.FORMAT_R8: rigid_stride = 1
					Image.FORMAT_RGB8: rigid_stride = 3
					Image.FORMAT_RGBA8: rigid_stride = 4
				if rigid_stride > 0:
					rigid_bytes = img.get_data()
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
				var row := y * img.get_width() * rigid_stride
				for x in range(maxi(0,floori(low.x)),mini(img.get_width()-1,ceili(high.x))+1):
					var sample := float(rigid_bytes[row+x*rigid_stride])/255.0 if rigid_stride > 0 else img.get_pixel(x,y).r
					maximum = maxf(maximum,sample)
					# All samples at or above the threshold become a full lock.
					# Reading more pixels cannot change this triangle's result.
					if maximum >= .5:
						maximum = 1.0
						break
				if maximum >= 1.0:
					break
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
		var lock := 0.0 if cloth_image and _definition.has("characterEffects") else locks[i]
		uv2.append(Vector2(weight*(1.0-lock),lock))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = positions
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_TEX_UV2] = uv2
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = PackedInt32Array(data.indices)
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays,[],{},Mesh.ARRAY_FLAG_USE_DYNAMIC_UPDATE if dynamic else 0)
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
				var t: float
				if anchor.edge=="segment":
					var root := Vector2(float(anchor.root[0]),float(anchor.root[1]))
					var delta := Vector2(float(anchor.tip[0]),float(anchor.tip[1]))-root
					t=clampf((Vector2(px,py)-root).dot(delta)/delta.length_squared(),0,1)
				else:
					var distance: float = {"top":py,"bottom":1536-py,"left":px,"right":1024-px}[anchor.edge]
					t=clampf((distance-float(anchor.pin))/(float(anchor.release)-float(anchor.pin)),0,1)
				var value: float
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

func _replacement_background(material: Dictionary) -> String:
	if not effects_playing or not material.get("enabled",false) or material.get("backgroundMode","overlay")!="replace" or material.get("style","")=="ink" or material.get("target","")=="back":
		return ""
	var candidates := []
	for layer in _definition.layers:
		if not layer.get("visible",true) or layer.get("role","")=="baseplate" or layer.get("material_overlay",false):continue
		if layer.kind=="background" or layer.get("role","")=="background-candidate" or layer.get("spatial",{}).get("role","") in ["far","mid","near"]:candidates.append(layer)
	for layer in candidates:
		if layer.kind=="background":return str(layer.id)
	for layer in candidates:
		if layer.get("spatial",{}).get("role","")=="far":return str(layer.id)
	return str(candidates[0].id) if not candidates.is_empty() else ""

func _surface(layer: Dictionary, mesh: Mesh, z: float, priority: int, pass_id: float, bg: bool) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.name = str(layer.id) + ("-inside" if pass_id==1.0 else "-outside" if pass_id==2.0 else "")
	node.set_meta("layer_id", str(layer.id))
	if pass_id > 0.0:
		var anatomical_part: String = layer.get("anatomy",{}).get("part","")
		var wind: String = anatomical_part if anatomical_part in ["hair","cape"] else "sash"
		if layer.kind == "foreground":
			wind = _definition.get("characterEffects",{}).get("bodyMotion",wind)
		node.set_meta("character_wind",wind)
	node.set_meta("background_art",bg and layer.get("role","")!="baseplate" and not layer.get("material_overlay",false) and not layer.get("reverse",false))
	node.set_meta("reverse",bool(layer.get("reverse",false)))
	node.set_meta("material_overlay",bool(layer.get("material_overlay",false)))
	node.mesh = mesh
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.position = Vector3(float(layer.get("x",0))/1024.0,-float(layer.get("y",0))/1024.0,z)
	node.scale = Vector3(float(layer.get("scale",1)),float(layer.get("scale",1)),1)
	node.rotation.z = -deg_to_rad(float(layer.get("rotation",0)))
	for slot in _definition.get("slots", []):
		if slot.id == layer.get("slotId", ""):
			node.position += Vector3(float(slot.u)-.5,.75-float(slot.v)*1.5,float(slot.z) if _definition.get("spatial",{}).get("enabled",false) else float(slot.z)-z)
			node.scale *= Vector3(float(slot.scale),float(slot.scale),1)
			node.rotation.z += -deg_to_rad(float(slot.rotation))
	var pivot: Dictionary = layer.get("pivot",{})
	var pivot_point := Vector2(float(pivot.get("u",.5))-.5,.75-float(pivot.get("v",.5))*1.5)*node.scale.x
	var offset := pivot_point-pivot_point.rotated(node.rotation.z)
	node.position += Vector3(offset.x,offset.y,0)
	var registered: bool = (_definition.get("spatial",{}).get("enabled",false) or layer.get("material_overlay",false)) and layer.kind!="frame" and not layer.get("reverse",false)
	var registration := (_camera_distance()-node.position.z)/(_camera_distance()-.045) if registered else 1.0
	node.scale.x*=registration
	node.scale.y*=registration
	node.position.x*=registration
	node.position.y*=registration
	node.set_meta("registered",registered)
	node.set_meta("registration",registration)
	node.set_meta("character_base",node.transform)
	node.set_meta("depth_override",registered)
	_visual.add_child(node)
	var mat := ShaderMaterial.new()
	var painter_order: bool=not bg and layer.kind!="frame" and layer.id!="back"
	var additive: bool=layer.get("blend","normal")=="add"
	mat.shader = library.surface_shader(_definition.shader_key,painter_order,additive,_finish_index(_definition.frameStyle))
	node.set_meta("shader_source_key",_definition.shader_key)
	node.set_meta("shader_painter_order",painter_order)
	node.set_meta("shader_additive",additive)
	node.set_meta("library_shader",mat.shader)
	node.set_meta("library_shader_code",mat.shader.code if mat.shader else "")
	mat.render_priority = clampi(priority,-128,127)
	mat.set_shader_parameter("contour_counts",_contour_counts)
	mat.set_shader_parameter("contour_texture",1.0 if _contour_field else 0.0)
	if _contour_field:
		mat.set_shader_parameter("contour_field",_contour_field)
		var legacy_field: bool=_contour_field.get_width()==1024 and _contour_field.get_height()==1536
		mat.set_shader_parameter("contour_field_info",Vector4(1024,1536,1,0) if legacy_field else Vector4(_contour_field.get_width(),_contour_field.get_height(),2016.0/_contour_field.get_width(),160.0))
	if not _contour_edges.is_empty():mat.set_shader_parameter("contour_edges",_contour_edges)
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
		mat.set_shader_parameter("title_sweep",_sweep(sweep) if _definition.get("cosmeticPreview",{}).get("title",true) else Vector4.ZERO)
		mat.set_shader_parameter("title_color",Color(sweep.color))
		mat.set_shader_parameter("title_bounds",Vector2(float(variant.get("bounds",[0,1])[0]),float(variant.get("bounds",[0,1])[1])))
	node.set_meta("texture_asset",asset)
	_set_surface_art(mat,_texture(asset))
	node.set_meta("title_sweep_default",mat.get_shader_parameter("title_sweep") if mat.get_shader_parameter("title_sweep") is Vector4 else Vector4.ZERO)
	mat.set_shader_parameter("surfaceChannel",float(clampi(int(layer.get("shaderChannel",0)),0,255)))
	mat.set_shader_parameter("surfaceTransparent",bool(layer.get("shaderTransparent",false)))
	if layer.has("splitSourceId") and registered and not _rigid_part(layer) and not _native_meshes.has(layer.id):
		var join_texture := _attachment_mask(layer)
		if join_texture:
			node.set_meta("attachment_parent",str(layer.splitSourceId))
			mat.set_shader_parameter("attached",true)
			mat.set_shader_parameter("attachment_tex",join_texture)
	mat.set_shader_parameter("foreground_pass",pass_id)
	mat.set_shader_parameter("rigid_part",_rigid_part(layer) or _native_meshes.has(layer.id))
	mat.set_shader_parameter("background",bg)
	mat.set_shader_parameter("clipped",bool(layer.get("spatial",{}).get("clip",false)))
	for slot in _definition.get("slots",[]):
		if slot.id==layer.get("slotId",""):
			mat.set_shader_parameter("clipped",slot.clip)
			mat.set_shader_parameter("slot_effect",Vector3(1 if slot.effect=="pulse" else 2 if slot.effect=="flow" else 0,float(slot.strength),float(slot.speed)))
	node.set_meta("character_opacity",float(layer.get("opacity",1)))
	mat.set_shader_parameter("opacity",float(layer.get("opacity",1)))
	var shader: Dictionary = _definition.shader
	node.set_meta("custom_effect_default",not layer.get("reverse",false) and shader.fragmentTarget in ["all",layer.id,layer.kind])
	mat.set_shader_parameter("custom_effect",node.get_meta("custom_effect_default"))
	node.set_meta("slot_effect_default",mat.get_shader_parameter("slot_effect") if mat.get_shader_parameter("slot_effect") is Vector3 else Vector3.ZERO)
	mat.set_shader_parameter("custom_masked",shader.fragmentMask!="none")
	mat.set_shader_parameter("custom_strength",float(shader.fragmentStrength))
	mat.set_shader_parameter("custom_mask_tex",_texture(_definition.get("maskAssets",{}).get(shader.fragmentMask,"")))
	for name in ["motion","inset","emission","phase","foil"]:
		mat.set_shader_parameter(name+"_tex",_texture(_definition.get("maskAssets",{}).get(name,"")))
	var subject_mask := _texture(_definition.get("maskAssets",{}).get("subject","")) if not layer.get("reverse",false) else null
	if subject_mask:
		mat.set_shader_parameter("laser_subject_tex",subject_mask)
	var protected_subject: bool = pass_id>0.0 or layer.kind=="text" or layer.get("role","") in ["cost","power","stat-cost","stat-power"]
	mat.set_shader_parameter("laser_surface_role",Vector4(float(protected_subject),float(subject_mask!=null),float(layer.kind=="frame" or layer.get("role","")=="frame-artwork"),float(registered)))
	if layer.has("sourceWindow") and _texture(asset):
		var r: Dictionary = layer.sourceWindow
		var original_size: Variant=_definition.get("exportProfile",{}).get("textures",{}).get(asset,{}).get("sourceSize",[])
		var size: Vector2=Vector2(float(original_size[0]),float(original_size[1])) if original_size is Array and original_size.size()==2 else _texture(asset).get_size()
		if bg and registered:
			mat.set_shader_parameter("background_extent",size/Vector2(float(r.width),float(r.height)))
		mat.set_shader_parameter("source_rect",Vector4(float(r.x)/size.x,float(r.y)/size.y,float(r.width)/size.x,float(r.height)/size.y))
	var adj: Dictionary = layer.get("adjustments",{})
	var shared_adj: Dictionary = layer.get("componentAdjustments",{})
	mat.set_shader_parameter("adjustment",Vector4((float(adj.get("brightness",0))+float(shared_adj.get("brightness",0)))/100.0,(1+float(adj.get("contrast",0))/100.0)*(1+float(shared_adj.get("contrast",0))/100.0),float(adj.get("saturation",100))*float(shared_adj.get("saturation",100))/10000.0,float(adj.get("gamma",1))*float(shared_adj.get("gamma",1))))
	return node

func _rigid_part(layer: Dictionary) -> bool:
	return layer.get("role","")=="frame-artwork" or layer.get("attachment",{}).get("mode","")=="rigid" or layer.get("anatomy",{}).get("part","") in ["arm","forearm","hand","leg","wing","head","torso","weapon","accessory"]

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

func _wordmark_order(layers: Array, setting: Dictionary) -> Array:
	if setting.is_empty():
		return layers
	var marks := layers.filter(func(layer: Dictionary) -> bool:
		if not layer.get("visible",true):
			return false
		var role: String = layer.get("role","")
		return (layer.kind == "text" and role not in ["cost","power","stat-cost","stat-power"]) or (layer.kind == "image" and role == "wordmark")
	)
	var occluders := layers.filter(func(layer: Dictionary) -> bool:
		return layer.get("visible",true) and layer.kind == "image" and layer.get("spatial",{}).get("role","") == "front"
	)
	if marks.is_empty() or occluders.is_empty():
		return layers
	var mark: Dictionary = marks.back()
	var part: Dictionary = occluders.back()
	if setting.has("layerId"):
		var exact := marks.filter(func(layer: Dictionary) -> bool: return layer.id == setting.layerId)
		if exact.is_empty():
			return layers
		mark = exact[0]
	else:
		var illustrated := marks.filter(func(layer: Dictionary) -> bool: return layer.has("titleArt") or layer.get("role","") == "wordmark")
		var plain := marks.filter(func(layer: Dictionary) -> bool: return layer.id == "title")
		if not illustrated.is_empty():
			mark = illustrated[0]
		elif not plain.is_empty():
			mark = plain[0]
	if setting.has("occluderId"):
		var exact := occluders.filter(func(layer: Dictionary) -> bool: return layer.id == setting.occluderId)
		if exact.is_empty():
			return layers
		part = exact[0]
	else:
		var sashes := occluders.filter(func(layer: Dictionary) -> bool: return layer.get("anatomy",{}).get("part","") == "skirt")
		if not sashes.is_empty():
			part = sashes[0]
	layers.erase(mark)
	layers.insert(layers.find(part) + (0 if setting.enabled else 1),mark)
	return layers

func _process(delta: float) -> void:
	if effects_playing and not effects_paused:
		_clock += delta
	if not _paused:
		_action_time += delta
		if not _transition.is_empty():_transition.seconds+=delta
	_update(delta)

func _update(_delta: float) -> void:
	if audio_enabled and not _action_audio:
		_action_audio=ActionAudio.new(self,library)
		_action_audio.set_enabled(true)
	if _action_audio:_action_audio.sync(_action,_action_time,audio_enabled and not _paused and not effects_paused and effects_playing and is_visible_in_tree() and is_instance_valid(_visual))
	if not _visual or _definition.is_empty():
		return
	var progress := 0.0
	var root_alpha := _inherited_opacity
	var motion := 1.0
	var flow := 1.0
	var extra_bend := 0.0
	if not _action.is_empty():
		var duration := float(_action.duration)
		progress = fmod(_action_time,duration)/duration if _action.loop and not _paused else minf(1.0,_action_time/duration)
		var tracks: Dictionary = _action.get("tracks",{})
		var envelope := 1.0 if _action.loop else sin(progress*PI)
		_visual.position = Vector3(_sample(tracks.get("x",[]),progress,0)/1024.0,-_sample(tracks.get("y",[]),progress,0)/1024.0,_sample(tracks.get("z",[]),progress,0))
		_visual.scale = Vector3.ONE * _sample(tracks.get("scale",[]),progress,1)
		_visual.rotation = _base_pose + Vector3(deg_to_rad(_sample(tracks.get("pitch",[]),progress,0)),deg_to_rad(_sample(tracks.get("yaw",[]),progress,progress*180 if _action.event=="flip" else 0)),0)
		root_alpha *= _sample(tracks.get("opacity",[]),progress,1)
		motion = _sample(tracks.get("motion",[]),progress,1+(float(_action.motion)-1)*envelope)
		flow = _sample(tracks.get("emission",[]),progress,1+(float(_action.emission)-1)*envelope)
		extra_bend = _sample(tracks.get("bend",[]),progress,float(_action.bend)*envelope)
		if not _action.loop and progress >= 1 and not _paused and (_transition.is_empty() or float(_transition.seconds)>=float(_transition.duration)):
			_paused = true
			action_finished.emit(str(_action.id))
	var character_action := _action
	var character_progress := progress
	if character_action.is_empty():
		var candidates: Array=_definition.get("actions",[])
		var idle: Array=candidates.filter(func(a):return a.id=="idle")
		if idle.is_empty():idle=candidates.filter(func(a):return a.event=="idle")
		if not idle.is_empty():
			character_action=idle[0]
			character_progress=fmod(_clock,float(character_action.duration))/float(character_action.duration) if character_action.loop else minf(1.0,_clock/float(character_action.duration))
	if not _transition.is_empty():
		var weight := clampf(float(_transition.seconds)/float(_transition.duration),0.0,1.0)
		character_action=CharacterAnimation.blend_actions(_transition.from,CharacterAnimation.snapshot(_character_compiled,character_action,character_progress),weight*weight*(3.0-2.0*weight))
		character_progress=0.0
		var tracks: Dictionary=character_action.tracks
		_visual.position=Vector3(float(tracks.x[0].value)/1024.0,-float(tracks.y[0].value)/1024.0,float(tracks.z[0].value))
		_visual.scale=Vector3.ONE*float(tracks.scale[0].value)
		_visual.rotation=_base_pose+Vector3(deg_to_rad(float(tracks.pitch[0].value)),deg_to_rad(float(tracks.yaw[0].value)),0.0)
		root_alpha=_inherited_opacity*float(tracks.opacity[0].value)
		motion=float(tracks.motion[0].value)
		flow=float(tracks.emission[0].value)
		extra_bend=float(tracks.bend[0].value)
		if weight>=1.0:_transition.clear()
	_rendered_action=character_action
	_rendered_progress=character_progress
	_update_detail()
	var pose: Dictionary = CharacterAnimation.pose(_character_compiled,character_action,character_progress,_definition.layers) if effects_playing else CharacterAnimation.rest(_character_compiled,_definition.layers)
	var paint_layers: Array=_definition.layers.duplicate()
	paint_layers.reverse()
	paint_layers=CharacterAnimation.ordered_layers(paint_layers,character_action,character_progress)
	var character_effects: Dictionary = _definition.get("characterEffects",{})
	paint_layers = _wordmark_order(paint_layers,character_effects.get("wordmark",{}))
	var paint_order: Dictionary={}
	for i in range(paint_layers.size()):paint_order[paint_layers[i].id]=-60+i*2
	var character_pose: Dictionary = pose.layers if effects_playing and _definition.get("cosmeticPreview",{}).get("motion",true) else {}
	var skin_pose_key := [effects_playing,character_action.hash(),character_progress,_camera_distance()]
	var updated: Dictionary={}
	for surface in _surfaces:
		if surface.has_meta("character_base"):
			if not _detail_visible(surface.get_meta("layer_id","")):continue
			var id: String=surface.get_meta("layer_id","")
			if _native_meshes.has(id):
				surface.transform=surface.get_meta("character_base")
				if not updated.has(id):
					var skin: Dictionary=_native_meshes[id]
					if skin.get("pose_key",[])!=skin_pose_key:
						var points: PackedVector3Array=CharacterAnimation.Deformation.geometry(skin.spec,pose,surface.transform,float(surface.get_meta("registration",1.0)),_camera_distance())
						(skin.mesh as ArrayMesh).surface_update_vertex_region(0,0,points.to_byte_array())
						skin["last_positions"]=points
						skin["pose_key"]=skin_pose_key.duplicate()
						(skin.mesh as ArrayMesh).custom_aabb=AABB(Vector3(-8,-8,-1),Vector3(16,16,2))
					updated[id]=true
			else:surface.transform=CharacterAnimation.apply(surface.get_meta("character_base"),float(surface.get_meta("registration",1.0)),character_pose.get(id,{}))
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
	var effects: Dictionary = _definition.get("effects",{})
	var material: Dictionary = _definition.get("material",{}).duplicate()
	material.merge(material_settings,true)
	if not _detail_effects.materials:
		material.enabled=false
		material.backgroundMode="overlay"
	var replacement_owner := _replacement_background(material)
	var finish_index:=_finish_index(style)
	# Compute card-wide values once, while still writing every frame so gameplay
	# uniform overrides retain their existing next-update semantics.
	var deformation: Dictionary=_definition.get("deformation",{})
	var glow: Dictionary = character_effects.get("glow",{})
	var rate := TAU / 3.6
	var glow_gain := (float(glow.strength) if glow.enabled else 0.0) if not glow.is_empty() else float(effects.get("flow",false))
	var common_parameters: Dictionary={
		&"laser_camera":_camera_distance(),
		&"card_eye":eye,&"surfaceEye":eye,&"front_visible":front,&"clock":_clock,&"root_opacity":root_alpha,&"depth":depth_strength,
		&"geometry_bend":float(deformation.get("bend",0))+(extra_bend if _definition.get("cosmeticPreview",{}).get("motion",true) else 0.0),
		&"motion_gain":motion*float(deformation.get("wind",1)) if effects_playing and character_effects.is_empty() and effects.get("cape",false) else 0.0,
		&"flow_speed":float(glow.speed)*rate/3.1 if not glow.is_empty() else float(effects.get("flowSpeed",1)),
		&"flow_gain":flow*glow_gain if effects_playing and _detail_effects.materials else 0.0,
		&"wind_speed":float(deformation.get("speed",1)),
		&"metrics":Vector4(float(style.width)/1024.0,float(style.corner)/1024.0,float(style.depth)/1024.0,minf(float(style.bevel),minf(float(style.depth)*.45,16.0 if style.has("contour") else float(style.width)*.4))/1024.0),
		&"pop_sides":Vector4(float(composition.get("top",true)),float(composition.get("right",true)),float(composition.get("bottom",false)),float(composition.get("left",true))),
		&"pop_bounds":_pop_bounds,
		&"frame_color":Color(style.color),&"frame_accent":Color(style.accent),&"frame_finish":finish_index,
		&"frame_animation":Vector2(["none","pulse","flow","infinity"].find(style.get("animation","none")) if effects_playing and _detail_effects.materials else 0,float(style.get("animationSpeed",.6))),
		&"armor_sweep":_sweep(armor) if _detail_effects.materials else Vector4.ZERO,&"armor_color":Color(armor.get("color","#badfff"))
	}
	if not glow.is_empty():
		var tint := Color(str(glow.color))
		common_parameters[&"flow_color"] = Vector3(tint.r,tint.g,tint.b)
	var front_material := _material_parameters(material,false)
	var back_material := _material_parameters(_definition.get("backScene",{}).get("material",material),true)
	for surface in _surfaces:
		surface.visible=true
		if surface.get_meta("background_art",false):surface.visible=replacement_owner.is_empty() or surface.get_meta("layer_id","")==replacement_owner
		if surface.get_meta("layer_id","")=="frame-aura":
			surface.visible=front and _detail_effects.materials and style.finish in ["glow","cosmic","ice","fire","fire-iridescent","glyphs","refraction","overloaded","neonnights","pax","candy-halloween","halloween-stickers"]
		if surface.get_meta("reverse_only",false):
			surface.visible = not front
		surface.visible=surface.visible and _detail_visible(surface.get_meta("layer_id",""))
		var mat := surface.material_override as ShaderMaterial
		_refresh_surface_shader(surface,mat,finish_index)
		if paint_order.has(surface.get_meta("layer_id","")) and not surface.get_meta("background_art",false) and not surface.get_meta("reverse",false) and not surface.get_meta("material_overlay",false):mat.render_priority=clampi(int(paint_order[surface.get_meta("layer_id","")]),-128,127)
		mat.set_shader_parameter("custom_effect",_detail_effects.materials and surface.get_meta("custom_effect_default",false))
		mat.set_shader_parameter("title_sweep",surface.get_meta("title_sweep_default",Vector4.ZERO) if _detail_effects.materials else Vector4.ZERO)
		var slot_effect: Vector3=surface.get_meta("slot_effect_default",Vector3.ZERO)
		mat.set_shader_parameter("slot_effect",slot_effect if _detail_effects.materials else Vector3.ZERO)
		if float(mat.get_shader_parameter("foreground_pass")) > 0 and not surface.get_meta("depth_override",false):
			surface.position.z = .045 + .045 * depth_strength
		if character_pose.has(surface.get_meta("layer_id","")) or surface.get_meta("character_animated_opacity",false):
			mat.set_shader_parameter("opacity",float(surface.get_meta("character_opacity"))*float(character_pose.get(surface.get_meta("layer_id",""),{}).get("opacity",1)))
			surface.set_meta("character_animated_opacity",character_pose.has(surface.get_meta("layer_id","")))
		mat.set_shader_parameter("layer_transform",surface.transform)
		if surface.has_meta("attachment_parent"):
			for parent in _surfaces:
				if parent.get_meta("layer_id","")==surface.get_meta("attachment_parent"):
					mat.set_shader_parameter("attachment_transform",parent.transform)
					break
		for name in common_parameters:mat.set_shader_parameter(name,common_parameters[name])
		if surface.has_meta("character_wind") and not character_effects.is_empty():
			var wind: Dictionary = character_effects[surface.get_meta("character_wind")]
			mat.set_shader_parameter("character_flutter",Vector2(float(wind.strength)*motion if effects_playing and wind.enabled else 0.0,float(wind.speed)*rate))
		var surface_material: Dictionary=back_material if surface.get_meta("reverse",false) else front_material
		for name in surface_material.parameters:mat.set_shader_parameter(name,surface_material.parameters[name])
		mat.set_shader_parameter("material_replace",1.0 if surface_material.replace and not surface.get_meta("material_overlay",false) else 0.0)
		mat.set_shader_parameter("material_style",surface_material.style_index)
	var event_action: Dictionary = _action if not _action.is_empty() else character_action
	var event_progress: float = progress if not _action.is_empty() else character_progress
	var events: Array = []
	for event in event_action.get("particleEvents",[]):
		var age: float = event_progress*float(event_action.duration)-float(event.at)*float(event_action.duration)
		if event.particles.get("enabled",false) and age>=0.0 and age<float(event.duration): events.append({"event":event,"age":age})
	var saved_budget := particle_budget
	particle_budget = floori(float(saved_budget)/(1+events.size()))
	_update_particles(root_alpha,front)
	_update_action_particles(events,event_action,pose if _definition.get("cosmeticPreview",{}).get("motion",true) else CharacterAnimation.rest(_character_compiled,_definition.layers),root_alpha,front)
	particle_budget = saved_budget
	var available_particles := maxi(0,particle_budget-_particle_count-_particle_event_count)
	for kind in _component_nodes:
		var child: CardscapeCard = _component_nodes[kind]
		child._detail_parent={"level":_detail_level,"effects":_detail_effects}
		child.visible = (not front if kind == "back" else front) and (kind!="particles" or _detail_effects.particles) and (not kind in ["material","effect"] or _detail_effects.materials)
		child.effects_playing = effects_playing and child.visible
		child.effects_paused = effects_paused
		child.audio_enabled = audio_enabled
		child._clock = _clock
		child._particle_reveal_started = _particle_reveal_started
		child._inherited_opacity = root_alpha*float(child.get_meta("binding_opacity",1.0))
		if kind == "frame":
			child.material_settings = material.duplicate(true) if material.get("enabled",false) and material.get("target","")=="front" else {}
		child.particle_budget = available_particles
		if not child._paused:
			child._action_time += _delta
		if child.visible:child._update(_delta)
		available_particles = maxi(0,available_particles-child._particle_count-child._particle_event_count)

func _material_parameters(value: Dictionary, reverse: bool) -> Dictionary:
	var result := {&"replace":_detail_effects.materials and value.get("backgroundMode","overlay")=="replace",&"style_index":MATERIAL_STYLES.find(value.get("style","iridescent")),&"parameters":{
		&"component_material":Vector4(float(value.get("strength",.3)) if effects_playing and _detail_effects.materials and value.get("enabled",false) else 0,float(value.get("speed",.25)),float(value.get("frequency",4)),5 if reverse else 1 if value.get("target","both")=="background" else 2 if value.get("target","both")=="back" else 3 if value.get("target","")=="front" else 4 if value.get("target","")=="artwork" else 0),
		&"material_color":Color(value.get("color","#78cfff")),&"material_accent":Color(value.get("accent","#fa8dde")),&"holographic":value.get("style","")=="holographic"}}
	if value.get("style","")=="laser-foil":
		var laser: Dictionary=value.get("laser",{})
		result.parameters[&"laser_controls"]=Vector4(float(laser.get("rainbow",1)),float(laser.get("foil",1)),float(laser.get("glare",1)),float(laser.get("sparkle",1)))
		result.parameters[&"laser_modes"]=Vector4(maxi(0,LASER_PATTERNS.find(laser.get("pattern","cosmos"))),float(laser.get("tone","auto")=="auto"),maxi(0,LASER_SIGNATURES.find(laser.get("signature","auto"))),float(laser.get("protectSubject",true)))
		var overlays: Array=laser.get("overlays",[])
		var styles := Vector3(-1,-1,-1)
		var gains := Vector3.ZERO
		for i in mini(overlays.size(),3):
			styles[i]=LASER_PATTERNS.find(overlays[i].get("pattern",""))
			if styles[i]>=0: gains[i]=clampf(float(overlays[i].get("strength",0)),0,1)
		result.parameters[&"laser_overlays"]=styles
		result.parameters[&"laser_overlay_gains"]=gains
		var anchor: Array=laser.get("signatureAnchor",[])
		result.parameters[&"laser_signature_anchor"]=Vector2(float(anchor[0]),float(anchor[1])) if anchor.size()==2 else Vector2(-1.0,-1.0)
	return result

func _particle_config() -> Dictionary:
	if not _particle_event_config.is_empty(): return _particle_event_config
	var result: Dictionary = _definition.get("particles",{}).duplicate()
	result.merge(particle_settings,true)
	return result

func _update_action_particles(events: Array, action: Dictionary, pose: Dictionary, root_alpha: float, front: bool) -> void:
	_record_particle_world(action)
	# PNG payloads and FFD are irrelevant to a bone birth transform.
	var birth_action := {"boneTracks":action.get("boneTracks",{}),"ikTracks":action.get("ikTracks",{})}
	var source: int=[action.get("duration",1),birth_action].hash()
	if source!=_particle_birth_source:
		_particle_birth_source=source
		_particle_birth_cache.clear()
	var saved := {"node":_particle_node,"front":_particle_front_node,"count":_particle_count,"reveal":_particle_reveal_count,"clock":_clock,"start":_particle_reveal_started}
	_particle_event_count=0
	for state in _particle_event_states.values():
		state.node.visible=false
		if state.front:state.front.visible=false
		if state.has("trail"):state.trail.visible=false
	if not _detail_effects.particles or particle_budget<1 or not effects_playing:return
	var active_keys: Array=events.map(func(entry):return str(_action.get("id","idle"))+":"+str(entry.event.id))
	for entry in events:
		var event: Dictionary=entry.event
		var world: bool=event.get("simulationSpace","bone")=="world"
		var key: String=str(_action.get("id","idle"))+":"+str(event.id)
		if not _particle_event_states.has(key):
			# A bounded pool survives replay and seeking. Rebuild releases the pool
			# with the old visual tree, alongside ordinary particle resources.
			if _particle_event_states.size()>=16:
				var victim: String=str(_particle_event_states.keys().filter(func(id):return not active_keys.has(id))[0])
				var old: Dictionary=_particle_event_states[victim]
				old.node.queue_free()
				if old.front:old.front.queue_free()
				if old.has("trail"):old.trail.queue_free()
				_particle_event_states.erase(victim)
			_particle_front_node=null
			_setup_particles()
			_particle_event_states[key]={"node":_particle_node,"front":null}
		var state: Dictionary=_particle_event_states[key]
		if event.has("trail"):
			var samples: Array=_sample_action_trail(event,float(entry.age),action,pose,front)
			ActionTrail.update(state,samples,_visual,Color(event.particles.get("color","#91deff")),event.particles.get("blend","add"),120 if front== (event.particles.get("placement","behind") in ["surface","front"]) else -120,1.0 if world else root_alpha)
			if state.has("trail"):
				state.trail.top_level=world
				state.trail.transform=Transform3D.IDENTITY
			state.count=maxi(0,samples.size()-1)
			_particle_event_count+=state.count
			continue
		_particle_node=state.node
		_particle_front_node=state.front
		_particle_node.top_level=world
		_particle_node.transform=Transform3D.IDENTITY
		_particle_node.visible=true
		_particle_event_config=event.particles
		var physical: bool=event.has("physics")
		_particle_color_sampling=world or physical
		if _particle_color_sampling:
			if not state.has("world_alphas"):
				state.world_alphas=PackedFloat64Array()
				state.world_alphas.resize(256)
			_particle_world_alphas=state.world_alphas
		_particle_sample_births=world or physical or (event.get("simulationSpace","bone")=="card" and event.has("boneId")) or event.has("emissionDuration")
		_particle_world_sampling=world
		_clock=float(entry.age)
		_particle_reveal_started=0.0
		_update_particles(1.0 if world else root_alpha,front)
		var fade: float=minf(.12,float(event.duration)*.2)
		var edge: float=clampf(minf(float(entry.age)/fade,(float(event.duration)-float(entry.age))/fade),0.0,1.0)
		for i in _particle_count:
			var color: Color=_particle_node.multimesh.get_instance_color(i)
			if _particle_color_sampling:color.a=_particle_world_alphas[i]
			color.a*=edge*edge*(3-2*edge)
			if event.has("emissionDuration") and _particle_births[i]>=float(event.emissionDuration):color.a=0.0
			if event.has("emissionDuration") and event.particles.get("trajectory","outward") in ["float","field"]:
				color.a*=1-clampf((float(entry.age)-float(event.emissionDuration))/float(event.particles.lifetime),0.0,1.0)
			if _particle_color_sampling:_particle_world_alphas[i]=color.a
			else:_particle_node.multimesh.set_instance_color(i,color)
		if event.has("boneId"):
			var bone: Dictionary=pose.bones.get(event.boneId,{})
			if bone.is_empty():_particle_node.multimesh.visible_instance_count=0;_particle_count=0
			else:
				var registration: float=1.0
				var emitter: Dictionary=event.particles.get("emitter",{})
				for layer in _definition.layers:
					if layer.id==emitter.get("layerId","") and _definition.get("spatial",{}).get("enabled",false):
						var z: float=float(layer.get("spatial",{}).get("z",.075))+.045
						registration=(_camera_distance()-z)/(_camera_distance()-.045)
				for i in _particle_count:
					var birth_bone: Dictionary=bone
					if event.get("simulationSpace","bone") in ["card","world"] and _definition.get("cosmeticPreview",{}).get("motion",true):
						var seconds: float=float(event.at)*float(action.duration)+_particle_births[i]
						var birth_key := str(event.boneId)+":"+String.num(seconds,14)
						if not _particle_birth_cache.has(birth_key):
							if _particle_birth_cache.size()>=512:_particle_birth_cache.erase(_particle_birth_cache.keys()[0])
							var birth_pose: Dictionary=CharacterAnimation.pose(_character_compiled,birth_action,clampf(seconds/float(action.duration),0.0,1.0),_definition.layers)
							_particle_birth_cache[birth_key]=birth_pose.bones.get(event.boneId,{"matrix":Transform2D.IDENTITY,"opacity":0.0})
						birth_bone=_particle_birth_cache[birth_key]
					var matrix: Transform2D=birth_bone.matrix
					var transform: Transform3D=_particle_node.multimesh.get_instance_transform(i)
					var pixel:=Vector2(transform.origin.x/registration*1024+512,768-transform.origin.y/registration*1024)
					var moved: Vector2=matrix*pixel
					transform.origin.x=(moved.x-512)/1024*registration
					transform.origin.y=-(moved.y-768)/1024*registration
					transform.basis=transform.basis.scaled(Vector3.ONE*sqrt(absf(matrix.determinant())))
					_particle_node.multimesh.set_instance_transform(i,transform)
					var data: Color=_particle_node.multimesh.get_instance_custom_data(i)
					data.g-=matrix.x.angle()
					_particle_node.multimesh.set_instance_custom_data(i,data)
					if _particle_color_sampling:_particle_world_alphas[i]*=float(birth_bone.opacity)
					else:
						var color: Color=_particle_node.multimesh.get_instance_color(i)
						color.a*=float(birth_bone.opacity)
						_particle_node.multimesh.set_instance_color(i,color)
		if world:
			var e: Dictionary=_event_world_emitter(event)
			for i in _particle_count:
				var root_pose:=_sample_particle_world(float(event.at)*float(action.duration)+_particle_births[i],action)
				var transform: Transform3D=root_pose.transform
				_particle_node.multimesh.set_instance_transform(i,transform*_particle_node.multimesh.get_instance_transform(i))
				var color: Color=_particle_node.multimesh.get_instance_color(i)
				_particle_world_alphas[i]*=float(root_pose.opacity) if _world_emitter_visible(e,transform) else 0.0
				color.a=_particle_world_alphas[i]
				_particle_node.multimesh.set_instance_color(i,color)
				var data: Color=_particle_node.multimesh.get_instance_custom_data(i)
				data.a=transform.basis.z.length()
				_particle_node.multimesh.set_instance_custom_data(i,data)
			(_particle_node.material_override as ShaderMaterial).render_priority=120 if event.particles.get("placement","behind") in ["surface","front"] else -120
		if physical:_apply_particle_physics(event,float(entry.age),action,pose,world)
		if _particle_front_node:
			_particle_front_node.top_level=world
			_particle_front_node.transform=Transform3D.IDENTITY
			var front_mat:=_particle_front_node.material_override as ShaderMaterial
			front_mat.set_shader_parameter("world_space",world)
			if world:
				front_mat.render_priority=120
				front_mat.set_shader_parameter("layer_offset_z",-.2 if _event_world_emitter(event).get("target","")=="back" and _definition.get("assetKind","")!="back" else .2)
		state.front=_particle_front_node
		state.count=_particle_count
		_particle_event_count+=_particle_count
	_particle_node=saved.node
	_particle_front_node=saved.front
	_particle_count=saved.count
	_particle_reveal_count=saved.reveal
	_clock=saved.clock
	_particle_reveal_started=saved.start
	_particle_event_config={}
	_particle_sample_births=false
	_particle_world_sampling=false
	_particle_color_sampling=false

func _apply_particle_physics(event: Dictionary,age: float,action: Dictionary,pose: Dictionary,world: bool) -> void:
	if not event.get("simulationSpace","bone") in ["card","world"] or event.has("trail"):
		push_error("Particle physics requires a card/world ordinary particle event")
		return
	if not _particle_physics:_particle_physics=ParticlePhysics.new()
	var config: Dictionary=event.physics
	var signature:=_particle_physics.prepare(config)
	if signature.is_empty():return
	var p: Dictionary=event.particles
	var e: Dictionary={"shape":"perimeter","u":.5,"v":.5,"width":1.0,"height":1.0,"target":"card","layerId":"","regionId":""}
	e.merge(p.get("emitter",{}),true)
	var target: String=e.target
	var src: Dictionary=_definition
	if target=="back" and _definition.get("assetKind","")!="back":src=_definition.get("backScene",{}).get("document",_definition.get("backScene",{}))
	elif target=="frame":src=_definition.get("componentScenes",{}).get("frame",{}).get("document",_definition)
	for region in src.get("emissionRegions",[]):
		if region.id==e.regionId:e.merge(region,true)
	var layer: Dictionary={}
	for item in src.get("layers",[]):
		if item.id==e.layerId:layer=item;break
	var z: float=.045 if target in ["frame","back"] else 0.0
	var registration:=1.0
	var scale2d:=1.0
	var rotation2d:=0.0
	var translation:=Vector2.ZERO
	if not layer.is_empty():
		z=.045+float(layer.get("spatial",{}).get("z",0))
		registration=(_camera_distance()-z)/(_camera_distance()-.045) if src.get("spatial",{}).get("enabled",false) else 1.0
		scale2d=float(layer.get("scale",1))
		rotation2d=-deg_to_rad(float(layer.get("rotation",0)))
		translation=Vector2(float(layer.get("x",0))/1024.0,-float(layer.get("y",0))/1024.0)*registration
	var offset: float=absf(float(p.z)) if p.get("placement","behind") in ["surface","front"] else float(p.z)
	var reverse: bool=target=="back" and _definition.get("assetKind","")!="back"
	var mapping:=Transform3D(Basis.from_euler(Vector3(0,0,rotation2d)).scaled(Vector3(scale2d*registration,scale2d*registration,1)),Vector3(translation.x,translation.y,z+(absf(offset) if reverse else offset)))
	if reverse:mapping=Transform3D(Basis.from_scale(Vector3(-1,1,-1)),Vector3(0,0,.045-float(_definition.frameStyle.depth)/1024.0))*mapping
	var idle: int=_particle_count-_particle_reveal_count
	var cut: float=float(src.get("frameStyle",{}).get("corner",48))/1024.0 if target=="frame" and e.shape=="perimeter" and e.width==1.0 and e.height==1.0 else 0.0
	for i in _particle_count:
		var born: float=_particle_births[i]
		var seed_id: int=i if i<idle else 1024+i-idle
		var launch:=ParticlePhysics.launch(int(p.seed),seed_id,e,config,cut)
		var first: Vector3=mapping*launch.position
		var last: Vector3=mapping*(launch.position+launch.velocity)
		if event.has("boneId"):
			var bone: Dictionary=pose.bones.get(event.boneId,{})
			if _definition.get("cosmeticPreview",{}).get("motion",true):
				var key:=str(event.boneId)+":"+String.num(float(event.at)*float(action.duration)+born,14)
				bone=_particle_birth_cache.get(key,bone)
			if not bone.is_empty():
				var matrix: Transform2D=bone.matrix
				var a: Vector2=matrix*Vector2(first.x/registration*1024+512,768-first.y/registration*1024)
				var b: Vector2=matrix*Vector2(last.x/registration*1024+512,768-last.y/registration*1024)
				first=Vector3((a.x-512)/1024*registration,-(a.y-768)/1024*registration,first.z)
				last=Vector3((b.x-512)/1024*registration,-(b.y-768)/1024*registration,last.z)
		if world:
			var root_pose:=_sample_particle_world(float(event.at)*float(action.duration)+born,action)
			first=root_pose.transform*first
			last=root_pose.transform*last
		var state:=_particle_physics.sample(config,first,last-first,maxf(0,age-born),maxf(0,float(event.duration)-born),signature)
		var transform: Transform3D=_particle_node.multimesh.get_instance_transform(i)
		transform.origin=state.position
		_particle_node.multimesh.set_instance_transform(i,transform)
		var velocity: Vector3=state.velocity
		if Vector2(velocity.x,velocity.y).length()>1e-7:
			var data: Color=_particle_node.multimesh.get_instance_custom_data(i)
			data.g=atan2(velocity.y,velocity.x)
			_particle_node.multimesh.set_instance_custom_data(i,data)
		if not state.alive:_particle_world_alphas[i]=0.0
		var color: Color=_particle_node.multimesh.get_instance_color(i)
		color.a=_particle_world_alphas[i]
		_particle_node.multimesh.set_instance_color(i,color)

func _record_particle_world(action: Dictionary) -> void:
	if not action.get("particleEvents",[]).any(func(event):return event.get("simulationSpace","bone")=="world"):return
	if not _particle_world_history:_particle_world_history=ParticleWorldHistory.new()
	var source: int=[action.get("id",""),action.get("duration",1),action.get("tracks",{})].hash()
	if source!=_particle_world_source:
		_particle_world_source=source
		_particle_world_history.clear()
	var elapsed: float=_clock if _action.is_empty() else _action_time+_particle_world_time_offset
	var duration: float=float(action.duration)
	var action_seconds: float=_clock if _action.is_empty() else _action_time
	var progress: float=fmod(action_seconds,duration)/duration if action.get("loop",false) and not _paused else minf(1.0,action_seconds/duration)
	_particle_world_cycle=elapsed-progress*duration
	_particle_world_history.record(elapsed,global_transform,_base_pose,_inherited_opacity)

func _sample_particle_world(seconds: float, action: Dictionary) -> Dictionary:
	var absolute: float=_particle_world_cycle+seconds
	var placement: Dictionary=_particle_world_history.sample(absolute)
	var progress: float=clampf(seconds/float(action.duration),0.0,1.0)
	var tracks: Dictionary=action.get("tracks",{})
	var base: Vector3=placement.pose
	var rotation_pose:=base+Vector3(deg_to_rad(_sample(tracks.get("pitch",[]),progress,0)),deg_to_rad(_sample(tracks.get("yaw",[]),progress,progress*180 if action.get("event","")=="flip" else 0)),0)
	var local:=Transform3D(Basis.from_euler(rotation_pose,EULER_ORDER_XYZ).scaled(Vector3.ONE*_sample(tracks.get("scale",[]),progress,1)),Vector3(_sample(tracks.get("x",[]),progress,0)/1024.0,-_sample(tracks.get("y",[]),progress,0)/1024.0,_sample(tracks.get("z",[]),progress,0)))
	var result: Dictionary={"transform":placement.transform*local,"opacity":float(placement.opacity)*_sample(tracks.get("opacity",[]),progress,1)}
	if _particle_world_sampler.is_valid():
		var sampled: Variant=_particle_world_sampler.call(str(action.id),absolute,result.duplicate())
		if sampled is Dictionary and sampled.get("transform") is Transform3D and (sampled.transform as Transform3D).is_finite() and typeof(sampled.get("opacity")) in [TYPE_INT,TYPE_FLOAT] and is_finite(float(sampled.opacity)):
			result=sampled
		else:push_error("Invalid world particle sampler result; using recorded placement")
	result.opacity=clampf(float(result.opacity),0.0,1.0)
	return result

func _event_world_emitter(event: Dictionary) -> Dictionary:
	var e: Dictionary=event.particles.get("emitter",{}).duplicate()
	for region in _definition.get("emissionRegions",[]):
		if region.id==e.get("regionId",""):e.merge(region,true)
	return e

func _world_emitter_visible(emitter: Dictionary, transform: Transform3D) -> bool:
	var camera:=get_viewport().get_camera_3d()
	var front: bool=transform.basis.z.dot((camera.global_position if camera else Vector3(0,0,2.7))-transform.origin)>=0.0
	return not (emitter.get("side","both")=="front" and not front or emitter.get("side","both")=="back" and front)

func _sample_action_trail(event: Dictionary, age: float, action: Dictionary, pose: Dictionary, front: bool) -> Array:
	if not effects_playing or particle_budget<1:return []
	var p: Dictionary=event.particles
	var e: Dictionary={"u":.5,"v":.5,"layerId":"","regionId":"","side":"both"}
	e.merge(p.get("emitter",{}),true)
	if not e.regionId.is_empty():
		var regions: Array=_definition.get("emissionRegions",[]).filter(func(r):return r.id==e.regionId)
		if regions.is_empty():return []
		e.merge(regions[0],true)
	if event.get("simulationSpace","bone")!="world" and (e.side=="front" and not front or e.side=="back" and front):return []
	var layer: Dictionary={}
	if not e.layerId.is_empty():
		var layers: Array=_definition.layers.filter(func(l):return l.id==e.layerId)
		if layers.is_empty() or not layers[0].get("visible",true):return []
		layer=layers[0]
	var z: float=.045+float(layer.get("spatial",{}).get("z",0)) if not layer.is_empty() else 0.0
	var registration: float=(_camera_distance()-z)/(_camera_distance()-.045) if not layer.is_empty() and _definition.get("spatial",{}).get("enabled",false) else 1.0
	var layer_scale: float=float(layer.get("scale",1))
	var base := Vector2(float(e.u)-.5,(.5-float(e.v))*1.5).rotated(-deg_to_rad(float(layer.get("rotation",0))))*layer_scale+Vector2(float(layer.get("x",0))/1024,-float(layer.get("y",0))/1024)
	var offset: float=float(p.get("z",-.08))
	z+=absf(offset) if p.get("placement","behind") in ["surface","front"] else offset
	var pixel := Vector2(base.x*1024+512,768-base.y*1024)
	var head: float=minf(age,float(event.get("emissionDuration",event.duration)))
	var tail: float=maxf(0.0,age-float(event.trail.duration))
	if head<=tail:return []
	var sections: int=mini(int(event.trail.segments),particle_budget)+1
	var fade: float=minf(.12,float(event.duration)*.2)
	var edge: float=clampf(minf(age/fade,(float(event.duration)-age)/fade),0.0,1.0)
	var samples: Array=[]
	for i in sections:
		var t: float=tail+(head-tail)*i/(sections-1)
		var bone: Dictionary=pose.bones.get(event.boneId,{})
		if _definition.get("cosmeticPreview",{}).get("motion",true):
			var seconds: float=float(event.at)*float(action.duration)+t
			var key := str(event.boneId)+":"+String.num(seconds,14)
			if not _particle_birth_cache.has(key):
				if _particle_birth_cache.size()>=512:_particle_birth_cache.erase(_particle_birth_cache.keys()[0])
				var historical: Dictionary=CharacterAnimation.pose(_character_compiled,action,clampf(seconds/float(action.duration),0.0,1.0),_definition.layers)
				_particle_birth_cache[key]=historical.bones.get(event.boneId,{})
			bone=_particle_birth_cache[key]
		if bone.is_empty():return []
		var matrix: Transform2D=bone.matrix
		var moved: Vector2=matrix*pixel
		var freshness: float=maxf(0.0,1-(age-t)/float(event.trail.duration))
		var width: float=float(p.size)*layer_scale*registration*sqrt(absf(matrix.determinant()))*(.15+.85*freshness)
		var alpha: float=float(p.opacity)*float(bone.opacity)*freshness*edge*edge*(3-2*edge)
		samples.append([(moved.x-512)/1024*registration,-(moved.y-768)/1024*registration,z,width,alpha,freshness*2-1,0])
		if event.get("simulationSpace","bone")=="world":
			var root_pose:=_sample_particle_world(float(event.at)*float(action.duration)+t,action)
			var transform: Transform3D=root_pose.transform
			var sample: Array=samples[-1]
			var center: Vector3=transform*Vector3(sample[0],sample[1],sample[2])
			sample[0]=center.x
			sample[1]=center.y
			sample[2]=center.z
			sample[3]*=sqrt(transform.basis.x.length()*transform.basis.y.length())
			sample[4]*=float(root_pose.opacity) if _world_emitter_visible(e,transform) else 0.0
			var normal:=transform.basis.z.normalized()
			var up:=transform.basis.y.normalized()
			sample.append_array([normal.x,normal.y,normal.z,up.x,up.y,up.z])
	return samples

func _setup_particles() -> void:
	_particle_node = MultiMeshInstance3D.new()
	_particle_node.name = "BehindCardParticles"
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.use_colors = true
	multi.use_custom_data = true
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	multi.mesh = quad
	multi.instance_count = 256
	multi.visible_instance_count = 0
	_particle_node.multimesh = multi
	_particle_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://addons/cardscape/card_particles.gdshader")
	mat.render_priority = -120
	_particle_node.material_override = mat
	_visual.add_child(_particle_node)

func _hash(i: int, seed: int) -> float:
	var x := sin((i+1)*127.1+seed*311.7)*43758.5453
	return x-floor(x)

## Analytic births agree with the JS sampler, including halo groups and reveal delays.
func _particle_birth(p: Dictionary, index: int, seconds: float, reveal_index: int=-1) -> float:
	var seed: int=int(p.get("seed",1))
	if reveal_index>=0:
		var reveal: Dictionary=p.get("reveal",{})
		if reveal.get("profile","burst")!="trails":return 0.0
		var late: bool=reveal_index%5==0
		return float(reveal.get("duration",.24))*minf(.8,float(reveal.get("stagger",0))*(.8+.4*_hash(reveal_index+751,seed) if late else .12*_hash(reveal_index+751,seed)))
	if p.get("trajectory","outward") in ["float","field"]:return 0.0
	var life: float=float(p.get("lifetime",3))
	var phase_seed: float=_hash(index,seed)
	var delay: float=0.0
	if p.get("trajectory","outward")=="halo":
		if p.get("visual","")=="adamantium":life*=.8+.4*_hash(index+467,seed)
		if p.get("visual","") in ["krackle","starcore"]:
			var group_size: int=3 if p.visual=="krackle" else 4
			phase_seed=_hash(floori(float(index)/group_size)+201,seed)
			delay=(index%group_size)*(.1 if group_size==3 else .07)
	return maxf(0.0,(floor(maxf(0.0,seconds)/life+phase_seed)-phase_seed+delay)*life)

func _halo_path(e: Dictionary, cut: float, radius: float) -> Dictionary:
	var hx: float = 0.0 if e.shape=="point" else float(e.width)*.5
	var hy: float = 0.0 if e.shape=="point" else float(e.height)*.75
	if e.shape in ["ellipse","point"]:
		var length: float = maxf(.001,TAU*radius) if e.shape=="point" else PI*(3*(hx+hy)-sqrt((3*hx+hy)*(hx+3*hy)))
		return {"ellipse":true,"hx":hx,"hy":hy,"length":length}
	cut=clampf(cut,0.0,minf(hx,hy))
	var points := PackedVector2Array([Vector2(-hx+cut,hy),Vector2(hx-cut,hy),Vector2(hx,hy-cut),Vector2(hx,-hy+cut),Vector2(hx-cut,-hy),Vector2(-hx+cut,-hy),Vector2(-hx,-hy+cut),Vector2(-hx,hy-cut)] if cut>0 else [Vector2(-hx,hy),Vector2(hx,hy),Vector2(hx,-hy),Vector2(-hx,-hy)])
	var segments: Array = []
	var length := 0.0
	for i in points.size():
		var delta := points[(i+1)%points.size()]-points[i]
		var size := delta.length()
		if size>0:
			segments.append({"origin":points[i],"delta":delta,"size":size,"start":length})
			length+=size
	return {"segments":segments,"length":length}

func _halo_point(path: Dictionary, at: float) -> Vector4:
	var position := fposmod(at,1.0)
	if path.get("ellipse",false):
		var a := position*TAU
		var normal := Vector2(cos(a)/float(path.hx) if path.hx>0 else cos(a),sin(a)/float(path.hy) if path.hy>0 else sin(a)).normalized()
		return Vector4(cos(a)*float(path.hx),sin(a)*float(path.hy),normal.x,normal.y)
	var distance: float = position*float(path.length)
	var seg: Dictionary = path.segments[-1]
	for part in path.segments:
		if distance<float(part.start)+float(part.size):
			seg=part
			break
	var p: Vector2 = seg.origin+seg.delta*((distance-float(seg.start))/float(seg.size))
	var normal := Vector2(-float(seg.delta.y),float(seg.delta.x))/float(seg.size)
	return Vector4(p.x,p.y,normal.x,normal.y)

func _field_point(e: Dictionary, p: Dictionary, i: int, seed: int) -> Vector3:
	var radius := float(p.get("radius",.06))
	var hx := (0.0 if e.shape=="point" else float(e.width)*.5)+radius
	var hy := (0.0 if e.shape=="point" else float(e.height)*.75)+radius
	var angle := (0.0 if e.direction=="up" else float(e.get("angle",0)))*PI/180.0+(_hash(i+13,seed)-.5)*minf(1.0,float(p.get("spread",.5)))*PI
	var speed := float(p.get("speed",.25))*(.5+.5*_hash(i+97,seed))
	var u := fposmod(_hash(i+17,seed)+_clock*speed*sin(angle)/maxf(.001,2*hx),1.0)
	var v := fposmod(_hash(i+29,seed)+_clock*speed*cos(angle)/maxf(.001,2*hy),1.0)
	var pos: Vector2
	var alpha: float
	if e.shape in ["ellipse","point"]:
		pos=Vector2(cos(u*TAU)*sqrt(v)*hx,sin(u*TAU)*sqrt(v)*hy)
		alpha=smoothstep(0.0,.08,v)*(1-smoothstep(.88,1.0,v))
	else:
		pos=Vector2((u-.5)*2*hx,(v-.5)*2*hy)
		alpha=smoothstep(0.0,.06,u)*(1-smoothstep(.94,1.0,u))*smoothstep(0.0,.06,v)*(1-smoothstep(.94,1.0,v))
	pos+=Vector2(float(e.u)-.5,(.5-float(e.v))*1.5)
	return Vector3(pos.x,pos.y,alpha)

func _update_particles(root_alpha: float, front: bool) -> void:
	if not _detail_effects.particles:
		_particle_count=0
		if _particle_node:_particle_node.multimesh.visible_instance_count=0
		if _particle_front_node:_particle_front_node.visible=false
		return
	if not _particle_node:
		return
	var p := _particle_config()
	var reveal: Dictionary = {"enabled":false,"duration":.24,"count":44,"size":.025,"travel":.18,"stretch":8.0,"visual":"streak","only":false,"profile":"burst","stagger":0.0}
	reveal.merge(p.get("reveal",{}),true)
	var reveal_age := _clock-_particle_reveal_started
	var reveal_active: bool = reveal.enabled and reveal_age>=0.0 and reveal_age<float(reveal.duration)
	var idle_requested := clampi(int(p.get("count",64)),1,256)
	var budget := clampi(particle_budget,0,256)
	var idle_count := 0 if reveal.enabled and reveal.only else mini(idle_requested,floori(budget*float(idle_requested)/(idle_requested+int(reveal.count))) if reveal_active else budget)
	var burst_count := mini(int(reveal.count),budget-idle_count) if reveal_active else 0
	_particle_count = idle_count+burst_count if effects_playing and p.get("enabled",false) else 0
	_particle_reveal_count = 0
	var e: Dictionary = {"shape":"perimeter","u":.5,"v":.5,"width":1.0,"height":1.0,"direction":"outward","target":"card","side":"both","regionId":"","layerId":""}
	e.merge(p.get("emitter",{}),true)
	var src: Dictionary = _definition
	var target: String = e.get("target","card")
	if target=="back" and _definition.get("assetKind","")!="back":
		src=_definition.get("backScene",{}).get("document",_definition.get("backScene",{}))
	elif target=="frame":
		src=_definition.get("componentScenes",{}).get("frame",{}).get("document",_definition)
	if not e.get("regionId","").is_empty():
		var found := false
		for region in src.get("emissionRegions",[]):
			if region.id==e.regionId:
				e.merge(region,true)
				found=true
				break
		if not found:
			_particle_count=0
	if not _particle_world_sampling and (e.side=="front" and not front or e.side=="back" and front):
		_particle_count=0
	var source_layer: Dictionary = {}
	if not e.layerId.is_empty():
		for layer in src.get("layers",[]):
			if layer.id==e.layerId:
				source_layer=layer
				break
		if source_layer.is_empty() or not source_layer.get("visible",true):
			_particle_count=0
	var mat := _particle_node.material_override as ShaderMaterial
	var foreground: bool = p.get("placement","behind") in ["front","surface"]
	var blend_mode := str(p.get("blend","add"))
	var blend_key := blend_mode+str(foreground)
	# Card art uses painter ordering and does not write depth. Draw from the
	# far source first, including a back emitter configured as surface/front.
	var reverse_source: bool = target=="back" and _definition.get("assetKind","")!="back"
	var near_source: bool = not front if reverse_source else front if foreground else not front
	mat.render_priority=120 if near_source else -120
	if mat.get_meta("blend_key","")!=blend_key:
		var code := preload("res://addons/cardscape/card_particles.gdshader").code
		var next_shader := Shader.new()
		next_shader.code=code.replace("blend_mix","blend_mix" if blend_mode=="normal" else "blend_add")
		mat.shader=next_shader
		mat.set_meta("blend_key",blend_key)
	mat.set_shader_parameter("rainbow",1.0 if p.get("palette","solid")=="rainbow" else 0.0)
	mat.set_shader_parameter("visual",["dust","glimmer","krackle","streak","ember","snow","confetti","diamond","bubble","sprite","orb","mixed","tech","banana","pixel","heart","leaf","tone","shard","cosmic","wakanda","flower","paw","pizza","starcore","adamantium"].find(p.get("visual","dust")))
	mat.set_shader_parameter("sprite_tint",p.get("spriteTint",false))
	mat.set_shader_parameter("particle_time",_clock)
	mat.set_shader_parameter("particle_speed",float(p.get("speed",.25)))
	if p.get("visual","dust")=="sprite":
		var sprite=_texture(str(p.get("sprite","")))
		if sprite:mat.set_shader_parameter("sprite_tex",sprite)
		else:_particle_count=0
	var split_cosmic: bool = p.get("visual","")=="cosmic" and not foreground
	mat.set_shader_parameter("cosmic_pass",-1.0 if split_cosmic else 0.0)
	if split_cosmic and not _particle_front_node:
		_particle_front_node=MultiMeshInstance3D.new()
		_particle_front_node.name="CosmicFrontComets"
		_particle_front_node.multimesh=_particle_node.multimesh
		_particle_front_node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var front_mat := ShaderMaterial.new()
		front_mat.render_priority=120
		_particle_front_node.material_override=front_mat
		_visual.add_child(_particle_front_node)
	if _particle_front_node:
		_particle_front_node.visible=split_cosmic and _particle_count>0
		if split_cosmic:
			var front_mat := _particle_front_node.material_override as ShaderMaterial
			if front_mat.get_meta("blend_key","")!=blend_key:
				var front_shader := Shader.new()
				front_shader.code=mat.shader.code
				front_mat.shader=front_shader
				front_mat.set_meta("blend_key",blend_key)
			for param in ["visual","rainbow","particle_time"]:
				front_mat.set_shader_parameter(param,mat.get_shader_parameter(param))
			front_mat.render_priority=120 if (not front if reverse_source else front) else -120
			front_mat.set_shader_parameter("cosmic_pass",1.0)
			front_mat.set_shader_parameter("layer_offset_z",(-.2 if target=="back" and _definition.get("assetKind","")!="back" else .2)*_visual.global_basis.get_scale().z)
	_particle_node.multimesh.visible_instance_count = _particle_count
	var halo: bool = p.get("trajectory","outward")=="halo"
	var radius: float = float(p.get("radius",.06))
	var cut := float(src.get("frameStyle",{}).get("corner",48))/1024.0 if target in ["card","frame"] and e.shape=="perimeter" and e.width==1.0 and e.height==1.0 and e.u==.5 and e.v==.5 else 0.0
	var path := _halo_path(e,cut,radius) if halo else {}
	for i in _particle_count:
		if _particle_sample_births:_particle_births[i]=_particle_birth(p,i,_clock,i-idle_count if i>=idle_count else -1)
		var seed := int(p.get("seed",1))
		var r := _hash(i,seed)
		var life := maxf(.3,float(p.get("lifetime",3)))
		if halo and p.get("visual","")=="adamantium":life*=.8+.4*_hash(i+467,seed)
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
		if e.shape=="point":
			origin=Vector2.ZERO
			direction=Vector2.from_angle(_hash(i+61,seed)*TAU)
		elif e.shape=="rect":
			origin=Vector2(_hash(i+17,seed)-.5,(_hash(i+29,seed)-.5)*1.5)
			direction=origin
		elif e.shape=="ellipse":
			direction=Vector2.from_angle(_hash(i+61,seed)*TAU)
			origin=direction*Vector2(.5,.75)*sqrt(_hash(i+29,seed))
		origin=origin*Vector2(float(e.width),float(e.height))+Vector2(float(e.u)-.5,(.5-float(e.v))*1.5)
		if target=="frame" and e.shape=="perimeter" and e.width==1.0 and e.height==1.0:
			var legacy_cut: float = float(src.get("frameStyle",{}).get("corner",48))/1024.0
			var excess := maxf(0.0,absf(origin.x)+absf(origin.y)-(1.25-legacy_cut))
			origin-=Vector2(signf(origin.x),signf(origin.y))*excess*.5
		if e.direction!="outward":
			var a: float = (0.0 if e.direction=="up" else float(e.get("angle",0)))*PI/180.0+(_hash(i+13,seed)-.5)*float(p.get("spread",.5))*PI
			direction=Vector2(sin(a),cos(a))
		var pos := origin+direction.normalized()*phase*(float(p.get("spread",.5))+float(p.get("speed",.25))*life)
		var size_factor := (.5+.5*r)*(1-.55*phase)
		var alpha := pow(sin(PI*phase),2)
		if halo and p.get("visual","")!="krackle":
			var travel: float = _clock*float(p.get("speed",.25))*(.35+.65*_hash(i+97,seed))*(1 if _hash(i+113,seed)>.5 else -1)/float(path.length)
			var cluster := _hash(i+379,seed)
			var point := _halo_point(path,cluster+travel)
			var wave := .5+.5*sin(TAU*(phase+r))
			var amplitude := minf(1.0,float(p.get("spread",.5)))
			var offset := radius*(.2+.8*((1-amplitude)*.5+amplitude*wave))
			pos=Vector2(point.x+float(e.u)-.5,point.y+(.5-float(e.v))*1.5)+Vector2(point.z,point.w)*offset
			direction=Vector2(point.w,-point.z)
			size_factor=(.6+.4*r)*(.96+.04*sin(TAU*phase))
			if p.get("visual","")=="mixed" and r>.82:size_factor*=2.5
			if p.get("visual","")=="orb":size_factor*=.45+.55*r
			alpha=smoothstep(0.0,.18,phase)*(1-smoothstep(.65,1.0,phase))

		if p.get("trajectory","")=="float":
			var a: float = (0.0 if e.direction=="up" else float(e.get("angle",0)))*PI/180.0
			var u := fposmod(_hash(i+17,seed)+_clock*float(p.get("speed",.25))*sin(a)+float(p.get("spread",.5))*.06*sin(_clock*.7+r*6.283),1.0)
			var v := fposmod(_hash(i+29,seed)+_clock*float(p.get("speed",.25))*cos(a),1.0)
			pos=Vector2((u-.5)*float(e.width)+float(e.u)-.5,(v-.5)*float(e.height)*1.5+(.5-float(e.v))*1.5)
			if e.shape=="ellipse":pos=Vector2(cos(u*TAU)*sqrt(v)*float(e.width)*.5+float(e.u)-.5,sin(u*TAU)*sqrt(v)*float(e.height)*.75+(.5-float(e.v))*1.5)
			if e.shape=="point":pos=Vector2(float(e.u)-.5+sin(_clock*.7+r*6.283)*radius,(.5-float(e.v))*1.5+cos(_clock*.5+r*6.283)*radius)
			size_factor=.45+.55*r
			alpha=smoothstep(0.0,.15,phase)*(1-smoothstep(.7,1.0,phase))*smoothstep(0.0,.08,v)*(1-smoothstep(.92,1.0,v))
		if p.get("trajectory","")=="field":
			var point := _field_point(e,p,i,seed)
			pos=Vector2(point.x,point.y)
			size_factor=.45+.55*r
			alpha=smoothstep(0.0,.15,phase)*(1-smoothstep(.7,1.0,phase))*point.z
		if p.get("visual","")=="bubble" and halo:
			var cycle := floori(_clock/life+r)
			var age := phase*life
			var point := _halo_point(path,_hash(i+379+cycle*137,seed))
			var offset := radius*(.1+.25*_hash(i+53,seed))
			var a: float = (0.0 if e.direction=="up" else float(e.get("angle",0)))*PI/180.0
			direction=Vector2(point.z,point.w) if e.direction=="outward" else Vector2(sin(a),cos(a))
			var travel: float = age*float(p.get("speed",.25))*(.8+.4*_hash(i+97,seed))
			var sideways: float = travel*point.z*.35*minf(1.0,float(p.get("spread",.5)))+sin(age*2.4+r*6.283)*radius*.10*minf(1.0,float(p.get("speed",.25))*8)
			pos=Vector2(point.x+float(e.u)-.5+point.z*offset+direction.x*travel+direction.y*sideways,point.y+(.5-float(e.v))*1.5+point.w*offset+direction.y*travel-direction.x*sideways)
			size_factor=.55+.90*_hash(i+443,seed)
			var fringe := maxf(0.0,maxf(absf(pos.x-float(e.u)+.5)-float(e.width)*.5,absf(pos.y-(.5-float(e.v))*1.5)-float(e.height)*.75))
			alpha=smoothstep(0.0,.10,phase)*(1-smoothstep(.65,1.0,phase))*(1-smoothstep(0.0,maxf(.001,radius*2),fringe-radius*3.5))
		if p.get("visual","")=="banana" and halo:
			var cycle := floori(_clock/life+r)
			var age := phase*life
			var point := _halo_point(path,_hash(i+379+cycle*137,seed))
			var a: float = (0.0 if e.direction=="up" else float(e.get("angle",0)))*PI/180.0
			direction=Vector2(point.z,point.w) if e.direction=="outward" else Vector2(sin(a),cos(a))
			var offset := radius*(.12+.20*_hash(i+53,seed))
			var travel: float = age*float(p.get("speed",.25))*(.65+.75*_hash(i+97,seed))
			var sideways: float = sin(age*2+r*6.283)*radius*.14*minf(1.0,float(p.get("spread",.5)))*minf(1.0,float(p.get("speed",.25))*8)
			pos=Vector2(point.x+float(e.u)-.5+point.z*offset+direction.x*travel+direction.y*sideways,point.y+(.5-float(e.v))*1.5+point.w*offset+direction.y*travel-direction.x*sideways)
			size_factor=(.75+1.5*_hash(i+443,seed))*(.3+.7*smoothstep(0.0,.20,phase))
			var fringe := maxf(0.0,maxf(absf(pos.x-float(e.u)+.5)-float(e.width)*.5,absf(pos.y-(.5-float(e.v))*1.5)-float(e.height)*.75))
			alpha=smoothstep(0.0,.10,phase)*(1-smoothstep(.55,1.0,phase))*(1-smoothstep(0.0,maxf(.001,radius*2),fringe-radius*3.5))
		if p.get("visual","")=="diamond" and halo:
			var cycle := floori(_clock/life+r)
			var age := phase*life
			var point := _halo_point(path,_hash(i+379+cycle*137,seed))
			var a: float = (0.0 if e.direction=="up" else float(e.get("angle",0)))*PI/180.0
			direction=Vector2(point.z,point.w) if e.direction=="outward" else Vector2(sin(a),cos(a))
			var travel: float = age*float(p.get("speed",.25))*(.65+.75*_hash(i+97,seed))
			var offset := radius*(.08+.20*_hash(i+53,seed))
			pos=Vector2(point.x+float(e.u)-.5+point.z*offset+direction.x*travel,point.y+(.5-float(e.v))*1.5+point.w*offset+direction.y*travel)
			size_factor=(.18+.25*_hash(i+443,seed) if i%4==0 else .45+1.10*_hash(i+443,seed))*(.45+.55*smoothstep(0.0,.18,phase))
			var fringe := maxf(0.0,maxf(absf(pos.x-float(e.u)+.5)-float(e.width)*.5,absf(pos.y-(.5-float(e.v))*1.5)-float(e.height)*.75))
			alpha=smoothstep(0.0,.08,phase)*(1-smoothstep(.55,1.0,phase))*(1-smoothstep(0.0,maxf(.001,radius*1.5),fringe-radius*2))
		if p.get("visual","")=="krackle" and halo:
			var group := floori(float(i)/3.0)
			var birth := _clock/life+_hash(group+201,seed)
			var cycle := floori(birth)
			var age := birth-cycle
			var delay := float(i%3)*.10
			var local := maxf(0.0,(age-delay)/(1-delay))
			var point := _halo_point(path,_hash(group+379+cycle*137,seed))
			direction=Vector2(point.w,-point.z)
			var offset := radius*(.15+.72*_hash(i+53,seed))
			var spacing := float(i%3-1)*minf(.022,radius*.32)
			var drift := (local-.5)*minf(radius*.20,float(p.get("speed",.25))*life*.20)
			pos=Vector2(point.x+float(e.u)-.5+point.z*offset+point.w*(spacing+drift),point.y+(.5-float(e.v))*1.5+point.w*offset-point.z*(spacing+drift))
			size_factor=(.20+1.05*pow(r,1.4))*(.20+.80*smoothstep(0.0,.35,local))*(1-.55*smoothstep(.45,1.0,local))
			alpha=smoothstep(0.0,.10,local)*(1-smoothstep(.60,1.0,local))
		if p.get("visual","")=="starcore" and halo:
			var group := floori(float(i)/4.0)
			var slot := i%4
			var birth := _clock/life+_hash(group+201,seed)
			var cycle := floori(birth)
			var age := birth-cycle
			var local := maxf(0.0,(age-slot*.07)/(1-slot*.07))
			var point := _halo_point(path,_hash(group+379+cycle*137,seed))
			var offset := radius*(.25+.45*_hash(group+53,seed))
			var orbit := local*1.1+slot*1.9
			var sideways := cos(orbit)*radius*.28
			var normal := sin(orbit)*radius*.20
			pos=Vector2(point.x+float(e.u)-.5+point.z*(offset+normal)+point.w*sideways,point.y+(.5-float(e.v))*1.5+point.w*(offset+normal)-point.z*sideways)
			direction=Vector2(point.w,-point.z)
			size_factor=(.55+.40*r if r<.65 else .09+.15*r)*(.65+.35*smoothstep(0.0,.3,local))
			alpha=smoothstep(0.0,.14,local)*(1-smoothstep(.54,1.0,local))
		if p.get("visual","")=="cosmic" and halo:
			if r>.78:
				var point := _halo_point(path,_hash(i+379,seed))
				var a: float = -.55+(_hash(i+53,seed)-.5)*.45 if e.direction=="outward" else PI/2.0 if e.direction=="up" else PI/2.0-float(e.angle)*PI/180.0
				direction=Vector2.from_angle(a)
				var travel := (phase-.5)*minf(radius*1.2,float(p.get("speed",.25))*life)
				pos=Vector2(point.x+float(e.u)-.5,point.y+(.5-float(e.v))*1.5)+Vector2(point.z,point.w)*radius*.35+direction*travel
				size_factor=.09+.05*r
				alpha=smoothstep(0.0,.12,phase)*(1-smoothstep(.65,1.0,phase))
			else:
				size_factor=.75+.5*r
				alpha=(.45+.55*smoothstep(0.0,.15,phase)*(1-smoothstep(.8,1.0,phase)))*(.75+.25*sin(_clock*.4+r*6.283))
		if p.get("visual","")=="cosmic":size_factor=.09+.05*r if r>.78 else .75+.5*r
		if p.get("visual","")=="wakanda":
			if halo:
				var point := _halo_point(path,_hash(i+379,seed))
				var drift := (phase-.5)*minf(radius*.9,float(p.get("speed",.25))*life)
				pos=Vector2(point.x+float(e.u)-.5,point.y+(.5-float(e.v))*1.5)+Vector2(point.z,point.w)*radius*(.2+.65*_hash(i+53,seed))+Vector2(0.0,drift)
			size_factor=.55+.55*r if r<.58 else .18+.10*r if r<.82 else .30+.10*r
			alpha=(.8 if r<.58 else .6 if r<.82 else 1.0)*smoothstep(0.0,.12,phase)*(1-smoothstep(.65,1.0,phase))
		if p.get("visual","") in ["flower","paw","pizza","adamantium"] and halo:
			var cycle := floori(_clock/life+r)
			var point := _halo_point(path,_hash(i+379+cycle*137,seed))
			var offset := radius*(.25+.75*_hash(i+53,seed))-minf(float(e.width),float(e.height))*.18*minf(1.0,float(p.get("spread",.5)))*_hash(i+71,seed)
			var drift := (phase-.5)*minf(radius*.6,float(p.get("speed",.25))*life)
			pos=Vector2(point.x+float(e.u)-.5,point.y+(.5-float(e.v))*1.5)+Vector2(point.z,point.w)*offset+Vector2(point.w,-point.z)*drift
			size_factor=(.25+pow(r,1.5))*(.35+.65*sin(PI*phase))
			alpha=smoothstep(0.0,.12,phase)*(1-smoothstep(.65,1.0,phase))
			if p.get("visual","")=="adamantium":
				var inset := (.15+.40*_hash(i+71,seed))*minf(1.0,float(p.get("spread",.5)))
				var distance := maxf(.000001,Vector2(point.x,point.y).length())
				# Same calibrated slow population and faster tail as the editor.
				var speed_seed := _hash(i+53,seed)
				var travel := minf(distance*inset+radius*.9,phase*float(p.get("speed",.25))*life*(.47+.95*speed_seed*speed_seed))
				var radial_scale := 1.0-inset+travel/distance
				pos=Vector2(point.x,point.y)*radial_scale+Vector2(float(e.u)-.5,(.5-float(e.v))*1.5)
				var size_seed := _hash(i+443,seed)
				var large := i%5<2
				var growth_span := 1.03-.27*size_seed if large else .85
				var growth_phase := minf(1.0,phase*life/(float(p.get("lifetime",3))*.8)/growth_span)
				var growth_ease := growth_phase*(2-growth_phase)
				size_factor=1.02*(.38+(.20+.77*pow(size_seed,1.58))*growth_ease) if large else (.045+.07*size_seed)*(.36+.46*growth_ease)
				alpha=smoothstep(0.0,.08,phase)*(1-smoothstep(.50,1.0,phase))
		if p.get("visual","")=="shard":size_factor=1.1+.25*(r-.84)/.16 if r>.84 else .38+.62*r
		var base_size: float = float(p.get("size",.012))
		var stretch: float = float(p.get("stretch",1))
		var shape_override := 0.0
		if i>=idle_count:
			var burst_index := i-idle_count
			r=_hash(burst_index+701,seed)
			var a := (burst_index+_hash(burst_index+719,seed)*.6)/burst_count*TAU
			var radial := .15+.75*_hash(burst_index+733,seed)
			var progress := reveal_age/float(reveal.duration)
			var trails: bool = reveal.profile=="trails"
			var late: bool = trails and burst_index%5==0
			var delay: float = float(reveal.duration)*minf(.8,float(reveal.stagger)*(.8+.4*_hash(burst_index+751,seed) if late else .12*_hash(burst_index+751,seed))) if trails else 0.0
			var age := reveal_age-delay
			var local := maxf(0.0,age)/(float(reveal.duration)-delay) if trails else progress
			var velocity: float = (.38+.10*_hash(burst_index+769,seed) if late else .84+.26*_hash(burst_index+769,seed)) if trails else 1.0
			var travel := float(reveal.travel)*(maxf(0.0,age)/float(reveal.duration) if trails else progress)*velocity
			direction=Vector2.from_angle(a)
			if late:radial=.75+.2*_hash(burst_index+733,seed)
			var radius_x := float(e.width)*.5*radial
			var radius_y := float(e.height)*.75*radial
			if late:
				var hx := float(e.width)*.5
				var hy := float(e.height)*.75
				var distance := 0.0 if e.shape=="point" else 1.0/Vector2(direction.x/hx,direction.y/hy).length() if e.shape=="ellipse" else minf(hx/maxf(.001,absf(direction.x)),hy/maxf(.001,absf(direction.y)))
				radius_x=distance*radial
				radius_y=radius_x
			pos=Vector2(float(e.u)-.5,(.5-float(e.v))*1.5)+direction*Vector2(radius_x+travel,radius_y+travel)
			size_factor=(.65+.35*r)*(1-.65*local)*(.38+.16*r if late else 1.0)
			alpha=0.0 if age<0.0 else (.7+.3*r)*(1-smoothstep(0.0,1.0,local))
			base_size=float(reveal.size)
			stretch=float(reveal.stretch)
			shape_override=(float(mat.get_shader_parameter("visual"))+1.0)/32.0 if reveal.visual=="source" else 4.0/32.0 # Encoded shape survives Compatibility custom-color quantization.
			_particle_reveal_count+=1
		var z: float = .045 if target in ["back","frame"] else 0.0
		var registration := 1.0
		if not source_layer.is_empty():
			z=.045+float(source_layer.get("spatial",{}).get("z",0.0))
			registration=(_camera_distance()-z)/(_camera_distance()-.045) if src.get("spatial",{}).get("enabled",false) else 1.0
			pos=pos.rotated(-deg_to_rad(float(source_layer.get("rotation",0))))*float(source_layer.get("scale",1))+Vector2(float(source_layer.get("x",0))/1024.0,-float(source_layer.get("y",0))/1024.0)
			pos*=registration
		var offset := float(p.get("z",-.08))
		if p.get("placement","behind") in ["front","surface"]:offset=absf(offset)
		if target=="back" and _definition.get("assetKind","")!="back":
			pos.x=-pos.x
			z=.045-float(_definition.frameStyle.depth)/1024.0-z-absf(offset)
		else:
			z+=offset
		var size := base_size*size_factor*2
		# Billboard rotation is applied by the shader. Scaling a rotated basis here
		# changed the measured width with its angle and distorted elongated flares.
		_particle_node.multimesh.set_instance_transform(i,Transform3D(Basis.from_scale(Vector3(size*stretch,size,size)*registration),Vector3(pos.x,pos.y,z)))
		var sprite_angle := direction.angle() if i>=idle_count else 0.0 if p.get("visual","")=="bubble" else sin(_clock*.45+r*6.283)*.22 if p.get("visual","")=="adamantium" else r*6.283+_clock*.10 if p.get("visual","")=="flower" else sin(_clock*.7+r*6.283)*.25 if p.get("visual","")=="paw" else r*6.283+_clock*(.16+.10*_hash(i+53,seed)) if p.get("visual","")=="pizza" else ((PI/3.0 if _hash(i+71,seed)>.5 else -PI/3.0) if r>=.58 and r<.82 else 0.0) if p.get("visual","")=="wakanda" else r*6.283+_clock*(.25+.35*_hash(i+53,seed)) if p.get("visual","")=="shard" else PI/2.0+.12 if p.get("visual","")=="tone" else 0.0 if p.get("visual","")=="pixel" else sin(_clock*.6+r*6.283)*.35 if p.get("visual","")=="heart" else r*6.283+_clock*.35+sin(_clock*1.2+r*6.283)*.4 if p.get("visual","")=="leaf" else r*TAU+phase*life*(.25+3*_hash(i+71,seed))*(1 if _hash(i+113,seed)>.5 else -1)*minf(1.0,float(p.get("speed",.25))*8) if p.get("visual","")=="banana" else r*TAU+sin(_clock*.3+r*TAU)*.12 if p.get("visual","")=="tech" else direction.angle()
		if p.get("visual","") in ["shard","flower","pizza"] and i<idle_count:sprite_angle=fposmod(sprite_angle+PI,TAU)-PI
		_particle_node.multimesh.set_instance_custom_data(i,Color(r,sprite_angle,shape_override,0))
		var color := Color("#ffcb79" if p.get("palette","solid")=="gold" else p.get("color","#ffcb79"))
		color.a = alpha*float(p.get("opacity",1.0))*root_alpha
		if _particle_color_sampling:_particle_world_alphas[i]=color.a
		_particle_node.multimesh.set_instance_color(i,color)

func diagnostics() -> Dictionary:
	var components: Dictionary = {}
	var particle_total := _particle_count+_particle_event_count
	for kind in _component_nodes:
		var child: CardscapeCard = _component_nodes[kind]
		components[kind] = {"visible":child.visible,"surfaces":child._surfaces.size(),"particles":child._particle_count,"shader_key":child._definition.get("shader_key","")}
		particle_total += child._particle_count+child._particle_event_count
	return {"card_id":card_id,"locale":locale,"surfaces":_surfaces.size(),"particles":particle_total,"components":components,"frame_planar":true,"action":_action.get("id",""),"action_seconds":_action_time,"overrides":component_overrides.duplicate(true)}

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
