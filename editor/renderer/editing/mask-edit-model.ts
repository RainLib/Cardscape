interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}
/* Shared brush math and bounded texture patches; coordinates are source pixels. */

const api = (() => {
  'use strict';
  function union(a: Rect | null | undefined, b: Rect) {
    if (!a) return { ...b };
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
  }
  function grayPatch(image: Pixels, rect: Rect | undefined = undefined) {
    const x = Math.max(0, Math.floor(rect?.x ?? 0)),
      y = Math.max(0, Math.floor(rect?.y ?? 0)),
      width = Math.max(
        0,
        Math.min(image.width - x, Math.ceil(rect?.width ?? image.width)),
      ),
      height = Math.max(
        0,
        Math.min(image.height - y, Math.ceil(rect?.height ?? image.height)),
      );
    const data = new Uint8Array(width * height);
    for (let j = 0; j < height; j++)
      for (let i = 0; i < width; i++)
        data[j * width + i] = image.data[((y + j) * image.width + x + i) * 4];
    return { x, y, width, height, data };
  }
  function brush(
    old: number,
    value: number,
    strength: number,
    distance: number,
    hardness = 0,
  ) {
    const edge =
      hardness >= 1
        ? 1
        : distance <= hardness
          ? 1
          : ((1 - distance) / (1 - hardness)) ** 2;
    return Math.round(old + (value - old) * strength * edge);
  }
  function pivotOffset(
    pivot: { u?: number; v?: number } | null | undefined,
    scale: number,
    rotation: number,
  ) {
    const x = ((pivot?.u ?? 0.5) - 0.5) * 1024 * scale,
      y = ((pivot?.v ?? 0.5) - 0.5) * 1536 * scale,
      c = Math.cos(rotation),
      s = Math.sin(rotation);
    return { x: x - (c * x - s * y), y: y - (s * x + c * y) };
  }
  return { union, grayPatch, brush, pivotOffset };
})();

export default api;
