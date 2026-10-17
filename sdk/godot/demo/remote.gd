extends Node3D
## This scene runs with the SDK only: no local card library or art assets.
@export var catalog_url: String = ""
var remote: CardscapeRemote
var card: CardscapeCard
var picker: OptionButton
var actions: OptionButton
var status: Label
var url_input: LineEdit
var zoom: HSlider
var _selection: int = 0

func _ready() -> void:
	var camera := Camera3D.new()
	camera.position.z=2.7
	camera.current=true
	camera.fov=40
	add_child(camera)
	remote=CardscapeRemote.new()
	add_child(remote)
	var canvas := CanvasLayer.new()
	add_child(canvas)
	var panel := VBoxContainer.new()
	panel.position=Vector2(12,12)
	canvas.add_child(panel)
	url_input=LineEdit.new()
	url_input.custom_minimum_size=Vector2(350,0)
	url_input.placeholder_text="https://你的域名/catalog.json"
	url_input.text=catalog_url
	panel.add_child(url_input)
	var load_button := Button.new()
	load_button.text="加载远端目录"
	load_button.pressed.connect(_open)
	panel.add_child(load_button)
	picker=OptionButton.new()
	picker.item_selected.connect(_show)
	panel.add_child(picker)
	actions=OptionButton.new()
	actions.item_selected.connect(func(index):
		if card:card.play_action(str(actions.get_item_metadata(index))))
	panel.add_child(actions)
	var play := Button.new()
	play.text="播放 / 暂停"
	play.pressed.connect(func():
		if card:card.pause_action(not card._paused))
	panel.add_child(play)
	zoom=HSlider.new()
	zoom.min_value=.25
	zoom.max_value=3
	zoom.step=.05
	zoom.value=1
	zoom.value_changed.connect(func(value):
		if card:card.scale=Vector3.ONE*value)
	panel.add_child(zoom)
	status=Label.new()
	status.text="输入远端 catalog.json 地址"
	panel.add_child(status)
	remote.progress.connect(func(stage,bytes,hits):status.text="%s · 下载 %.1f MB · 缓存 %d"%[stage,float(bytes)/1048576,hits])
	remote.failed.connect(func(message):status.text=message)
	if not catalog_url.is_empty():_open()

func _open() -> void:
	_selection+=1
	if not await remote.open(url_input.text.strip_edges()):return
	picker.clear()
	for entry in remote.catalog.cards:
		picker.add_item(entry.name)
		picker.set_item_metadata(picker.item_count-1,entry.id)
	if picker.item_count>0:_show(0)

func _show(index: int) -> void:
	_selection+=1
	var token := _selection
	var id: String=str(picker.get_item_metadata(index))
	var library := await remote.load_card(id)
	if token!=_selection or not library:return
	var next := CardscapeCard.new()
	next.library=library
	next.card_id=id
	next.scale=Vector3.ONE*zoom.value
	add_child(next)
	if card:card.queue_free()
	card=next
	actions.clear()
	for action in library.card(id).actions:
		actions.add_item(action.name)
		actions.set_item_metadata(actions.item_count-1,action.id)
	if actions.item_count>0:
		var definitions: Array=library.card(id).actions
		var looping := definitions.filter(func(action):return action.get("loop",false) and action.get("event","")!="flip")
		var preferred: int=definitions.find(looping[0]) if not looping.is_empty() else 0
		actions.select(preferred)
		card.play_action(str(actions.get_item_metadata(preferred)))
