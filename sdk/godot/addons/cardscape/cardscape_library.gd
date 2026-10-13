@tool
class_name CardscapeLibrary
extends Resource
## Imported catalog uses Resource references so textures survive PCK export.
@export_multiline var data_json: String = "{}"
@export var textures: Dictionary = {}
@export var shaders: Dictionary = {}
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
	return textures.get(key) as Texture2D
