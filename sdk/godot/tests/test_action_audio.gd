extends SceneTree
const Audio=preload("res://addons/cardscape/action_audio.gd")
var failures: Array[String]=[]
var peak: float=0.0
var silent_peak: float=0.0
func _initialize() -> void:call_deferred("run")
func check(value: bool,message: String) -> void:
	if not value:failures.append(message)
func measure(capture: AudioEffectCapture) -> float:
	var result:=0.0
	for sample in capture.get_buffer(capture.get_frames_available()):result=maxf(result,maxf(absf(sample.x),absf(sample.y)))
	return result
func run() -> void:
	var reference=JSON.parse_string(FileAccess.get_file_as_string("res://tests/audio-reference.json"))
	var samples:=0
	for record in reference:
		var actual:=Audio.cues(record.action,float(record.seconds))
		check(actual.size()==record.cues.size(),"cross-runtime cue count")
		for i in mini(actual.size(),record.cues.size()):
			for key in ["age","remaining","offset"]:check(absf(float(actual[i][key])-float(record.cues[i][key]))<0.000001,"cross-runtime "+key)
			check(actual[i].key==record.cues[i].key,"cross-runtime action/cycle identity")
		samples+=1
	var scene:=Node3D.new()
	root.add_child(scene)
	var camera:=Camera3D.new()
	scene.add_child(camera)
	camera.position.z=2.7
	camera.current=true
	var library:=load("res://library.tres") as CardscapeLibrary
	check(library.audio_streams.size()==3,"three original shared WAV assets imported")
	var capture:=AudioEffectCapture.new()
	capture.buffer_length=1.0
	AudioServer.add_bus_effect(0,capture)
	var previous_volume:=AudioServer.get_bus_volume_db(0)
	AudioServer.set_bus_volume_db(0,-60)
	var card:=CardscapeCard.new()
	card.library=library
	card.card_id=str(library.catalog().activeCardId)
	scene.add_child(card)
	for frame in 6:await process_frame
	card.set_process(false)
	card.play_action("collision-cast",0)
	card.seek_action(.8,false)
	check(card.audio_state().voices.is_empty(),"native audio defaults to muted")
	card.audio_enabled=true
	capture.clear_buffer()
	card.seek_action(.8,false)
	check(card.audio_state().voices.size()==1,"real trimmed loop is playing")
	check(absf(float(card.audio_state().voices[0].offset)-.44)<0.000001,"trim offset and speed use action seconds")
	await create_timer(.2).timeout
	peak=measure(capture)
	check(peak>0.0000001,"actual audio mixer produces nonzero PCM")
	card.pause_action(true)
	check(card.audio_state().voices.is_empty(),"pause releases playback voice")
	await create_timer(.12).timeout
	capture.clear_buffer()
	await create_timer(.12).timeout
	silent_peak=measure(capture)
	check(silent_peak<0.0000001,"paused audio mixer is silent")
	card.seek_action(.5,true)
	card.seek_action(.8,false)
	check(absf(float(card.audio_state().voices[0].offset)-.44)<0.000001,"reverse seek reconstructs sound offset")
	card.play_action("sweep",0)
	check(card.audio_state().voices.is_empty(),"action interruption stops old sound immediately")
	card.seek_action(.9,false)
	check(card.audio_state().voices.size()==1,"new action plays its own sound")
	card.seek_action(2.3,false)
	check(card.audio_state().voices.is_empty(),"past single-shot audio is not replayed")
	card.audio_enabled=false
	var controllers: Array=[]
	var collision: Dictionary=library.card(card.card_id).actions.filter(func(a):return a.id=="collision-cast")[0]
	for i in 36:
		var controller:=Audio.new(scene,library)
		controller.set_enabled(true)
		controller.sync(collision,.8,true)
		controllers.append(controller)
	check(Audio.total_voices==32,"global native voice budget32")
	for controller in controllers:controller.dispose()
	check(Audio.total_voices==0,"many-card audio release")
	card.audio_enabled=true
	card.play_action("collision-cast",0)
	card.seek_action(.8,false)
	check(Audio.total_voices==1,"card re-enables after muted state")
	card.free()
	check(Audio.total_voices==0,"card disposal releases all playback nodes")
	AudioServer.remove_bus_effect(0,AudioServer.get_bus_effect_count(0)-1)
	AudioServer.set_bus_volume_db(0,previous_volume)
	scene.free()
	controllers.clear()
	# AudioServer retires stopped playback buffers on its next mixing pass.
	await create_timer(.12).timeout
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"audioSamples":samples,"mixerPeak":peak,"pausedPeak":silent_peak,"sourceAssets":library.audio_streams.size(),"voiceLimit":32,"releasedVoices":Audio.total_voices}))
	quit(0 if failures.is_empty() else 1)
