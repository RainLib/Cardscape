extends RefCounted
## Native registered-pixel rigid-part sampler; matches character-animation-model.js.

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
	return {"order":order,"rest":rest,"bindings":rig.get("bindings",[])}

static func _sample(frames: Array, progress: float, fallback: float) -> float:
	if frames.is_empty():return fallback
	if progress <= float(frames[0].at):return float(frames[0].value)
	for i in range(1,frames.size()):
		var a: Dictionary = frames[i-1]
		var b: Dictionary = frames[i]
		if progress <= float(b.at):
			var t := (progress-float(a.at))/(float(b.at)-float(a.at))
			if a.get("ease","linear")=="hold":t=1.0 if progress==float(b.at) else 0.0
			elif a.get("ease","linear")=="smooth":t=t*t*(3.0-2.0*t)
			return lerpf(float(a.value),float(b.value),t)
	return float(frames[-1].value)

static func sample(compiled: Dictionary, action: Dictionary, progress: float, layers: Array) -> Dictionary:
	if compiled.is_empty():return {}
	var world: Dictionary = {}
	var bones: Dictionary = {}
	var result: Dictionary = {}
	for b in compiled.order:
		var parent: String = str(b.parentId) if b.get("parentId") != null else ""
		var track: Dictionary = action.get("boneTracks",{}).get(b.id,{})
		var base: Transform2D = world.get(parent,Transform2D.IDENTITY)
		var posed := base * _matrix(float(b.x)+_sample(track.get("x",[]),progress,0),float(b.y)+_sample(track.get("y",[]),progress,0),float(b.rotation)+_sample(track.get("rotation",[]),progress,0),float(b.scale)*_sample(track.get("scale",[]),progress,1))
		var initial: Transform2D = compiled.rest[b.id]
		var delta := posed * initial.affine_inverse()
		world[b.id] = posed
		bones[b.id] = {"matrix":delta,"opacity":_sample(track.get("opacity",[]),progress,1)*float(bones.get(parent,{}).get("opacity",1))}
	for binding in compiled.bindings:
		result[binding.layerId] = bones[binding.boneId]
	for l in layers:
		if not result.has(l.id) and result.has(l.get("splitSourceId","")):result[l.id]=result[l.splitSourceId]
	return result

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
