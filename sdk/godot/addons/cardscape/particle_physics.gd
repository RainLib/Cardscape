extends RefCounted
## Analytic ballistic segments and continuous plane contacts. Numeric cache only.
const EPS:=1e-7
const SKIN:=1e-6
const SLEEP:=.02
var paths: Dictionary={}
static func _vector(value: Variant, limit: float, positive: bool=false) -> bool:
	if not value is Array or value.size()!=3:return false
	for number in value:
		if not typeof(number) in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(number)) or absf(float(number))>limit or positive and float(number)<0:return false
	return true
static func valid(p: Dictionary) -> bool:
	if p.get("schema","")!="card-particle-physics/1":return false
	for key in p:
		if not key in ["schema","velocity","spread","gravity","radius","restitution","friction","response","maxBounces","planes"]:return false
	if not _vector(p.get("velocity"),10) or not _vector(p.get("spread"),10,true) or not _vector(p.get("gravity"),20):return false
	for entry in [["radius",0,.2],["restitution",0,1],["friction",0,1],["maxBounces",0,32]]:
		var value: Variant=p.get(entry[0])
		if not typeof(value) in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(value)) or float(value)<entry[1] or float(value)>entry[2]:return false
	if float(p.maxBounces)!=floorf(float(p.maxBounces)) or not p.get("response","") in ["bounce","slide","kill"]:return false
	if not p.get("planes") is Array or p.planes.size()>8:return false
	var ids: Dictionary={}
	for plane in p.planes:
		if not plane is Dictionary or not plane.get("id") is String or plane.id.is_empty() or plane.id.length()>80 or ids.has(plane.id):return false
		if not _vector(plane.get("normal"),1) or Vector3(plane.normal[0],plane.normal[1],plane.normal[2]).length()<.0001:return false
		for key in plane:
			if not key in ["id","normal","distance"]:return false
		if not typeof(plane.get("distance")) in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(plane.distance)) or absf(float(plane.distance))>10:return false
		ids[plane.id]=true
	return true
func clear() -> void:paths.clear()
func prepare(config: Dictionary) -> String:
	if not valid(config):
		push_error("Invalid particle physics configuration")
		return ""
	return var_to_bytes(config).hex_encode()
static func _position(segment: Dictionary, t: float) -> Vector3:
	return segment.p+segment.v*t+segment.g*(t*t*.5)
static func _hit(a: float,b: float,c: float,limit: float) -> float:
	if absf(a)<EPS:return -c/b if b < -EPS and -c/b>EPS and -c/b<=limit else INF
	var disc:=b*b-4*a*c
	if disc<0:return INF
	var q: float=-.5*(b+(1.0 if b>=0 else -1.0)*sqrt(disc))
	var roots: Array=[-b/(2*a)] if q==0 else [q/a,c/q]
	var first:=INF
	for t in roots:
		if t>EPS and t<=limit and 2*a*t+b < -EPS:first=minf(first,t)
	return first
static func _compile(config: Dictionary, p: Vector3, v: Vector3,duration: float) -> Dictionary:
	var planes: Array=[]
	for plane in config.planes:planes.append({"n":Vector3(plane.normal[0],plane.normal[1],plane.normal[2]).normalized(),"d":float(plane.distance)+float(config.radius)})
	var at:=0.0
	var velocity:=v
	var point:=p
	var impacts:=0
	var segments: Array=[]
	for pass_index in 8:
		for plane in planes:
			var depth: float=float(plane.d)-plane.n.dot(point)
			if depth>0:point+=plane.n*(depth+SKIN)
	for plane in planes:
		if plane.n.dot(point)<float(plane.d)-SKIN:return {"segments":[],"deadAt":0.0}
	while at<=duration+EPS:
		var gravity:=Vector3(config.gravity[0],config.gravity[1],config.gravity[2])
		for plane in planes:
			if plane.n.dot(point)-float(plane.d)>SKIN*2:continue
			var speed: float=velocity.dot(plane.n)
			if speed < -EPS:
				if config.response=="kill" or impacts>=int(config.maxBounces):return {"segments":segments,"deadAt":at}
				impacts+=1
				var tangent: Vector3=velocity-plane.n*speed
				velocity=tangent*(1-float(config.friction))+plane.n*(0 if config.response=="slide" else -speed*float(config.restitution))
				speed=velocity.dot(plane.n)
			if absf(speed)<=SLEEP:
				velocity-=plane.n*speed
				var force: float=gravity.dot(plane.n)
				if force<0:gravity-=plane.n*force
		var segment: Dictionary={"at":at,"p":point,"v":velocity,"g":gravity}
		segments.append(segment)
		var elapsed:=INF
		var normal:=Vector3.ZERO
		for plane in planes:
			var t:=_hit(.5*gravity.dot(plane.n),velocity.dot(plane.n),point.dot(plane.n)-float(plane.d),duration-at)
			if t<elapsed:elapsed=t;normal=plane.n
		if not is_finite(elapsed):return {"segments":segments,"deadAt":INF}
		at+=elapsed
		point=_position(segment,elapsed)
		velocity+=gravity*elapsed
		if config.response=="kill" or impacts>=int(config.maxBounces):return {"segments":segments,"deadAt":at}
		impacts+=1
		var incoming:=velocity.dot(normal)
		var tangent:=velocity-normal*incoming
		velocity=tangent*(1-float(config.friction))+normal*(0 if config.response=="slide" else -incoming*float(config.restitution))
		point+=normal*SKIN
	return {"segments":segments,"deadAt":INF}
func sample(config: Dictionary,p: Vector3,v: Vector3,seconds: float,duration: float,signature: String="") -> Dictionary:
	if signature.is_empty():signature=prepare(config)
	if signature.is_empty() or not p.is_finite() or not v.is_finite() or not is_finite(seconds) or not is_finite(duration) or seconds<0 or duration<0 or duration>12:return {"position":p,"velocity":v,"alive":false,"contacts":0}
	var key:=signature+var_to_bytes([p,v,duration]).hex_encode()
	if not paths.has(key):
		paths[key]=_compile(config,p,v,duration)
		if paths.size()>256:paths.erase(paths.keys()[0])
	var path: Dictionary=paths[key]
	if path.segments.is_empty():return {"position":p,"velocity":v,"alive":false,"contacts":0}
	var index:=0
	for i in path.segments.size():
		if float(path.segments[i].at)>seconds:break
		index=i
	var segment: Dictionary=path.segments[index]
	var t: float=maxf(0,minf(seconds,path.deadAt)-float(segment.at))
	return {"position":_position(segment,t),"velocity":segment.v+segment.g*t,"alive":seconds<float(path.deadAt),"contacts":index}
static func _hash(seed: int,index: int) -> float:
	var value:=sin((index+1)*127.1+seed*311.7)*43758.5453
	return value-floor(value)
static func launch(seed: int,index: int,e: Dictionary,config: Dictionary,cut: float=0) -> Dictionary:
	var edge:=_hash(seed,index+379)*4
	var x: float=edge-.5 if edge<1 else .5 if edge<2 else .5-(edge-2) if edge<3 else -.5
	var y: float=.75 if edge<1 else .75-(edge-1)*1.5 if edge<2 else -.75 if edge<3 else -.75+(edge-3)*1.5
	if e.shape=="point":x=0;y=0
	if e.shape=="rect":x=_hash(seed,index+17)-.5;y=(_hash(seed,index+29)-.5)*1.5
	if e.shape=="ellipse":
		var angle:=_hash(seed,index+61)*TAU
		var radius:=sqrt(_hash(seed,index+29))
		x=cos(angle)*radius*.5;y=sin(angle)*radius*.75
	x=x*float(e.width)+float(e.u)-.5;y=y*float(e.height)+(.5-float(e.v))*1.5
	if cut>0:
		var excess:=maxf(0,absf(x)+absf(y)-(1.25-cut))
		x-=signf(x)*excess*.5;y-=signf(y)*excess*.5
	var velocity:=Vector3.ZERO
	for axis in 3:velocity[axis]=float(config.velocity[axis])+(_hash(seed,index+907+axis*37)*2-1)*float(config.spread[axis])
	return {"position":Vector3(x,y,0),"velocity":velocity}
