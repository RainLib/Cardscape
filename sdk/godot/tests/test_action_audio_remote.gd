extends SceneTree
var failures: Array[String]=[]
func _initialize() -> void:call_deferred("run")
func check(value: bool,message: String) -> void:
	if not value:failures.append(message)
func run() -> void:
	var remote:=CardscapeRemote.new()
	remote.cache_directory="user://"+OS.get_environment("CARDSCAPE_AUDIO_CACHE")
	root.add_child(remote)
	check(await remote.open(OS.get_environment("CARDSCAPE_AUDIO_CATALOG")),"remote catalog loads")
	var library:=await remote.load_card("sentinel","small")
	if not library:
		print(JSON.stringify({"status":"failed","failures":failures+[remote.last_error]}))
		quit(1)
		return
	check(library.audio_streams.size()==3,"remote base dependencies decode three canonical WAV streams")
	var scene:=Node3D.new()
	root.add_child(scene)
	var camera:=Camera3D.new()
	camera.position.z=2.7
	camera.current=true
	scene.add_child(camera)
	var capture:=AudioEffectCapture.new()
	capture.buffer_length=1.0
	AudioServer.add_bus_effect(0,capture)
	var previous_volume:=AudioServer.get_bus_volume_db(0)
	AudioServer.set_bus_volume_db(0,-60)
	var card:=CardscapeCard.new()
	card.library=library
	card.card_id="sentinel"
	card.audio_enabled=true
	scene.add_child(card)
	for frame in 5:await process_frame
	card.set_process(false)
	card.play_action("collision-cast",0)
	capture.clear_buffer()
	card.seek_action(.8,false)
	check(card.audio_state().voices.size()==1,"remote card starts actual audio playback")
	check(card.audio_state().error.is_empty(),"remote playback has no missing stream")
	await create_timer(.2).timeout
	var peak:=0.0
	for sample in capture.get_buffer(capture.get_frames_available()):peak=maxf(peak,maxf(absf(sample.x),absf(sample.y)))
	check(peak>0.0000001,"remote WAV produces real mixer PCM")
	card.pause_action(true)
	check(card.audio_state().voices.is_empty(),"remote action pause releases voice")
	card.free()
	var statistics:=remote.stats.duplicate()
	remote.close()
	remote.free()
	scene.free()
	AudioServer.remove_bus_effect(0,AudioServer.get_bus_effect_count(0)-1)
	AudioServer.set_bus_volume_db(0,previous_volume)
	await create_timer(.15).timeout
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"remoteAudio":true,"sourceAssets":library.audio_streams.size(),"mixerPeak":peak,"remote":statistics}))
	quit(0 if failures.is_empty() else 1)
