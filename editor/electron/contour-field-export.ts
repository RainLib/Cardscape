import { deflateSync } from 'node:zlib';
import { frameModel } from './export-models';
/** Opaque RGBA data PNG: no premultiplied alpha, lossy encoding or color profile. */
export function contourFieldPNG(style: unknown): Buffer | null {
  const field = frameModel.distanceField(style);
  if (!field) return null;
  return encodeContourFieldPNG(field);
}
export function encodeContourFieldPNG(field: {
  width: number;
  height: number;
  data: Uint8Array;
}): Buffer {
  function crc(bytes: Buffer) {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  }
  function chunk(type: string, data: Buffer) {
    const tag = Buffer.from(type),
      out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length);
    tag.copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([tag, data])), data.length + 8);
    return out;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(field.width);
  header.writeUInt32BE(field.height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = field.width * 4,
    rows = Buffer.alloc((stride + 1) * field.height);
  for (let y = 0; y < field.height; y++)
    rows.set(
      field.data.subarray(y * stride, (y + 1) * stride),
      y * (stride + 1) + 1,
    );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
