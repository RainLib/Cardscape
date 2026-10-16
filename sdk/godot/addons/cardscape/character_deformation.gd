extends RefCounted
## Self-owned deterministic IK; matches character-ik-model.js.
static func _angle_delta(value: float) -> float:
	return atan2(sin(value),cos(value))

static func _chain(compiled: Dictionary, c: Dictionary) -> Array:
	var by_id: Dictionary={}
	for b in compiled.order: by_id[b.id]=b
	var result: Array=[]
	var id: String=c.tipId
	while by_id.has(id):
		result.push_front(id)
		if id==c.rootId: return result
		id=str(by_id[id].parentId)
	return []

static func _target(c: Dictionary, offset: Vector2, world: Dictionary) -> Vector2:
	return world[c.targetBoneId]*offset if c.has("targetBoneId") else offset

static func _rotate(id: String, degrees: float, locals: Dictionary, limits: Dictionary) -> bool:
	var wanted: float=locals[id].rotation+degrees
	locals[id].rotation=clampf(wanted,float(limits[id].min),float(limits[id].max)) if limits.has(id) else wanted
	return absf(wanted-locals[id].rotation)>.000001

static func solve(compiled: Dictionary, action: Dictionary, progress: float, locals: Dictionary, build: Callable, sample_track: Callable) -> Dictionary:
	var world: Dictionary=build.call()
	var diagnostics: Dictionary={}
	var entries: Array=[]
	var records: Array=[]
	for i in compiled.get("constraints",[]).size(): entries.append({"c":compiled.constraints[i],"i":i})
	entries.sort_custom(func(a: Dictionary,b: Dictionary): return int(a.c.get("order",a.i))<int(b.c.get("order",b.i)) if int(a.c.get("order",a.i))!=int(b.c.get("order",b.i)) else int(a.i)<int(b.i))
	for entry in entries:
		var c: Dictionary=entry.c
		var tracks: Dictionary=action.get("ikTracks",{}).get(c.id,{})
		var offset := Vector2(sample_track.call(tracks.get("x",[]),progress,float(c.target[0])),sample_track.call(tracks.get("y",[]),progress,float(c.target[1])))
		var target: Vector2=_target(c,offset,world)
		var mix: float=sample_track.call(tracks.get("mix",[]),progress,float(c.mix)) if c.get("enabled",true) else 0.0
		var root: Transform2D=world[c.rootId]
		var tip: Transform2D=world[c.tipId]
		var end_offset := Vector2(float(c.end[0]),float(c.end[1]))
		var end: Vector2=tip*end_offset
		var chain: Array=_chain(compiled,c)
		var lengths: Array=[]
		for i in range(1,chain.size()): lengths.append(world[chain[i-1]].origin.distance_to(world[chain[i]].origin))
		lengths.append(tip.origin.distance_to(end))
		var iterations: int=0
		var limited: bool=false
		if mix>0 and c.get("solver","analytic")=="analytic":
			var l1: float=lengths[0]
			var l2: float=lengths[1]
			var distance: float=root.origin.distance_to(target)
			if l1>.000001 and l2>.000001:
				var reach := clampf(distance,absf(l1-l2)+.000001,l1+l2-.000001)
				var aim := (target-root.origin).angle() if distance>.000001 else (tip.origin-root.origin).angle()
				var theta := aim-float(c.bend)*acos(clampf((reach*reach+l1*l1-l2*l2)/(2*reach*l1),-1,1))
				var wanted_root := root.get_rotation()+_angle_delta(theta-(tip.origin-root.origin).angle())
				var desired_elbow := root.origin+Vector2(cos(theta),sin(theta))*l1
				var clamped_target := root.origin+Vector2(cos(aim),sin(aim))*reach
				var wanted_tip := (clamped_target-desired_elbow).angle()-end_offset.angle()
				locals[c.rootId].rotation+=rad_to_deg(_angle_delta(wanted_root-root.get_rotation()))*mix
				world=build.call()
				var after: Transform2D=world[c.tipId]
				locals[c.tipId].rotation+=rad_to_deg(_angle_delta(wanted_tip-after.get_rotation()))*mix
				world=build.call()
				iterations=1
		elif mix>0:
			var initial: Dictionary={}
			var limits: Dictionary={}
			for l in c.get("limits",[]): limits[l.boneId]=l
			for id in chain:
				initial[id]=float(locals[id].rotation)
				limited=_rotate(id,0,locals,limits) or limited
				world=build.call()
			var total: float=0.0
			for length in lengths: total+=float(length)
			if chain.size()>1 and root.origin.distance_to(target)<total-.001:
				var current: Vector2=world[c.tipId]*end_offset
				var cross: float=(current-root.origin).cross(target-root.origin)
				if absf(cross)<.000001 and world[chain[-1]].origin.distance_to(current)>.001:
					limited=_rotate(chain[-1],float(c.bend)*.5,locals,limits) or limited
					world=build.call()
			for i in int(c.get("iterations",48)):
				var current: Vector2=world[c.tipId]*end_offset
				if current.distance_to(target)<=float(c.get("tolerance",.05)): break
				for j in range(chain.size()-1,-1,-1):
					var id: String=chain[j]
					var pivot: Vector2=world[id].origin
					var actual: Vector2=world[c.tipId]*end_offset
					var a: Vector2=actual-pivot
					var b: Vector2=target-pivot
					if a.length()>.0000001 and b.length()>.0000001:
						limited=_rotate(id,rad_to_deg(_angle_delta(b.angle()-a.angle())),locals,limits) or limited
						world=build.call()
				iterations=i+1
			if mix<1:
				for id in chain:
					locals[id].rotation=initial[id]+(locals[id].rotation-initial[id])*mix
					if limits.has(id): locals[id].rotation=clampf(locals[id].rotation,float(limits[id].min),float(limits[id].max))
				world=build.call()
		records.append({"c":c,"offset":offset,"mix":mix,"chain":chain,"lengths":lengths,"iterations":iterations,"limited":limited})
	for record in records:
		var c: Dictionary=record.c
		var target: Vector2=_target(c,record.offset,world)
		var actual: Vector2=world[c.tipId]*Vector2(float(c.end[0]),float(c.end[1]))
		var reach: float=0
		var longest: float=0
		for length in record.lengths:
			reach+=float(length)
			longest=maxf(longest,float(length))
		var distance: float=world[c.rootId].origin.distance_to(target)
		var error: float=actual.distance_to(target)
		diagnostics[c.id]={"target":target,"actual":actual,"error":error,"reachable":distance<=reach+.00001 and distance>=maxf(0,longest*2-reach)-.00001,"mix":record.mix,"enabled":c.get("enabled",true),"solver":c.get("solver","analytic"),"iterations":record.iterations,"limited":record.limited,"converged":error<=float(c.get("tolerance",.05)),"chain":record.chain}
	return {"world":world,"diagnostics":diagnostics}

static func geometry(mesh: Dictionary, pose: Dictionary, base: Transform3D, registration: float, camera: float=2.7) -> PackedVector3Array:
	var vertices: Array=mesh.vertices.duplicate()
	for morph in mesh.morphs:
		var value: float=pose.expressions.get(morph.expressionId,0)
		for j in range(0,morph.deltas.size(),3):
			var i: int=int(morph.deltas[j])*2
			vertices[i]+=float(morph.deltas[j+1])*value
			vertices[i+1]+=float(morph.deltas[j+2])*value
	var inverse := base.affine_inverse()
	var positions := PackedVector3Array()
	for i in range(vertices.size()/2):
		var local := Vector3(float(vertices[i*2])/1024.0-.5,.75-float(vertices[i*2+1])/1024.0,0)
		var placed := base*local
		var pixel := Vector2(512+placed.x/registration*1024,768-placed.y/registration*1024)
		var weighted := Vector2.ZERO
		for weight in mesh.weights[i]:
			var bone: Transform2D=pose.bones[weight.boneId].matrix
			weighted+=(bone*pixel)*float(weight.weight)
		var depth: float=mesh.get("depths",[])[i] if mesh.has("depths") else 0.0
		var vertex_registration := registration-depth/(camera-.045)
		positions.append(inverse*Vector3((weighted.x-512)/1024.0*vertex_registration,-(weighted.y-768)/1024.0*vertex_registration,base.origin.z+depth))
	return positions
