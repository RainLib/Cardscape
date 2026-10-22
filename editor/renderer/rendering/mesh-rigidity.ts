/* Any triangle touching a rigid source pixel must keep all its vertices fixed.
 * Sampling only the vertices misses thin weapons between grid points. Cached by
 * the caller on geometry/mask identity, outside the animation/render loop. */

const api = (() => {
  'use strict';
  function locks(
    geometry: { uv: ArrayLike<number>; indices: readonly number[] },
    image:
      | { width: number; height: number; data: ArrayLike<number> }
      | null
      | undefined,
  ) {
    const result = new Float32Array(geometry.uv.length / 2);
    if (!image) return result;
    const { width, height, data } = image;
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const ids = geometry.indices.slice(i, i + 3),
        xs = ids.map((j) => geometry.uv[j * 2] * (width - 1)),
        ys = ids.map((j) => geometry.uv[j * 2 + 1] * (height - 1)),
        x0 = Math.max(0, Math.floor(Math.min(...xs))),
        x1 = Math.min(width - 1, Math.ceil(Math.max(...xs))),
        y0 = Math.max(0, Math.floor(Math.min(...ys))),
        y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
      let maximum = 0;
      outer: for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          maximum = Math.max(maximum, data[(y * width + x) * 4] / 255);
          if (maximum === 1) break outer;
        }
      if (maximum >= 0.5) maximum = 1;
      for (const j of ids) result[j] = Math.max(result[j], maximum);
    }
    return result;
  }
  return { locks };
})();

export default api;
