extends SceneTree
const Physics=preload("res://addons/cardscape/particle_physics.gd")
var failures: Array[String]=[]
func _initialize() -> void:call_deferred("run")
func check(condition: bool,message: String) -> void:
	if not condition:failures.append(message)
func config(extra: Dictionary={}) -> Dictionary:
	var p: Dictionary={"schema":"card-particle-physics/1","velocity":[0,.35,0],"spread":[.25,.15,0],"gravity":[0,-2,0],"radius":0.0,"restitution":1.0,"friction":0.0,"response":"bounce","maxBounces":8,"planes":[{"id":"floor","normal":[0,1,0],"distance":0.0}]}
	p.merge(extra,true)
	return p
func snapshot(card: CardscapeCard) -> Array:
	var entry: Dictionary=card._particle_event_states["collision-cast:impact-sparks"]
	var result: Array=[]
	for i in int(entry.count):result.append([entry.node.multimesh.get_instance_transform(i),entry.node.multimesh.get_instance_custom_data(i),entry.node.multimesh.get_instance_color(i)])
	return result
func visible_count(card: CardscapeCard) -> int:
	var count:=0
	for sample in snapshot(card):
		if (sample[2] as Color).a>0:count+=1
	return count
func capture(name: String) -> void:
	for frame in 3:await process_frame
	await RenderingServer.frame_post_draw
	var directory:=OS.get_environment("CARDSCAPE_CAPTURE_DIR")
	if not directory.is_empty():check(root.get_texture().get_image().save_png(directory.path_join(name+".png"))==OK,"save capture "+name)
func run() -> void:
	var engine:=Physics.new()
	var free:=engine.sample(config({"planes":[]}),Vector3(0,1,0),Vector3(2,3,4),.5,2)
	check((free.position as Vector3).is_equal_approx(Vector3(1,2.25,2)),"closed-form free fall")
	var fast:=engine.sample(config({"gravity":[0,0,0]}),Vector3(0,1,0),Vector3(0,-10,0),.15,2)
	check(absf(float(fast.position.y)-.5)<.00001 and fast.velocity==Vector3(0,10,0),"continuous collision catches a fast crossing")
	var elastic:=engine.sample(config(),Vector3(0,1,0),Vector3.ZERO,1.5,3)
	check(absf(float(elastic.position.y)-.75)<.00001,"gravity impact uses its analytic time")
	var slide:=engine.sample(config({"response":"slide"}),Vector3(0,.3,0),Vector3(1,-2,0),3,4)
	check(absf(float(slide.position.y))<.00001 and absf(float(slide.velocity.y))<.00001 and slide.alive,"contact sliding rests under normal gravity")
	var killed:=engine.sample(config({"maxBounces":0,"gravity":[0,0,0]}),Vector3(0,1,0),Vector3(0,-10,0),.5,1)
	check(not killed.alive and absf(float(killed.position.y))<.00001,"collision limit retires at the actual contact")
	var corridor:=config({"gravity":[0,0,0],"maxBounces":32,"planes":[{"id":"left","normal":[1,0,0],"distance":-.5},{"id":"right","normal":[-1,0,0],"distance":-.5}]})
	var reference: Array=[]
	for i in 21:
		var value:=engine.sample(corridor,Vector3.ZERO,Vector3(8,0,0),i/20.0,1)
		check(absf(float(value.position.x))<=.50001,"multiple wall constraints")
		reference.append(value)
	for i in range(20,-1,-1):check(engine.sample(corridor,Vector3.ZERO,Vector3(8,0,0),i/20.0,1)==reference[i],"reverse sampling is deterministic")
	check(not Physics.valid(config({"planes":[{"id":"bad","normal":[0,0,0],"distance":0}]})),"invalid planes rejected")
	for i in 1000:engine.sample(config({"planes":[]}),Vector3(i,1,0),Vector3.ZERO,.2,1)
	check(engine.paths.size()==256,"numeric path cache is bounded")
	engine.clear()
	check(engine.paths.is_empty(),"numeric cache releases all paths")
	var baseline:=get_node_count()
	var scene:=Node3D.new()
	root.add_child(scene)
	var camera:=Camera3D.new()
	scene.add_child(camera)
	camera.position.z=2.7
	camera.fov=CardscapeCard.preview_fov(root.size)
	camera.current=true
	var library:=load("res://library.tres") as CardscapeLibrary
	var card:=CardscapeCard.new()
	card.library=library
	card.card_id=str(library.catalog().activeCardId)
	card.effects_paused=true
	card.detail_pixel_width=100000
	scene.add_child(card)
	for frame in 6:await process_frame
	card.set_process(false)
	check(card.play_action("collision-cast",0),"real collision action available")
	card.seek_action(1.5,true)
	var original:=snapshot(card)
	check(not original.is_empty(),"real physical particles are submitted")
	for sample in original:
		var point: Vector3=(sample[0] as Transform3D).origin
		check(point.y>=-.57201 and point.x>=-.29201 and point.x<=.29201,"actual instance centers obey three finite-radius planes")
	await capture("bounce")
	card.position=Vector3(.2,.1,0)
	card.scale=Vector3.ONE*.9
	card.inspect(30,10)
	check(snapshot(card)==original,"world physics remains independent of a paused game root")
	card.seek_action(.5,true)
	card.seek_action(1.5,true)
	check(snapshot(card)==original,"physical rendering survives reverse seek and replay")
	await capture("game-moved")
	card.seek_action(3,true)
	var before_kill:=snapshot(card)
	check(visible_count(card)>0,"post-impact bounce particles are genuinely visible")
	var event: Dictionary=card._action.particleEvents[0]
	event.physics.response="kill"
	card.seek_action(3,true)
	check(visible_count(card)==0,"kill response removes particles at a prior collision")
	event.physics.response="bounce"
	card.seek_action(3,true)
	check(snapshot(card)==before_kill,"editing response invalidates the numeric path without stale trajectories")
	event.simulationSpace="card"
	card.seek_action(1.5,true)
	check(not card._particle_event_states["collision-cast:impact-sparks"].node.top_level,"card-space collision follows its parent")
	check(card._particle_count+card._particle_event_count<=128,"physical effects retain scene budgets")
	check(card._particle_physics.paths.size()<=256,"real card cache remains bounded")
	scene.queue_free()
	for frame in 6:await process_frame
	check(get_node_count()==baseline,"physical particle nodes are released with their card")
	print(JSON.stringify({"status":"passed" if failures.is_empty() else "failed","failures":failures,"planes":3,"cacheLimit":256,"captures":2}))
	quit(0 if failures.is_empty() else 1)
