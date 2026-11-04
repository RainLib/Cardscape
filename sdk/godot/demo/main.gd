extends Node3D
var card: CardscapeCard
var dragging := false
var previous := Vector2.ZERO

func _ready() -> void:
	var camera := Camera3D.new()
	camera.position.z = 2.7
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.fov = CardscapeCard.preview_fov(get_viewport().get_visible_rect().size)
	get_viewport().size_changed.connect(func():camera.fov=CardscapeCard.preview_fov(get_viewport().get_visible_rect().size))
	camera.current = true
	add_child(camera)
	var catalog := load("res://library.tres") as CardscapeLibrary
	card = CardscapeCard.new()
	card.library = catalog
	card.card_id = catalog.catalog().activeCardId
	camera.position.z = float(catalog.card(card.card_id).get("spatial",{}).get("cameraDistance",2.7))
	add_child(card)
	var canvas := CanvasLayer.new()
	add_child(canvas)
	var panel := VBoxContainer.new()
	panel.position = Vector2(12,12)
	canvas.add_child(panel)
	var select := OptionButton.new()
	for entry in catalog.catalog().cards:
		select.add_item(entry.name)
		select.set_item_metadata(select.item_count-1,entry.id)
		if entry.id == card.card_id:
			select.select(select.item_count-1)
	select.item_selected.connect(func(index):
		card.card_id=str(select.get_item_metadata(index))
		camera.position.z=float(catalog.card(card.card_id).get("spatial",{}).get("cameraDistance",2.7))
	)
	panel.add_child(select)
	for spec in [["Front",func():card.inspect(0)],["Back",func():card.flip_to_back()],["Enter",func():card.play_action("enter")],["Flip",func():card.play_action("flip")],["English",func():card.locale="en"],["Chinese",func():card.locale="zh-CN"]]:
		var button := Button.new()
		button.text = spec[0]
		button.pressed.connect(spec[1])
		panel.add_child(button)
	var action_picker:=OptionButton.new()
	var populate_actions:=func():
		action_picker.clear()
		for action in catalog.card(card.card_id).get("actions",[]):
			action_picker.add_item(str(action.name))
			action_picker.set_item_metadata(action_picker.item_count-1,action.id)
	action_picker.item_selected.connect(func(index):card.play_action(str(action_picker.get_item_metadata(index))))
	select.item_selected.connect(func(_index):populate_actions.call())
	populate_actions.call()
	panel.add_child(action_picker)
	var play:=Button.new()
	play.text="Play / Pause action"
	play.pressed.connect(func():card.pause_action(not card._paused))
	panel.add_child(play)
	var audio:=CheckButton.new()
	audio.text="Enable action audio"
	audio.toggled.connect(func(value):card.audio_enabled=value)
	panel.add_child(audio)
	var zoom := HSlider.new()
	zoom.min_value=.25
	zoom.max_value=3.0
	zoom.step=.05
	zoom.value=1.0
	zoom.custom_minimum_size=Vector2(170,20)
	zoom.value_changed.connect(func(value):card.scale=Vector3.ONE*value)
	panel.add_child(zoom)
	var text := Label.new()
	text.text = "Drag to inspect | component overrides in Godot Inspector"
	panel.add_child(text)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		dragging = event.pressed
		previous = event.position
	if event is InputEventMouseMotion and dragging:
		var delta: Vector2 = event.position - previous
		previous = event.position
		card.inspect(rad_to_deg(card._base_pose.y)+delta.x*.25,clampf(rad_to_deg(card._base_pose.x)+delta.y*.15,-30,30))
