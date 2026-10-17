@tool
class_name CardscapeLibrary
extends Resource
## Imported catalog uses Resource references so textures survive PCK export.
@export_multiline var data_json: String = "{}"
@export var textures: Dictionary = {}
@export var shaders: Dictionary = {}
@export var texture_paths: Dictionary = {}
var _texture_requests: Dictionary = {}
var _prepared_textures: Dictionary = {}
var _texture_consumers: Dictionary = {}
var _cache: Dictionary = {}
var _source: String = ""
var _surface_shader_cache: Dictionary = {}

## Uniforms stay on each ShaderMaterial; identical render-mode variants share
## their immutable Shader so a layered card compiles each program only once.
func surface_shader(key: String, painter_order: bool, additive: bool) -> Shader:
	var base := shaders.get(key) as Shader
	if not base or (not painter_order and not additive):
		return base
	var variant_key := key+":"+str(painter_order)+":"+str(additive)
	var cached: Dictionary = _surface_shader_cache.get(variant_key,{})
	if cached.get("source","")==base.code and cached.has("shader"):
		return cached.shader as Shader
	var variant := Shader.new()
	var code := base.code
	if painter_order:
		code=code.replace("depth_draw_never,","depth_draw_never, depth_test_disabled,")
	if additive:
		code=code.replace("render_mode unshaded,","render_mode unshaded, blend_add,")
	variant.code=code
	_surface_shader_cache[variant_key]={"source":base.code,"shader":variant}
	return variant

func catalog() -> Dictionary:
	if _source != data_json:
		var decoded = JSON.parse_string(data_json)
		_cache = decoded if decoded is Dictionary else {}
		_source = data_json
	return _cache

func card(id: String) -> Dictionary:
	for entry in catalog().get("cards", []):
		if entry.id == id:
			return entry.duplicate(true)
	return {}

func component(kind: String, id: String, version: int = 0) -> Dictionary:
	for entry in catalog().get("components", []):
		if entry.kind != kind or entry.id != id:
			continue
		for variant in entry.versions:
			if variant.version == version or (version == 0 and variant == entry.versions.back()):
				return variant.value.duplicate(true)
	return {}

func texture(key: String) -> Texture2D:
	if textures.has(key):return textures[key] as Texture2D
	if _prepared_textures.has(key):return _prepared_textures[key] as Texture2D
	var file: String=texture_paths.get(key,"")
	return load(file) as Texture2D if not file.is_empty() else null

## Keep the old detail tier until a complete batch is decoded. Texture paths
## stay lazy; switching one card never rebuilds another instance or its clock.
func prepare_textures(keys: Array, owner: int = 0) -> bool:
	_texture_consumers[owner]=keys.duplicate()
	_collect_texture_requests()
	var ready := true
	for key in keys:
		if textures.has(key) or _prepared_textures.has(key):continue
		var file: String=texture_paths.get(key,"")
		if file.is_empty():continue
		if not _texture_requests.has(key) and ResourceLoader.has_cached(file):
			_prepared_textures[key]=load(file)
			continue
		if not _texture_requests.has(key):
			ResourceLoader.load_threaded_request(file,"Texture2D")
			_texture_requests[key]=file
		ready=false
	return ready

func _collect_texture_requests(wait: bool = false) -> void:
	var wanted: Dictionary={}
	for keys in _texture_consumers.values():
		for key in keys:wanted[key]=true
	for key in _texture_requests.keys():
		var file: String=_texture_requests[key]
		var state := ResourceLoader.load_threaded_get_status(file)
		if state==ResourceLoader.THREAD_LOAD_LOADED or (wait and state==ResourceLoader.THREAD_LOAD_IN_PROGRESS):
			var result := ResourceLoader.load_threaded_get(file)
			if wanted.has(key):_prepared_textures[key]=result
			_texture_requests.erase(key)
		elif state in [ResourceLoader.THREAD_LOAD_FAILED,ResourceLoader.THREAD_LOAD_INVALID_RESOURCE]:
			_texture_requests.erase(key)
	for key in _prepared_textures.keys():
		if not wanted.has(key):_prepared_textures.erase(key)

func release_prepared(_keys: Array, owner: int = 0, wait: bool = false) -> void:
	_texture_consumers.erase(owner)
	_collect_texture_requests(wait and _texture_consumers.is_empty())
