const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encode } = require('../dist/renderer/card-capture.js');

test('portrait action GIF captures the timeline once with one shared color table', async (t) => {
  const frames = [];
  let released = false;
  let value = 0;
  const signal = new AbortController().signal;
  t.mock.method(globalThis, 'setTimeout', (callback) =>
    queueMicrotask(callback),
  );
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData: (_x, _y, width, height) => ({
          data: new Uint8ClampedArray(width * height * 4).fill(value),
        }),
      }),
    }),
  };
  t.after(() => delete globalThis.document);
  const preview = {
    createCapture(canvas) {
      assert.deepEqual([canvas.width, canvas.height], [360, 640]);
      return {
        frame(pose) {
          frames.push(pose);
          value = 24 + Math.round(pose.time * 24);
        },
        dispose() {
          released = true;
        },
      };
    },
  };
  const progress = [];
  const gif = await encode(
    preview,
    'gif',
    {
      width: 360,
      aspect: '9:16',
      fps: 24,
      action: { id: 'slash', duration: 4 },
    },
    signal,
    (done, total) => progress.push([done, total]),
  );
  assert.equal(released, true);
  assert.equal(frames.length, 120);
  assert.deepEqual(frames.at(-96).action, { id: 'slash', seconds: 0 });
  assert.deepEqual(frames.at(-1).action, { id: 'slash', seconds: 95 / 24 });
  assert.deepEqual(progress.at(-1), [120, 120]);

  const bytes = Buffer.from(await gif.arrayBuffer());
  assert.equal(bytes.toString('ascii', 0, 6), 'GIF89a');
  assert.equal(bytes.readUInt16LE(6), 360);
  assert.equal(bytes.readUInt16LE(8), 640);
  let offset = 13 + 3 * (2 << (bytes[10] & 7));
  let frameCount = 0;
  let totalDelay = 0;
  const skipBlocks = () => {
    while (bytes[offset]) offset += 1 + bytes[offset];
    offset++;
  };
  while (bytes[offset] !== 0x3b) {
    const type = bytes[offset++];
    if (type === 0x21) {
      if (bytes[offset++] === 0xf9)
        totalDelay += bytes.readUInt16LE(offset + 2);
    } else {
      assert.equal(type, 0x2c);
      assert.equal(bytes[offset + 8] & 0x80, 0);
      offset += 10;
      frameCount++;
    }
    skipBlocks();
  }
  assert.equal(frameCount, 96);
  assert.equal(totalDelay, 400);
  assert.ok(bytes.includes(Buffer.from('NETSCAPE2.0\x03\x01\x00\x00')));
});
