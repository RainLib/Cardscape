import type { ParticlePhysics, ParticleVector } from '../../shared/character';

interface Segment {
  at: number;
  p: ParticleVector;
  v: ParticleVector;
  g: ParticleVector;
}
interface Path {
  segments: Segment[];
  deadAt: number;
}
const EPS = 1e-7,
  SKIN = 1e-6,
  SLEEP = 0.02;
const dot = (a: ParticleVector, b: ParticleVector) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (
  a: ParticleVector,
  b: ParticleVector,
  scale = 1,
): ParticleVector => [
  a[0] + b[0] * scale,
  a[1] + b[1] * scale,
  a[2] + b[2] * scale,
];
const position = (s: Segment, t: number) =>
  add(add(s.p, s.v, t), s.g, t * t * 0.5);
function validate(value: unknown): ParticlePhysics {
  if (!value || typeof value !== 'object') throw Error('粒子物理配置无效');
  const p = value as Record<string, unknown>;
  if (
    p.schema !== 'card-particle-physics/1' ||
    Object.keys(p).some(
      (key) =>
        ![
          'schema',
          'velocity',
          'spread',
          'gravity',
          'radius',
          'restitution',
          'friction',
          'response',
          'maxBounces',
          'planes',
        ].includes(key),
    )
  )
    throw Error('不支持的粒子物理格式或字段');
  const vector = (v: unknown, limit: number, positive = false) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(
      (x) =>
        typeof x === 'number' &&
        Number.isFinite(x) &&
        Math.abs(x) <= limit &&
        (!positive || x >= 0),
    );
  const range = (v: unknown, a: number, b: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
  if (
    !vector(p.velocity, 10) ||
    !vector(p.spread, 10, true) ||
    !vector(p.gravity, 20) ||
    !range(p.radius, 0, 0.2) ||
    !range(p.restitution, 0, 1) ||
    !range(p.friction, 0, 1) ||
    !['bounce', 'slide', 'kill'].includes(String(p.response)) ||
    !Number.isInteger(p.maxBounces) ||
    !range(p.maxBounces, 0, 32) ||
    !Array.isArray(p.planes) ||
    p.planes.length > 8
  )
    throw Error('粒子物理参数超出范围');
  const ids = new Set<string>();
  for (const raw of p.planes) {
    if (!raw || typeof raw !== 'object') throw Error('粒子碰撞平面无效');
    const plane = raw as Record<string, unknown>;
    if (
      Object.keys(plane).some(
        (key) => !['id', 'normal', 'distance'].includes(key),
      )
    )
      throw Error('不支持的粒子碰撞平面字段');
    if (
      typeof plane.id !== 'string' ||
      !plane.id ||
      plane.id.length > 80 ||
      ids.has(plane.id) ||
      !vector(plane.normal, 1) ||
      !range(plane.distance, -10, 10) ||
      Math.hypot(...(plane.normal as ParticleVector)) < 0.0001
    )
      throw Error('粒子碰撞平面需要唯一 ID 和非零法线');
    ids.add(plane.id);
  }
  return value as ParticlePhysics;
}
function defaults(): ParticlePhysics {
  return {
    schema: 'card-particle-physics/1',
    velocity: [0, 0.35, 0],
    spread: [0.25, 0.15, 0],
    gravity: [0, -1.5, 0],
    radius: 0.008,
    restitution: 0.55,
    friction: 0.15,
    response: 'bounce',
    maxBounces: 8,
    planes: [{ id: 'floor', normal: [0, 1, 0], distance: -0.6 }],
  };
}
/** Earliest entering root of a*t²+b*t+c, without a frame-sized tunnelling gap. */
function hit(a: number, b: number, c: number, limit: number) {
  if (Math.abs(a) < EPS)
    return b < -EPS && -c / b > EPS && -c / b <= limit ? -c / b : Infinity;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(disc));
  const roots = q === 0 ? [-b / (2 * a)] : [q / a, c / q];
  let first = Infinity;
  for (const t of roots)
    if (t > EPS && t <= limit && 2 * a * t + b < -EPS)
      first = Math.min(first, t);
  return first;
}
function compile(
  config: ParticlePhysics,
  p: ParticleVector,
  v: ParticleVector,
  duration: number,
): Path {
  const planes = config.planes.map((plane) => {
    const length = Math.hypot(...plane.normal);
    return {
      n: plane.normal.map((x) => x / length) as ParticleVector,
      d: plane.distance + config.radius,
    };
  });
  let at = 0,
    velocity: ParticleVector = [...v],
    point: ParticleVector = [...p],
    impacts = 0;
  const segments: Segment[] = [];
  // Initial penetration is resolved in a bounded deterministic order. Infeasible
  // intersections retire the particle instead of emitting NaN or looping.
  for (let pass = 0; pass < 8; pass++)
    for (const plane of planes) {
      const depth = plane.d - dot(plane.n, point);
      if (depth > 0) point = add(point, plane.n, depth + SKIN);
    }
  if (planes.some((plane) => dot(plane.n, point) < plane.d - SKIN))
    return { segments: [], deadAt: 0 };
  while (at <= duration + EPS) {
    let gravity: ParticleVector = [...config.gravity];
    for (const plane of planes)
      if (dot(plane.n, point) - plane.d <= SKIN * 2) {
        let speed = dot(velocity, plane.n);
        if (speed < -EPS) {
          if (config.response === 'kill' || impacts >= config.maxBounces)
            return { segments, deadAt: at };
          impacts++;
          const tangent = add(velocity, plane.n, -speed);
          velocity = add(
            tangent.map((x) => x * (1 - config.friction)) as ParticleVector,
            plane.n,
            config.response === 'slide' ? 0 : -speed * config.restitution,
          );
          speed = dot(velocity, plane.n);
        }
        if (Math.abs(speed) <= SLEEP) {
          velocity = add(velocity, plane.n, -speed);
          const force = dot(gravity, plane.n);
          if (force < 0) gravity = add(gravity, plane.n, -force);
        }
      }
    const segment: Segment = { at, p: point, v: velocity, g: gravity };
    segments.push(segment);
    let elapsed = Infinity,
      normal: ParticleVector | undefined;
    for (const plane of planes) {
      const t = hit(
        0.5 * dot(gravity, plane.n),
        dot(velocity, plane.n),
        dot(point, plane.n) - plane.d,
        duration - at,
      );
      if (t < elapsed) {
        elapsed = t;
        normal = plane.n;
      }
    }
    if (!normal || !Number.isFinite(elapsed))
      return { segments, deadAt: Infinity };
    at += elapsed;
    point = position(segment, elapsed);
    velocity = add(velocity, gravity, elapsed);
    if (config.response === 'kill' || impacts >= config.maxBounces)
      return { segments, deadAt: at };
    impacts++;
    const incoming = dot(velocity, normal);
    const tangent = add(velocity, normal, -incoming);
    velocity = add(
      tangent.map((x) => x * (1 - config.friction)) as ParticleVector,
      normal,
      config.response === 'slide' ? 0 : -incoming * config.restitution,
    );
    point = add(point, normal, SKIN);
  }
  return { segments, deadAt: Infinity };
}
function cache() {
  const paths = new Map<string, Path>();
  const prepare = (config: ParticlePhysics) => {
    validate(config);
    const prefix = JSON.stringify(config);
    return (
      p: ParticleVector,
      v: ParticleVector,
      seconds: number,
      duration: number,
    ) => {
      if (
        ![...p, ...v, seconds, duration].every(Number.isFinite) ||
        seconds < 0 ||
        duration < 0 ||
        duration > 12
      )
        throw Error('粒子物理采样无效');
      const key = prefix + JSON.stringify([p, v, duration]);
      let path = paths.get(key);
      if (!path) {
        path = compile(config, p, v, duration);
        paths.set(key, path);
        if (paths.size > 256) paths.delete(paths.keys().next().value!);
      }
      let segment = path.segments[0];
      for (const candidate of path.segments) {
        if (candidate.at > seconds) break;
        segment = candidate;
      }
      if (!segment)
        return { position: p, velocity: v, alive: false, contacts: 0 };
      const t = Math.max(0, Math.min(seconds, path.deadAt) - segment.at);
      return {
        position: position(segment, t),
        velocity: add(segment.v, segment.g, t),
        alive: seconds < path.deadAt,
        contacts: path.segments.indexOf(segment),
      };
    };
  };
  return {
    get size() {
      return paths.size;
    },
    clear() {
      paths.clear();
    },
    sample(
      config: ParticlePhysics,
      p: ParticleVector,
      v: ParticleVector,
      seconds: number,
      duration: number,
    ) {
      return prepare(config)(p, v, seconds, duration);
    },
    prepare,
  };
}
/** Physical mode has a common emitter distribution for every particle visual. */
function launch(
  seed: number,
  index: number,
  e: { shape: string; u: number; v: number; width: number; height: number },
  config: ParticlePhysics,
  cut = 0,
) {
  const hash = (i: number) => {
    const x = Math.sin((i + 1) * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const edge = hash(index + 379) * 4;
  let x =
    edge < 1 ? edge - 0.5 : edge < 2 ? 0.5 : edge < 3 ? 0.5 - (edge - 2) : -0.5;
  let y =
    edge < 1
      ? 0.75
      : edge < 2
        ? 0.75 - (edge - 1) * 1.5
        : edge < 3
          ? -0.75
          : -0.75 + (edge - 3) * 1.5;
  if (e.shape === 'point') {
    x = 0;
    y = 0;
  }
  if (e.shape === 'rect') {
    x = hash(index + 17) - 0.5;
    y = (hash(index + 29) - 0.5) * 1.5;
  }
  if (e.shape === 'ellipse') {
    const angle = hash(index + 61) * Math.PI * 2,
      r = Math.sqrt(hash(index + 29));
    x = Math.cos(angle) * r * 0.5;
    y = Math.sin(angle) * r * 0.75;
  }
  x = x * e.width + e.u - 0.5;
  y = y * e.height + (0.5 - e.v) * 1.5;
  if (cut > 0) {
    const excess = Math.max(0, Math.abs(x) + Math.abs(y) - (1.25 - cut));
    x -= Math.sign(x) * excess * 0.5;
    y -= Math.sign(y) * excess * 0.5;
  }
  return {
    position: [x, y, 0] as ParticleVector,
    velocity: config.velocity.map(
      (value, k) =>
        value + (hash(index + 907 + k * 37) * 2 - 1) * config.spread[k],
    ) as ParticleVector,
  };
}
export default { validate, defaults, cache, launch };
