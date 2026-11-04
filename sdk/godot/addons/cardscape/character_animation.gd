extends RefCounted
## Native registered-pixel rigid-part sampler; matches character-animation-model.js.
const Deformation=preload("res://addons/cardscape/character_deformation.gd")

static func _matrix(x: float, y: float, angle: float, size: float) -> Transform2D:
	var r := deg_to_rad(angle)
	return Transform2D(Vector2(cos(r),sin(r))*size,Vector2(-sin(r),cos(r))*size,Vector2(x,y))

static func compile(rig: Dictionary) -> Dictionary:
	var pending: Array = rig.get("bones",[]).duplicate()
	var order: Array = []
	var rest: Dictionary = {}
	while not pending.is_empty():
		var moved := false
		for i in range(pending.size()-1,-1,-1):
			var b: Dictionary = pending[i]
			var parent: String = str(b.parentId) if b.get("parentId") != null else ""
			if not parent.is_empty() and not rest.has(parent):continue
			var base: Transform2D = rest.get(parent,Transform2D.IDENTITY)
			rest[b.id] = base * _matrix(float(b.x),float(b.y),float(b.rotation),float(b.scale))
			order.append(b)
			pending.remove_at(i)
			moved = true
		if not moved:
			push_error("Cardscape: invalid character bone hierarchy")
			return {}
	return {"order":order,"rest":rest,"bindings":rig.get("bindings",[]),"constraints":rig.get("constraints",[]),"expressions":rig.get("expressions",[]),"meshes":rig.get("meshes",[])}

static func _sample(frames: Array, progress: float, fallback: float) -> float:
	if frames.is_empty():return fallback
	if progress <= float(frames[0].at):return float(frames[0].value)
	for i in range(1,frames.size()):
		var a: Dictionary = frames[i-1]
		var b: Dictionary = frames[i]
		if progress <= float(b.at):
			var t := (progress-float(a.at))/(float(b.at)-float(a.at))
			if a.has("curve"):return Deformation.bezier(t,a.curve,float(a.value),float(b.value))
			if a.get("ease","linear")=="hold":t=1.0 if progress==float(b.at) else 0.0
			elif a.get("ease","linear")=="smooth":t=t*t*(3.0-2.0*t)
			return lerpf(float(a.value),float(b.value),t)
	return float(frames[-1].value)

static func sample(compiled: Dictionary, action: Dictionary, progress: float, layers: Array) -> Dictionary:
	return pose(compiled,action,progress,layers).get("layers",{})

static func ordered_layers(layers: Array, action: Dictionary, progress: float) -> Array:
	var selected: Array=[]
	for frame in action.get("drawOrder",[]):
		if float(frame.at)<=progress:selected=frame.layers
	var by_id: Dictionary={}
	for layer in layers:by_id[layer.id]=layer
	var order: Array=selected.filter(func(id):return by_id.has(id))
	var result: Array=[]
	var index := 0
	for layer in layers:
		if selected.has(layer.id):
			result.append(by_id[order[index]])
			index+=1
		else:result.append(layer)
	return result

static func snapshot(compiled: Dictionary, action: Dictionary, progress: float) -> Dictionary:
	var result: Dictionary={"id":action.get("id",""),"name":action.get("name",""),"event":action.get("event","idle"),"duration":1.0,"loop":false,"motion":1.0,"emission":1.0,"bend":0.0,"tracks":{},"boneTracks":{},"ikTracks":{},"expressionTracks":{},"layerTracks":{},"deformTracks":{}}
	var envelope := 1.0 if action.get("loop",false) else sin(progress*PI)
	var defaults: Dictionary={"x":0.0,"y":0.0,"z":0.0,"yaw":progress*180.0 if action.get("event","")=="flip" else 0.0,"pitch":0.0,"scale":1.0,"opacity":1.0,"motion":1.0+(float(action.get("motion",1))-1.0)*envelope,"emission":1.0+(float(action.get("emission",1))-1.0)*envelope,"bend":float(action.get("bend",0))*envelope}
	for key in defaults:result.tracks[key]=[{"at":0.0,"value":_sample(action.get("tracks",{}).get(key,[]),progress,float(defaults[key]))}]
	for b in compiled.get("order",[]):
		var values: Dictionary={}
		for key in ["x","y","rotation","scale","opacity"]:values[key]=[{"at":0.0,"value":_sample(action.get("boneTracks",{}).get(b.id,{}).get(key,[]),progress,1.0 if key in ["scale","opacity"] else 0.0)}]
		result.boneTracks[b.id]=values
	for c in compiled.get("constraints",[]):
		var values: Dictionary={}
		var initial: Dictionary={"x":float(c.target[0]),"y":float(c.target[1]),"mix":float(c.mix)}
		for key in initial:values[key]=[{"at":0.0,"value":_sample(action.get("ikTracks",{}).get(c.id,{}).get(key,[]),progress,float(initial[key]))}]
		result.ikTracks[c.id]=values
	for e in compiled.get("expressions",[]):result.expressionTracks[e.id]={"value":[{"at":0.0,"value":_sample(action.get("expressionTracks",{}).get(e.id,{}).get("value",[]),progress,float(e.value))}]}
	for binding in compiled.get("bindings",[]):result.layerTracks[binding.layerId]={"opacity":[{"at":0.0,"value":_sample(action.get("layerTracks",{}).get(binding.layerId,{}).get("opacity",[]),progress,float(binding.get("opacity",1)))}]}
	var deforms: Dictionary=Deformation.deforms(action,progress)
	for layer in deforms:
		result.deformTracks[layer]={}
		for bone in deforms[layer]:
			var deltas: Array=[]
			for index in deforms[layer][bone]:
				var value: Vector2=deforms[layer][bone][index]
				deltas.append_array([index,value.x,value.y])
			result.deformTracks[layer][bone]=[{"at":0.0,"deltas":deltas}]
	for frame in action.get("drawOrder",[]):
		if float(frame.at)<=progress:result.drawOrder=[{"at":0.0,"layers":frame.layers.duplicate()}]
	return result

static func _blend_tracks(a: Dictionary, b: Dictionary, weight: float) -> Dictionary:
	var result: Dictionary={}
	var keys: Dictionary=a.duplicate()
	keys.merge(b,true)
	for key in keys:result[key]=[{"at":0.0,"value":lerpf(float(a.get(key,[{"value":0}])[0].value),float(b.get(key,[{"value":0}])[0].value),weight)}]
	return result

static func blend_actions(a: Dictionary, b: Dictionary, weight: float) -> Dictionary:
	var result: Dictionary=b.duplicate(true)
	result.tracks=_blend_tracks(a.get("tracks",{}),b.get("tracks",{}),weight)
	for field in ["boneTracks","ikTracks","expressionTracks","layerTracks"]:
		result[field]={}
		var keys: Dictionary=a.get(field,{}).duplicate()
		keys.merge(b.get(field,{}),true)
		for key in keys:result[field][key]=_blend_tracks(a.get(field,{}).get(key,{}),b.get(field,{}).get(key,{}),weight)
	var left: Dictionary=Deformation.deforms(a,0.0)
	var right: Dictionary=Deformation.deforms(b,0.0)
	var layers: Dictionary=left.duplicate()
	layers.merge(right,true)
	result.deformTracks={}
	for layer in layers:
		result.deformTracks[layer]={}
		var bones: Dictionary=left.get(layer,{}).duplicate()
		bones.merge(right.get(layer,{}),true)
		for bone in bones:
			var l: Dictionary=left.get(layer,{}).get(bone,{})
			var r: Dictionary=right.get(layer,{}).get(bone,{})
			var indices: Dictionary=l.duplicate()
			indices.merge(r,true)
			var deltas: Array=[]
			for index in indices:
				var value: Vector2=(l.get(index,Vector2.ZERO) as Vector2).lerp(r.get(index,Vector2.ZERO),weight)
				deltas.append_array([index,value.x,value.y])
			result.deformTracks[layer][bone]=[{"at":0.0,"deltas":deltas}]
	result.erase("drawOrder")
	var order: Array=a.get("drawOrder",[]) if weight<.5 else b.get("drawOrder",[])
	if not order.is_empty():result.drawOrder=order.duplicate(true)
	return result

static func rest(compiled: Dictionary, layers: Array) -> Dictionary:
	var bones: Dictionary={}
	var result: Dictionary={}
	for b in compiled.get("order",[]):bones[b.id]={"matrix":Transform2D.IDENTITY,"opacity":1.0}
	for binding in compiled.get("bindings",[]):
		result[binding.layerId]=bones[binding.boneId].duplicate()
		result[binding.layerId].opacity*=float(binding.get("opacity",1))
	for l in layers:
		if not result.has(l.id) and result.has(l.get("splitSourceId","")):result[l.id]=result[l.splitSourceId]
	var expressions: Dictionary={}
	for e in compiled.get("expressions",[]):expressions[e.id]=0.0
	return {"bones":bones,"layers":result,"expressions":expressions,"ik":{}}

static func _world(order: Array, locals: Dictionary) -> Dictionary:
	var world: Dictionary = {}
	for b in order:
		var parent: String = str(b.parentId) if b.get("parentId") != null else ""
		var v: Dictionary=locals[b.id]
		var base: Transform2D=world.get(parent,Transform2D.IDENTITY)
		world[b.id]=base*_matrix(float(b.x)+v.x,float(b.y)+v.y,float(b.rotation)+v.rotation,float(b.scale)*v.scale)
	return world

static func pose(compiled: Dictionary, action: Dictionary, progress: float, layers: Array) -> Dictionary:
	if compiled.is_empty():return {"layers":{},"bones":{},"expressions":{},"ik":{}}
	var locals: Dictionary={}
	for b in compiled.order:
		var track: Dictionary=action.get("boneTracks",{}).get(b.id,{})
		locals[b.id]={"x":_sample(track.get("x",[]),progress,0),"y":_sample(track.get("y",[]),progress,0),"rotation":_sample(track.get("rotation",[]),progress,0),"scale":_sample(track.get("scale",[]),progress,1),"opacity":_sample(track.get("opacity",[]),progress,1)}
	var solved := Deformation.solve(compiled,action,progress,locals,func():return _world(compiled.order,locals),_sample)
	var world: Dictionary=solved.world
	var bones: Dictionary = {}
	var result: Dictionary = {}
	for b in compiled.order:
		var parent: String = str(b.parentId) if b.get("parentId") != null else ""
		var posed: Transform2D=world[b.id]
		var initial: Transform2D = compiled.rest[b.id]
		var delta := posed * initial.affine_inverse()
		world[b.id] = posed
		bones[b.id] = {"matrix":delta,"opacity":float(locals[b.id].opacity)*float(bones.get(parent,{}).get("opacity",1))}
	for binding in compiled.bindings:
		result[binding.layerId] = bones[binding.boneId].duplicate()
		result[binding.layerId].opacity*=_sample(action.get("layerTracks",{}).get(binding.layerId,{}).get("opacity",[]),progress,float(binding.get("opacity",1)))
	for l in layers:
		if not result.has(l.id) and result.has(l.get("splitSourceId","")):result[l.id]=result[l.splitSourceId]
	var expressions: Dictionary={}
	for e in compiled.expressions:expressions[e.id]=_sample(action.get("expressionTracks",{}).get(e.id,{}).get("value",[]),progress,float(e.value))
	return {"layers":result,"bones":bones,"expressions":expressions,"ik":solved.diagnostics,"deforms":Deformation.deforms(action,progress)}

static func apply(base: Transform3D, registration: float, pose: Dictionary) -> Transform3D:
	if pose.is_empty():return base
	var delta: Transform2D = pose.matrix
	var pixel := Vector2(512.0+base.origin.x/registration*1024.0,768.0-base.origin.y/registration*1024.0)
	var placed := delta * pixel
	var result := base
	result.origin.x=(placed.x-512.0)/1024.0*registration
	result.origin.y=-(placed.y-768.0)/1024.0*registration
	var turn := Basis(Vector3(0,0,1),-delta.get_rotation())
	result.basis=turn*base.basis
	result.basis.x*=delta.x.length()
	result.basis.y*=delta.x.length()
	return result
