extends RefCounted
## Game placement is recorded separately from deterministic authored root tracks.
## Unobserved times hold the nearest placement. An exact game sampler can override it.
var points: Array[Dictionary] = []
var latest: Dictionary = {}
func clear() -> void:
	points.clear()
	latest.clear()
func record(seconds: float, placement: Transform3D, pose: Vector3, opacity: float) -> void:
	if not latest.is_empty() and seconds<=float(latest.seconds):return
	latest={"seconds":seconds,"transform":placement,"pose":pose,"opacity":opacity}
	if points.is_empty() or seconds-float(points[-1].seconds)>=1.0/60.0:
		points.append(latest)
		if points.size()>1023:points.pop_front()
func sample(seconds: float) -> Dictionary:
	if latest.is_empty():return {}
	var left: Dictionary=points[0] if not points.is_empty() else latest
	if seconds<=float(left.seconds):return left
	var lo:=0
	var hi:=points.size()
	while lo<hi:
		var mid: int=(lo+hi)/2
		if float(points[mid].seconds)<=seconds:lo=mid+1
		else:hi=mid
	if lo>0:left=points[lo-1]
	var right: Dictionary=points[lo] if lo<points.size() else latest
	if float(right.seconds)<=float(left.seconds) or seconds>=float(right.seconds):return right
	var weight: float=(seconds-float(left.seconds))/(float(right.seconds)-float(left.seconds))
	var a: Vector3=left.pose
	var b: Vector3=right.pose
	return {"transform":(left.transform as Transform3D).interpolate_with(right.transform,weight),"pose":Vector3(lerp_angle(a.x,b.x,weight),lerp_angle(a.y,b.y,weight),lerp_angle(a.z,b.z,weight)),"opacity":lerpf(float(left.opacity),float(right.opacity),weight)}
