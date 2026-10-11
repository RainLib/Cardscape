@tool
class_name CardscapeLibrary
extends Resource
## Imported catalog uses Resource references so textures survive PCK export.
@export_multiline var data_json: String = "{}"
@export var textures: Dictionary = {}
@export var shaders: Dictionary = {}
var _cache: Dictionary = {}
var _source: String = ""

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
