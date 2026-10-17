class_name CardscapeRemote
extends Node
## APK contains this SDK; OSS contains only immutable data and image objects.
signal progress(stage: String, downloaded_bytes: int, cache_hits: int)
signal failed(message: String)
signal object_finished(id: String)

var cache_directory: String = "user://cardscape-remote-v1"
var max_cache_bytes: int = 256*1024*1024
var timeout_seconds: float = 20.0
var retries: int = 2
var request_headers: PackedStringArray = []
## Optional business-owned signed URL resolver; no OSS credentials in the SDK.
var url_resolver: Callable
var catalog: Dictionary = {}
var stats: Dictionary = {"requests":0,"downloaded_bytes":0,"cache_hits":0,"retries":0,"offline":false}
var last_error: String = ""
var _sources: Dictionary = {}
var _objects_in_flight: Dictionary = {}
var _texture_objects: Dictionary = {}
var _weak_textures: Dictionary = {}
var _prepared_textures: Dictionary = {}
var _texture_jobs: Dictionary = {}
var _texture_consumers: Dictionary = {}
var _http_active: int = 0
var _cache_bytes: int = -1
var _texture_retry_after: Dictionary = {}
var _closed: bool = false
var _opening: int = 0
const MAX_OBJECT_BYTES: int = 64*1024*1024

func _hash(bytes: PackedByteArray) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(bytes)
	return context.finish().hex_encode()

func _emit(stage: String) -> void:
	if not _closed:progress.emit(stage,int(stats.downloaded_bytes),int(stats.cache_hits))

func _fail(message: String) -> void:
	if _closed:return
	last_error=message
	failed.emit(message)

func _valid_id(id: String) -> bool:
	if id.length()!=64:return false
	for c in id:
		if not c in "0123456789abcdef":return false
	return true

func _validate(index: Variant) -> bool:
	if not index is Dictionary or index.get("schema","")!="cardscape-remote/1" or index.get("runtimeVersion",0)!=1 or not _valid_id(str(index.get("release",""))):return false
	if not index.get("cards") is Array or not index.get("objects") is Dictionary:return false
	for id in index.objects:
		var o: Dictionary=index.objects[id]
		var extension: String=str(o.get("path","")).get_extension()
		if not _valid_id(id) or not extension in ["gz","json","webp","png","bin"] or o.get("path","")!="objects/"+id+"."+extension:return false
		if not o.get("compression","") in ["gzip","identity"] or int(o.get("bytes",0))<=0 or int(o.bytes)>MAX_OBJECT_BYTES or int(o.get("downloadBytes",0))<=0 or int(o.downloadBytes)>MAX_OBJECT_BYTES:return false
	for card in index.cards:
		for engine in ["webgl","godot"]:
			var record: Dictionary=card.get(engine,{})
			if not index.objects.has(record.get("definition","")) or not record.get("base") is Array or not record.get("detail") is Array:return false
			for id in record.base+record.detail:
				if not index.objects.has(id):return false
	return true

func _cache_file(id: String) -> String:
	return cache_directory.path_join(id+".bin")

func _is_cache_file(name: String) -> bool:
	var file := name.trim_suffix(".tmp")
	return (file.ends_with(".bin") and _valid_id(file.trim_suffix(".bin"))) or (file.begins_with("index-") and file.ends_with(".json") and _valid_id(file.trim_prefix("index-").trim_suffix(".json")))

func _write(file: String, bytes: PackedByteArray) -> void:
	DirAccess.make_dir_recursive_absolute(cache_directory)
	var temporary := file+".tmp"
	var handle := FileAccess.open(temporary,FileAccess.WRITE)
	if not handle:return
	handle.store_buffer(bytes)
	handle.close()
	DirAccess.rename_absolute(temporary,file)

func _prune_cache(added_bytes: int) -> void:
	if _cache_bytes>=0:
		_cache_bytes+=added_bytes
		if _cache_bytes<=max_cache_bytes:return
	var directory := DirAccess.open(cache_directory)
	if not directory:return
	var files: Array=[]
	var total := 0
	for name in directory.get_files():
		if not name.ends_with(".bin") or not _is_cache_file(name):continue
		var file := cache_directory.path_join(name)
		var handle := FileAccess.open(file,FileAccess.READ)
		var bytes := handle.get_length() if handle else 0
		if handle:handle.close()
		total+=bytes
		files.append({"file":file,"bytes":bytes,"time":FileAccess.get_modified_time(file)})
	_cache_bytes=total
	files.sort_custom(func(a,b):return a.time<b.time)
	for entry in files:
		if total<=max_cache_bytes:break
		DirAccess.remove_absolute(entry.file)
		total-=int(entry.bytes)
		_cache_bytes=total

func _request(url: String, max_bytes: int) -> PackedByteArray:
	while _http_active>=4 and not _closed:await get_tree().process_frame
	if _closed:return PackedByteArray()
	_http_active+=1
	var result := PackedByteArray()
	for attempt in range(retries+1):
		if _closed:break
		var http := HTTPRequest.new()
		http.timeout=timeout_seconds
		http.body_size_limit=max_bytes
		http.use_threads=true
		http.accept_gzip=false
		add_child(http)
		var completed: Array=[]
		http.request_completed.connect(func(result,code,headers,body):completed.assign([result,code,headers,body]),CONNECT_ONE_SHOT)
		var target: String=str(await url_resolver.call(url)) if url_resolver.is_valid() else url
		stats.requests=int(stats.requests)+1
		var error := http.request(target,request_headers)
		if error==OK:
			while completed.is_empty() and not _closed:await get_tree().process_frame
			if not completed.is_empty() and int(completed[0])==HTTPRequest.RESULT_SUCCESS and int(completed[1])>=200 and int(completed[1])<300:
				result=completed[3]
				http.queue_free()
				stats.downloaded_bytes=int(stats.downloaded_bytes)+result.size()
				_emit("download")
				break
		if _closed:http.cancel_request()
		http.queue_free()
		if attempt<retries:
			stats.retries=int(stats.retries)+1
			_emit("retry")
	_http_active-=1
	return result

func open(url: String, expected_release: String = "") -> bool:
	_opening+=1
	var token := _opening
	last_error=""
	stats.offline=false
	var index_file := cache_directory.path_join("index-"+_hash(url.to_utf8_buffer())+".json")
	var bytes := await _request(url,4*1024*1024)
	var index: Variant=JSON.parse_string(bytes.get_string_from_utf8()) if not bytes.is_empty() else null
	if not _validate(index):
		if FileAccess.file_exists(index_file):
			bytes=FileAccess.get_file_as_bytes(index_file)
			index=JSON.parse_string(bytes.get_string_from_utf8())
			stats.offline=true
			_emit("offline")
	if not _validate(index):
		_fail("远端目录不可用，且没有有效缓存")
		return false
	if not expected_release.is_empty() and index.release!=expected_release:
		_fail("远端资源版本不匹配")
		return false
	if _closed or token!=_opening:return false
	_write(index_file,bytes)
	catalog=index
	for id in index.objects:_sources[id]={"object":index.objects[id],"url":url.get_base_dir().path_join(index.objects[id].path)}
	_emit("catalog")
	return true

func object(id: String) -> PackedByteArray:
	if _closed or not _sources.has(id):return PackedByteArray()
	if _objects_in_flight.has(id):
		var existing: Array=_objects_in_flight[id]
		while existing[0]==null and not _closed:await object_finished
		return existing[0] if existing[0]!=null else PackedByteArray()
	var ticket: Array=[null]
	_objects_in_flight[id]=ticket
	var source: Dictionary=_sources[id]
	var o: Dictionary=source.object
	var bytes := PackedByteArray()
	var file := _cache_file(id)
	if FileAccess.file_exists(file):
		bytes=FileAccess.get_file_as_bytes(file)
		if bytes.size()==int(o.bytes) and _hash(bytes)==id:
			stats.cache_hits=int(stats.cache_hits)+1
			_emit("cache")
		else:
			DirAccess.remove_absolute(file)
			bytes=PackedByteArray()
	if bytes.is_empty():
		var packed := await _request(source.url,int(o.downloadBytes))
		if packed.size()==int(o.downloadBytes):
			bytes=packed.decompress_dynamic(int(o.bytes),FileAccess.COMPRESSION_GZIP) if o.compression=="gzip" else packed
		if bytes.size()!=int(o.bytes) or _hash(bytes)!=id:
			bytes=PackedByteArray()
			_fail("远端资源下载或校验失败："+id)
		elif not _closed:
			_write(file,bytes)
			_prune_cache(bytes.size())
	ticket[0]=bytes
	_objects_in_flight.erase(id)
	object_finished.emit(id)
	return bytes

func _json(id: String) -> Variant:
	var bytes := await object(id)
	return JSON.parse_string(bytes.get_string_from_utf8()) if not bytes.is_empty() else null

func _expand(value: Variant, chain: Array = [], state: Dictionary = {}) -> Variant:
	if not state.has("ok"):state.ok=true
	if value is String and value.begins_with("@json:"):
		var id: String=value.substr(6)
		if chain.size()>32 or chain.has(id):
			state.ok=false
			_fail("远端组件存在循环引用")
			return null
		var decoded: Variant=await _json(id)
		if decoded==null:state.ok=false
		return await _expand(decoded,chain+[id],state)
	if value is Array:
		var result: Array=[]
		for v in value:result.append(await _expand(v,chain,state))
		return result
	if value is Dictionary:
		var result: Dictionary={}
		for key in value:result[key]=await _expand(value[key],chain,state)
		return result
	return value

func texture(key: String) -> Texture2D:
	if _prepared_textures.has(key):return _prepared_textures[key] as Texture2D
	return (_weak_textures[key] as WeakRef).get_ref() as Texture2D if _weak_textures.has(key) else null

func _decode_texture(key: String) -> Texture2D:
	var cached := texture(key)
	if cached:return cached
	if not _texture_objects.has(key):return null
	var id: String=_texture_objects[key]
	var bytes := await object(id)
	if bytes.is_empty():return null
	var image := Image.new()
	var type: String=_sources[id].object.mime
	var error := image.load_webp_from_buffer(bytes) if type=="image/webp" else image.load_jpg_from_buffer(bytes) if type=="image/jpeg" else image.load_png_from_buffer(bytes)
	if error!=OK or image.get_width()>8192 or image.get_height()>8192 or image.get_width()*image.get_height()>16*1024*1024:
		_fail("远端图片无法解码或超过尺寸限制")
		return null
	var result := ImageTexture.create_from_image(image)
	_weak_textures[key]=weakref(result)
	return result

func _prepare_texture(key: String) -> void:
	_texture_jobs[key]=true
	var result := await _decode_texture(key)
	if result:_prepared_textures[key]=result
	else:_texture_retry_after[key]=Time.get_ticks_msec()+5000
	_texture_jobs.erase(key)
	_prune_prepared()

func prepare_textures(keys: Array, owner: int) -> bool:
	_texture_consumers[owner]=keys.duplicate()
	var ready := true
	for key in keys:
		if texture(key):continue
		ready=false
		if not _texture_jobs.has(key) and Time.get_ticks_msec()>=int(_texture_retry_after.get(key,0)):_prepare_texture(key)
	return ready

func _prune_prepared() -> void:
	var needed: Dictionary={}
	for keys in _texture_consumers.values():
		for key in keys:needed[key]=true
	for key in _prepared_textures.keys():
		if not needed.has(key):_prepared_textures.erase(key)

func release_prepared(owner: int) -> void:
	_texture_consumers.erase(owner)
	_prune_prepared()

func _prefetch_one(id: String, state: Dictionary) -> void:
	var bytes := await object(id)
	if bytes.is_empty():state.ok=false
	state.remaining=int(state.remaining)-1

func _prefetch(ids: Array) -> bool:
	var state := {"remaining":ids.size(),"ok":true}
	for id in ids:_prefetch_one(id,state)
	while int(state.remaining)>0 and not _closed:await get_tree().process_frame
	return state.ok and not _closed

func _resources(record: Dictionary, library: CardscapeLibrary, ids: Array) -> bool:
	for key in record.textureObjects:_texture_objects[key]=record.textureObjects[key]
	for key in record.shaders:
		var bytes := await object(record.shaders[key])
		if bytes.is_empty():return false
		var shader := Shader.new()
		shader.code=bytes.get_string_from_utf8()
		library.shaders[key]=shader
	for key in record.textureObjects:
		if not ids.has(record.textureObjects[key]):continue
		var tex := await _decode_texture(key)
		if not tex:return false
		library.textures[key]=tex
	library.remote_source=self
	return true

func load_card(id: String, tier: String = "small") -> CardscapeLibrary:
	last_error=""
	var entries: Array=catalog.get("cards",[]).filter(func(c):return c.id==id)
	if entries.is_empty():
		_fail("远端卡牌不存在")
		return null
	var entry: Dictionary=entries[0].godot
	var ids: Array=entry.base+entry.detail if tier=="large" else entry.base
	if not await _prefetch(ids):return null
	var decoded: Variant=await _json(entry.definition)
	if not decoded is Dictionary:return null
	var expanded := {"ok":true}
	var record: Variant=await _expand(decoded,[],expanded)
	if not record is Dictionary or not record.get("card") is Dictionary or not expanded.ok:return null
	var library := CardscapeLibrary.new()
	if not await _resources(record,library,ids):return null
	library.initial_detail_level=tier
	library.data_json=JSON.stringify({"schema":"cardscape-library/1","name":catalog.name,"activeCardId":id,"cards":[record.card],"components":[]})
	_emit("ready")
	return library

func load_component(kind: String, id: String, version: int, library: CardscapeLibrary) -> bool:
	var entries: Array=catalog.get("components",[]).filter(func(c):return c.kind==kind and c.id==id and c.version==version)
	if entries.is_empty():return false
	var entry: Dictionary=entries[0]
	var record: Variant=await _json(entry.definition)
	if not record is Dictionary or not await _resources(record,library,entry.base):return false
	var data: Dictionary=library.catalog().duplicate(true)
	var components: Array=data.get("components",[])
	var matches: Array=components.filter(func(c):return c.id==id and c.kind==kind)
	if matches.is_empty():
		components.append({"id":id,"kind":kind,"versions":[{"version":version,"value":record.value}]})
	else:
		matches[0].versions=matches[0].versions.filter(func(v):return v.version!=version)+[{"version":version,"value":record.value}]
	data.components=components
	library.data_json=JSON.stringify(data)
	return true

func clear_cache() -> Error:
	if not _objects_in_flight.is_empty() or _http_active>0:return ERR_BUSY
	var directory := DirAccess.open(cache_directory)
	if directory:
		for name in directory.get_files():
			if _is_cache_file(name):DirAccess.remove_absolute(cache_directory.path_join(name))
	_cache_bytes=-1
	return OK

func close() -> void:
	_closed=true
	_opening+=1
	_texture_consumers.clear()
	_prepared_textures.clear()
