import type { ParticleWorldPose } from '../../shared/character';

interface Point {
  seconds: number;
  pose: ParticleWorldPose;
}
function validate(pose: ParticleWorldPose) {
  if (
    !Array.isArray(pose.angle) ||
    pose.angle.length !== 2 ||
    !Array.isArray(pose.root) ||
    pose.root.length !== 5
  )
    throw Error('世界空间粒子变换无效');
  for (const value of pose.angle)
    if (!Number.isFinite(value)) throw Error('世界空间粒子变换无效');
  for (const value of pose.root)
    if (!Number.isFinite(value)) throw Error('世界空间粒子变换无效');
  if (pose.root[3] < 0) throw Error('世界空间粒子变换无效');
}
function copy(pose: ParticleWorldPose): ParticleWorldPose {
  validate(pose);
  return { angle: [...pose.angle], root: [...pose.root] };
}
/** A bounded history of game/inspection placement, separate from analytic action tracks.
 * Repeated paused draws and reverse seeks never rewrite already observed history.
 * Unobserved times hold the nearest placement; games can supply an exact sampler. */
function history() {
  const points: Point[] = [];
  let latest: Point | undefined;
  return {
    clear() {
      points.length = 0;
      latest = undefined;
    },
    get size() {
      return points.length + (latest && points.at(-1) !== latest ? 1 : 0);
    },
    record(seconds: number, pose: ParticleWorldPose) {
      if (!Number.isFinite(seconds) || seconds < 0)
        throw Error('粒子历史时间无效');
      if (latest && seconds <= latest.seconds) return;
      latest = { seconds, pose: copy(pose) };
      if (!points.length || seconds - points.at(-1)!.seconds >= 1 / 60) {
        points.push(latest);
        if (points.length > 1023) points.shift();
      }
    },
    sample(seconds: number): ParticleWorldPose | undefined {
      if (!latest) return undefined;
      if (!Number.isFinite(seconds)) throw Error('粒子历史时间无效');
      let left = points[0] || latest;
      if (seconds <= left.seconds) return copy(left.pose);
      // Binary search avoids scanning a whole action for every particle.
      let lo = 0,
        hi = points.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (points[mid].seconds <= seconds) lo = mid + 1;
        else hi = mid;
      }
      if (lo) left = points[lo - 1];
      const right = points[lo] || latest;
      if (right.seconds <= left.seconds || seconds >= right.seconds)
        return copy(right.pose);
      const t = (seconds - left.seconds) / (right.seconds - left.seconds);
      const angle = (a: number, b: number) =>
        a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
      return {
        angle: [
          angle(left.pose.angle[0], right.pose.angle[0]),
          angle(left.pose.angle[1], right.pose.angle[1]),
        ],
        root: left.pose.root.map(
          (v, i) => v + (right.pose.root[i] - v) * t,
        ) as ParticleWorldPose['root'],
      };
    },
  };
}
function transform(
  output: { [index: number]: number },
  at: number,
  pose: ParticleWorldPose,
) {
  validate(pose);
  const [yaw, pitch] = pose.angle,
    [tx, ty, tz, scale, opacity] = pose.root;
  const x = output[at],
    y = output[at + 1],
    z = output[at + 2];
  const rx = Math.cos(yaw) * x + Math.sin(yaw) * z;
  const rz = -Math.sin(yaw) * x + Math.cos(yaw) * z;
  output[at] = rx * scale + tx;
  output[at + 1] = (Math.cos(pitch) * y - Math.sin(pitch) * rz) * scale + ty;
  output[at + 2] = (Math.sin(pitch) * y + Math.cos(pitch) * rz) * scale + tz;
  output[at + 3] *= scale;
  output[at + 4] *= Math.max(0, Math.min(1, opacity));
}
function visible(pose: ParticleWorldPose, side: string, camera: number) {
  const [yaw, pitch] = pose.angle,
    [x, y, z] = pose.root;
  const front =
    -x * Math.sin(yaw) +
      y * Math.sin(pitch) * Math.cos(yaw) +
      (camera - z) * Math.cos(pitch) * Math.cos(yaw) >=
    0;
  return !((side === 'front' && !front) || (side === 'back' && front));
}
function frame(
  output: { [index: number]: number },
  at: number,
  pose: ParticleWorldPose,
) {
  const [yaw, pitch] = pose.angle;
  output[at] = Math.sin(yaw);
  output[at + 1] = -Math.sin(pitch) * Math.cos(yaw);
  output[at + 2] = Math.cos(pitch) * Math.cos(yaw);
  output[at + 3] = 0;
  output[at + 4] = Math.cos(pitch);
  output[at + 5] = Math.sin(pitch);
}
export default { history, transform, visible, frame };
