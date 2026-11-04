const test = require('node:test'),
  assert = require('node:assert/strict');
const Bounds = require('../dist/renderer/source-alpha-bounds.js');
const make = (width, height, points = []) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, a] of points) data[(y * width + x) * 4 + 3] = a;
  return { width, height, data };
};
test('source support keeps all nonzero alpha and decoded-texel padding, including transparent RGB and image borders', () => {
  const im = make(20, 30, [
    [8, 10, 1],
    [9, 12, 255],
  ]);
  im.data[0] = 255;
  assert.deepEqual(Bounds.pixels(im), [6 / 20, 8 / 30, 12 / 20, 15 / 30]);
  assert.deepEqual(Bounds.pixels(make(8, 8)), [-1, -1, -1, -1]);
  assert.deepEqual(
    Bounds.pixels(
      make(8, 8, [
        [0, 0, 1],
        [7, 7, 1],
      ]),
    ),
    [0, 0, 1, 1],
  );
  assert.deepEqual(
    Bounds.pixels({ width: 4, height: 4, data: [] }),
    [0, 0, 1, 1],
  );
});
test('conservative source support never excludes a covered linear-clamp sample under crops, shift and back mirroring', () => {
  for (const points of [
    [
      [8, 10, 15],
      [9, 11, 1],
      [12, 17, 255],
    ],
    [[0, 2, 255]],
    [[16, 22, 255]],
    [],
  ]) {
    const im = make(17, 23, points),
      b = Bounds.pixels(im);
    const clamp = (n, a, c) => Math.max(a, Math.min(c, n));
    const alpha = (u, v) => {
      const x = clamp(u, 0, 1) * im.width - 0.5,
        y = clamp(v, 0, 1) * im.height - 0.5,
        x0 = Math.floor(x),
        y0 = Math.floor(y),
        s = x - x0,
        t = y - y0;
      let out = 0;
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++)
          out +=
            (im.data[
              (clamp(y0 + j, 0, im.height - 1) * im.width +
                clamp(x0 + i, 0, im.width - 1)) *
                4 +
                3
            ] /
              255) *
            (i ? s : 1 - s) *
            (j ? t : 1 - t);
      return out;
    };
    for (const mirror of [false, true])
      for (let j = -30; j <= 130; j++)
        for (let i = -30; i <= 130; i++) {
          let u = 0.15 + (i / 100) * 0.7 + 0.11,
            v = 0.2 + (j / 100) * 0.9 - 0.08;
          if (mirror) u = 1 - u;
          if (alpha(u, v) < 0.015) continue;
          const x = clamp(u, 0, 1),
            y = clamp(v, 0, 1);
          assert.ok(x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
        }
  }
});
test('mutable or unreadable source objects retain full coverage instead of stale cached support', () => {
  assert.deepEqual(Bounds.image(make(4, 4)), [0, 0, 1, 1]);
  const priorImage = global.HTMLImageElement,
    priorDocument = global.document;
  let scans = 0;
  class Image {
    constructor() {
      this.naturalWidth = 8;
      this.naturalHeight = 8;
      this.src = 'first';
      this.currentSrc = '';
    }
  }
  global.HTMLImageElement = Image;
  global.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage() {},
        getImageData() {
          scans++;
          return make(8, 8, [[4, 4, 255]]);
        },
      }),
    }),
  };
  try {
    const im = new Image();
    Bounds.image(im);
    Bounds.image(im);
    assert.equal(scans, 1);
    im.src = 'second';
    Bounds.image(im);
    assert.equal(scans, 2);
    global.document = {
      createElement: () => ({
        getContext() {
          throw Error('tainted');
        },
      }),
    };
    assert.deepEqual(Bounds.image(new Image()), [0, 0, 1, 1]);
  } finally {
    if (priorImage === undefined) delete global.HTMLImageElement;
    else global.HTMLImageElement = priorImage;
    if (priorDocument === undefined) delete global.document;
    else global.document = priorDocument;
  }
});
