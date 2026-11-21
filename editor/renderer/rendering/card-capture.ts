import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import {
  BufferTarget,
  CanvasSource,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from 'mediabunny';
import type { PreviewAPI } from '../../shared/preview';
import inspection from './inspection-model.ts';

export type CaptureFormat = 'gif' | 'mp4';
export const widths = [360, 480, 600, 720, 960, 1080] as const;
const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export async function encode(
  preview: Pick<PreviewAPI, 'createCapture'>,
  format: CaptureFormat,
  width: number,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
) {
  if (!widths.some((size) => size === width)) throw Error('不支持此分辨率');
  const period = 3,
    fps = format === 'gif' ? 16 : 60;
  const count = period * fps * (format === 'gif' ? 1 : 2);
  const canvas = document.createElement('canvas'),
    height = width * 1.5;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {
    willReadFrequently: format === 'gif',
  })!;
  const capture = preview.createCapture(canvas);
  async function forEachFrame(write: (i: number) => void | Promise<void>) {
    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      const seconds = (i / fps) % period;
      const view = inspection.sample({ mode: 'float', period }, seconds);
      // A periodic clock keeps moving surface details and the camera continuous at the loop joint.
      const time = 0.85 + 0.46 * (1 - Math.cos(view.progress * Math.PI * 2));
      capture.frame({ ...view, time });
      await write(i);
      if (i % 4 === 0 || i + 1 === count) {
        progress(i + 1, count);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    signal.throwIfAborted();
  }
  try {
    if (format === 'gif') {
      const gif = GIFEncoder();
      await forEachFrame((i) => {
        const pixels = ctx.getImageData(0, 0, width, height).data;
        const palette = quantize(pixels, 256, { format: 'rgb565' });
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const bias = (bayer4[(y % 4) * 4 + (x % 4)]! - 7.5) * 0.56;
            pixels[i] = pixels[i]! + bias;
            pixels[i + 1] = pixels[i + 1]! + bias;
            pixels[i + 2] = pixels[i + 2]! + bias;
          }
        }
        const indices = applyPalette(pixels, palette, 'rgb565');
        // GIF stores centiseconds. Alternate 60/70 ms to total exactly three seconds.
        const delay =
          (Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps)) *
          10;
        gif.writeFrame(indices, width, height, { palette, delay, repeat: 0 });
      });
      gif.finish();
      return new Blob([gif.bytes()], { type: 'image/gif' });
    }
    if (!(await canEncodeVideo('avc', { width, height, frameRate: fps })))
      throw Error('当前浏览器无法编码 H.264 MP4。');
    signal.throwIfAborted();
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target,
    });
    const source = new CanvasSource(canvas, {
      codec: 'avc',
      quality: QUALITY_HIGH,
    });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    try {
      await forEachFrame((i) => source.add(i / fps, 1 / fps));
      source.close();
      await output.finalize();
    } catch (error) {
      await output.cancel();
      throw error;
    }
    if (!target.buffer) throw Error('视频编码没有返回数据');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    capture.dispose();
  }
}
