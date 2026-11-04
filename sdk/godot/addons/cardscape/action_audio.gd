extends RefCounted
## Non-positional action SFX. Static clip buffers belong to the shared library;
## each card owns up to eight playback nodes and a separate mute switch.
static var total_voices: int = 0
var enabled: bool = false
var starts: int = 0
var last_error: String = ""
var _owner: Node
var _library: Resource
var _voices: Dictionary = {}

func _init(owner: Node, source: Resource) -> void:
	_owner=owner
	_library=source

static func cues(action: Dictionary, seconds: float) -> Array:
	var result: Array=[]
	var duration: float=float(action.get("duration",0))
	if duration<=0 or not is_finite(seconds) or seconds<0:return result
	if not action.get("loop",false) and seconds>=duration:return result
	var cycle: int=int(floor(seconds/duration)) if action.get("loop",false) else 0
	var local: float=seconds-float(cycle)*duration
	for event in action.get("audioEvents",[]):
		var age: float=local-float(event.at)*duration
		var span: float=float(event.sourceDuration)-float(event.offset)
		var length: float=float(event.duration) if event.loop else minf(float(event.duration),span/float(event.playbackRate))
		if not event.enabled or float(event.volume)<=0 or age<0 or age>=length-0.0000001 or span<=0:continue
		result.append({"event":event,"key":str(action.id)+":"+str(event.id)+":"+str(cycle),"age":age,"remaining":length-age,"offset":float(event.offset)+(fmod(age*float(event.playbackRate),span) if event.loop else age*float(event.playbackRate))})
		if result.size()>=8:break
	return result

func _stop(key: String) -> void:
	if not _voices.has(key):return
	var player: AudioStreamPlayer=_voices[key].player
	_voices.erase(key)
	total_voices-=1
	player.stop()
	player.free()

func stop() -> void:
	for key in _voices.keys():_stop(key)

func set_enabled(value: bool) -> void:
	enabled=value
	if not enabled:stop()

func sync(action: Dictionary, seconds: float, playing: bool) -> void:
	if not enabled or not playing or not is_instance_valid(_owner) or not _library:
		stop()
		return
	var wanted: Array=cues(action,seconds)
	var keys: Array=wanted.map(func(cue):return cue.key)
	for key in _voices.keys():
		if not keys.has(key):_stop(key)
	for cue in wanted:
		var event: Dictionary=cue.event
		var signature: int=event.hash()
		if _voices.has(cue.key):
			var old: Dictionary=_voices[cue.key]
			var current: AudioStreamPlayer=old.player
			# A naturally completed source must not be restarted in the same window.
			if old.signature==signature and (not current.playing or absf(current.get_playback_position()-float(cue.offset))<.15):continue
			_stop(cue.key)
		if total_voices>=32:continue
		var stream: AudioStream=_library.audio_streams.get(str(event.src)) as AudioStream
		if not stream:
			last_error="缺少音效素材："+str(event.src)
			continue
		if absf(stream.get_length()-float(event.sourceDuration))>.025:
			last_error="音效长度与工程记录不一致"
			continue
		if not stream is AudioStreamWAV:
			last_error="音效需要 PCM WAV"
			continue
		var wav: AudioStreamWAV=stream.duplicate() as AudioStreamWAV
		wav.loop_mode=AudioStreamWAV.LOOP_FORWARD if event.loop else AudioStreamWAV.LOOP_DISABLED
		wav.loop_begin=int(round(float(event.offset)*wav.mix_rate))
		wav.loop_end=int(round(float(event.sourceDuration)*wav.mix_rate))
		var player:=AudioStreamPlayer.new()
		player.name="ActionAudio"
		player.stream=wav
		player.pitch_scale=float(event.playbackRate)
		player.volume_db=linear_to_db(float(event.volume))
		_owner.add_child(player)
		_voices[cue.key]={"player":player,"signature":signature,"offset":cue.offset,"remaining":cue.remaining}
		total_voices+=1
		starts+=1
		player.play(float(cue.offset))

func state() -> Dictionary:
	var voices: Array=[]
	for key in _voices:
		var voice: Dictionary=_voices[key]
		voices.append({"key":key,"offset":voice.offset,"position":voice.player.get_playback_position(),"playing":voice.player.playing})
	return {"enabled":enabled,"voices":voices,"starts":starts,"error":last_error,"globalVoices":total_voices}

func dispose() -> void:
	stop()
	_owner=null
	_library=null
