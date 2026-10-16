extends RefCounted
## Self-owned analytic IK and source-pixel linear blend skinning.

static func _angle_delta(value: float) -> float:
	return atan2(sin(value),cos(value))

static func solve(compiled: Dictionary, action: Dictionary, progress: float, locals: Dictionary, build: Callable, sample_track: Callable) -> Dictionary:
	var world: Dictionary=build.call()
	var diagnostics: Dictionary={}
	for c in compiled.get("constraints",[]):
		var tracks: Dictionary=action.get("ikTracks",{}).get(c.id,{})
		var target := Vector2(sample_track.call(tracks.get("x",[]),progress,float(c.target[0])),sample_track.call(tracks.get("y",[]),progress,float(c.target[1])))
		var mix: float=sample_track.call(tracks.get("mix",[]),progress,float(c.mix))
		var root: Transform2D=world[c.rootId]
		var tip: Transform2D=world[c.tipId]
		var end_offset := Vector2(float(c.end[0]),float(c.end[1]))
		var end := tip*end_offset
		var l1 := root.origin.distance_to(tip.origin)
		var l2 := tip.origin.distance_to(end)
		var distance := root.origin.distance_to(target)
		if mix>0 and l1>.000001 and l2>.000001:
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
		var posed_tip: Transform2D=world[c.tipId]
		var actual := posed_tip*end_offset
		diagnostics[c.id]={"target":target,"actual":actual,"error":actual.distance_to(target),"reachable":distance<=l1+l2+.00001 and distance>=absf(l1-l2)-.00001,"mix":mix}
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
