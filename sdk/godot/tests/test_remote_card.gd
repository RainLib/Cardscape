extends SceneTree
var failures: Array[String]=[]
func _initialize() -> void:call_deferred("run")
func check(condition: bool,message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)
func control(query: String) -> void:
	var base := OS.get_environment("CARDSCAPE_REMOTE_CONTROL")
	if base.is_empty():return
	var request := HTTPRequest.new()
	request.timeout=5
	root.add_child(request)
	var completed: Array=[]
	request.request_completed.connect(func(result,code,headers,body):completed.assign([result,code,headers,body]),CONNECT_ONE_SHOT)
	var error := request.request(base+"?"+query)
	check(error==OK,"fault injection request starts")
	if error==OK:
		while completed.is_empty():await process_frame
		check(int(completed[1])==200,"fault injection server responds")
	request.queue_free()
func settle(card: CardscapeCard,level: String) -> void:
	for i in 600:
		await process_frame
		if card.export_detail_state().level==level:
			await RenderingServer.frame_post_draw
			return
	check(false,"remote detail tier did not finish: "+level)
func positions(card: CardscapeCard) -> Dictionary:
	var result: Dictionary={}
	for id in card._native_meshes:result[id]=card._native_meshes[id].last_positions.duplicate()
	return result
func sizes(card: CardscapeCard) -> Array:
	var result: Array=[]
	for surface in card._surfaces:
		var tex: Texture2D=surface.material_override.get_shader_parameter("art")
		if tex:result.append(tex.get_width())
	return result
func run() -> void:
	var remote := CardscapeRemote.new()
	remote.cache_directory=OS.get_environment("CARDSCAPE_REMOTE_CACHE")
	if remote.cache_directory.is_empty():remote.cache_directory="user://cardscape-remote-test"
	root.add_child(remote)
	DirAccess.make_dir_recursive_absolute(remote.cache_directory)
	var unrelated := remote.cache_directory.path_join("keep-game-settings.bin")
	var sentinel := FileAccess.open(unrelated,FileAccess.WRITE)
	sentinel.store_string("other game data")
	sentinel.close()
	remote.clear_cache()
	check(FileAccess.file_exists(unrelated),"cache cleanup preserves unrelated game data")
	var url := OS.get_environment("CARDSCAPE_REMOTE_URL")
	check(await remote.open(url),"remote catalog downloads")
	check(remote.catalog.cards.size()>=2,"shared-frame test uses two cards")
	var first: Dictionary=remote.catalog.cards[0]
	var second: Dictionary=remote.catalog.cards[1]
	var initial_requests: int=remote.stats.requests
	var library := await remote.load_card(first.id)
	check(library!=null,"downloaded raw images create a runtime library without import files")
	var before: String=library.data_json
	var scene := Node3D.new()
	root.add_child(scene)
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.fov=40
	camera.current=true
	scene.add_child(camera)
	var card := CardscapeCard.new()
	card.library=library
	card.card_id=first.id
	card.detail_pixel_width=200
	card.effects_paused=true
	scene.add_child(card)
	for i in 5:await process_frame
	check(card._native_meshes.size()>0,"remote Spine meshes are present")
	var small: int=sizes(card).max()
	var base_requests: int=remote.stats.requests
	var fault_id: String=first.godot.detail[0]
	var broken := FileAccess.open(remote._cache_file(fault_id),FileAccess.WRITE)
	broken.store_buffer(PackedByteArray([1,2,3]))
	broken.close()
	await control("fail="+("/remote/"+remote.catalog.objects[fault_id].path).uri_encode())
	var action_frames := 0
	var captures := OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	for action in card._definition.actions:
		for fraction in [0.0,.5,1.0]:
			card.play_action(action.id)
			card.seek_action(float(action.duration)*fraction,true)
			card.detail_pixel_width=200
			await settle(card,"small")
			var baseline := positions(card)
			var seconds: float=card._action_time
			var meshes: Array=card._surfaces.map(func(s):return s.mesh.get_instance_id())
			if fraction==.5 and not captures.is_empty():root.get_texture().get_image().save_png(captures.path_join(str(action.id)+"-remote-small.png"))
			card.detail_pixel_width=900
			await settle(card,"large")
			check(card._action_time==seconds and baseline==positions(card),"remote HD preserves paused bones, weights and FFD")
			check(meshes==card._surfaces.map(func(s):return s.mesh.get_instance_id()),"remote HD reuses mesh instances")
			action_frames+=2
			if fraction==.5 and not captures.is_empty():root.get_texture().get_image().save_png(captures.path_join(str(action.id)+"-remote-large.png"))
	var large: int=sizes(card).max()
	check(small<large,"remote zoom changes actual GPU texture sizes")
	check(int(remote.stats.requests)>base_requests,"HD downloads only after zoom")
	check(remote._hash(FileAccess.get_file_as_bytes(remote._cache_file(fault_id)))==fault_id,"corrupt cache is replaced only by verified bytes")
	if not OS.get_environment("CARDSCAPE_REMOTE_CONTROL").is_empty():check(int(remote.stats.retries)>0,"503 download retries succeed")
	check(library.data_json==before,"download and zoom never alter the authored rig or actions")
	var previous_requests: int=remote.stats.requests
	var second_library := await remote.load_card(second.id)
	check(second_library!=null,"a second card can share frame and content objects")
	var unique: Array=second.godot.base.filter(func(id):return not first.godot.base.has(id) and not first.godot.detail.has(id))
	check(int(remote.stats.requests)-previous_requests==unique.size(),"second card downloads only changed objects")
	for component in remote.catalog.components:
		check(await remote.load_component(component.kind,component.id,int(component.version),second_library),"component versions download independently")
		check(not second_library.component(component.kind,component.id,int(component.version)).is_empty(),"downloaded components can use the existing set_component interface")
		break
	var offline_tested := false
	if not OS.get_environment("CARDSCAPE_REMOTE_CONTROL").is_empty():
		await control("offline=1")
		var offline := CardscapeRemote.new()
		offline.cache_directory=remote.cache_directory
		offline.retries=0
		root.add_child(offline)
		check(await offline.open(url),"offline reopen uses the previous catalog")
		check(offline.stats.offline,"offline fallback is explicit")
		var cached := await offline.load_card(first.id)
		check(cached!=null and cached.data_json==before,"offline cache renders the same card data")
		check(int(offline.stats.requests)==1,"offline card assets require no network requests")
		offline_tested=true
		offline.close()
		offline.queue_free()
		await control("offline=0")
	var uncached: Array=second.godot.detail.filter(func(id):return not first.godot.base.has(id) and not first.godot.detail.has(id))
	if not uncached.is_empty():
		var pending := {"remaining":1,"ok":true}
		remote._prefetch_one(uncached[0],pending)
		remote.close()
		for i in 60:
			if int(pending.remaining)==0:break
			await process_frame
		check(int(pending.remaining)==0 and remote._http_active==0,"closing cancels in-flight downloads promptly")
		check(remote.last_error.is_empty(),"intentional cancellation does not report a broken download")
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","frames":action_frames,"small_width":small,"large_width":large,"meshes":card._native_meshes.size(),"requests":remote.stats.requests,"base_requests":base_requests-initial_requests,"second_card_new_objects":unique.size(),"cache_hits":remote.stats.cache_hits,"offline":offline_tested,"failures":failures}))
	scene.queue_free()
	await process_frame
	await process_frame
	remote.close()
	remote.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
