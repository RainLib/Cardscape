import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import {
  BufferTarget,
  CanvasSource,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from 'mediabunny';
import type { CharacterAction } from '../../shared/character';
import type { PreviewAPI, PreviewCaptureFrame } from '../../shared/preview';
import inspection from './inspection-model.ts';

export type CaptureFormat = 'gif' | 'mp4';
export type CaptureAspect = '2:3' | '9:16';
export type CaptureAction = Pick<CharacterAction, 'id' | 'duration'>;
export const widths = {
  '2:3': [360, 480, 600, 720, 960, 1080],
  '9:16': [360, 540, 720, 900, 1080],
} as const;
export const frameRates = [16, 24, 30, 60] as const;
type FrameRate = (typeof frameRates)[number];

interface CaptureOptions {
  width: number;
  aspect: CaptureAspect;
  fps?: FrameRate;
  action?: CaptureAction;
}

export function captureHeight(width: number, aspect: CaptureAspect) {
  return aspect === '9:16' ? (width * 16) / 9 : (width * 3) / 2;
}

function plan(format: CaptureFormat, options: CaptureOptions) {
  const { action, aspect, width } = options;
  if (!widths[aspect]?.some((size) => size === width))
    throw Error('不支持此分辨率');
  const fps = options.fps ?? (action ? 24 : format === 'gif' ? 16 : 60);
  if (!frameRates.includes(fps) || (format === 'gif' && fps === 60))
    throw Error('不支持此帧率');
  const period = action?.duration ?? 3;
  if (!Number.isFinite(period) || period <= 0 || period > 30)
    throw Error('录制动作时长超出范围');
  const framesPerCycle = Math.max(1, Math.round(period * fps));
  const count = framesPerCycle * (action || format === 'gif' ? 1 : 2);
  function frame(index: number): PreviewCaptureFrame {
    // Sample a complete cycle without duplicating its first frame at the end.
    const seconds = ((index % framesPerCycle) / framesPerCycle) * period;
    if (action)
      return {
        yaw: 0,
        pitch: 0,
        x: 0,
        y: 0,
        time: seconds,
        action: { id: action.id, seconds },
      };
    const view = inspection.sample({ mode: 'float', period }, seconds);
    // Keep the automatic preview's surface clock continuous at the seam.
    return {
      ...view,
      time: 0.85 + 0.46 * (1 - Math.cos(view.progress * Math.PI * 2)),
    };
  }
  return { fps, framesPerCycle, count, frame };
}

function paletteLookup(palette: number[][]) {
  const bins = new Uint8ClampedArray(65536 * 4);
  for (let key = 0; key < 65536; key++) {
    bins[key * 4] = ((key >> 11) << 3) + 4;
    bins[key * 4 + 1] = (((key >> 5) & 63) << 2) + 2;
    bins[key * 4 + 2] = ((key & 31) << 3) + 4;
    bins[key * 4 + 3] = 255;
  }
  return applyPalette(bins, palette, 'rgb565');
}

function ditherer(width: number, height: number, palette: number[][]) {
  const lookup = paletteLookup(palette);
  const indices = new Uint8Array(width * height);
  // Pad both ends so diffusion past the first and last column is discarded.
  let row = new Float32Array((width + 2) * 3);
  let next = new Float32Array(row.length);
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  return (rgba: Uint8ClampedArray) => {
    row.fill(0);
    for (let y = 0; y < height; y++) {
      next.fill(0);
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const i = index * 4,
          j = (x + 1) * 3;
        const r = clamp(rgba[i]! + row[j]!);
        const g = clamp(rgba[i + 1]! + row[j + 1]!);
        const b = clamp(rgba[i + 2]! + row[j + 2]!);
        const color = lookup[((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)]!;
        indices[index] = color;
        const rgb = palette[color]!;
        for (let c = 0; c < 3; c++) {
          const p = j + c;
          const error = ((c === 0 ? r : c === 1 ? g : b) - rgb[c]!) / 16;
          row[p + 3] = row[p + 3]! + 7 * error;
          next[p - 3] = next[p - 3]! + 3 * error;
          next[p] = next[p]! + 5 * error;
          next[p + 3] = next[p + 3]! + error;
        }
      }
      [row, next] = [next, row];
    }
    return indices;
  };
}

export async function encode(
  preview: Pick<PreviewAPI, 'createCapture'>,
  format: CaptureFormat,
  options: CaptureOptions,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
) {
  const { fps, framesPerCycle, count, frame } = plan(format, options);
  const { width, aspect } = options,
    height = captureHeight(width, aspect);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {
    willReadFrequently: format === 'gif',
  })!;
  const capture = preview.createCapture(canvas);
  const sampleCount = format === 'gif' ? Math.min(24, framesPerCycle) : 0;
  const total = count + sampleCount;
  async function report(done: number) {
    progress(done, total);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  async function forEachFrame(write: (i: number) => void | Promise<void>) {
    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      capture.frame(frame(i));
      await write(i);
      if (i % 4 === 0 || i + 1 === count) await report(sampleCount + i + 1);
    }
    signal.throwIfAborted();
  }
  try {
    if (format === 'gif') {
      const sample = document.createElement('canvas');
      sample.width = 144;
      sample.height = captureHeight(sample.width, aspect);
      const sampleCtx = sample.getContext('2d', { willReadFrequently: true })!;
      const stride = sample.width * sample.height * 4;
      const pixels = new Uint8ClampedArray(sampleCount * stride);
      for (let i = 0; i < sampleCount; i++) {
        signal.throwIfAborted();
        capture.frame(frame(Math.floor((i * framesPerCycle) / sampleCount)));
        sampleCtx.drawImage(canvas, 0, 0, sample.width, sample.height);
        pixels.set(
          sampleCtx.getImageData(0, 0, sample.width, sample.height).data,
          i * stride,
        );
        if (i % 4 === 0 || i + 1 === sampleCount) await report(i + 1);
      }
      signal.throwIfAborted();
      const palette = quantize(pixels, 256, { format: 'rgb565' });
      const dither = ditherer(width, height, palette);
      const gif = GIFEncoder();
      await forEachFrame((i) => {
        const indices = dither(ctx.getImageData(0, 0, width, height).data);
        // Round accumulated time so individual centisecond delays do not drift.
        const delay =
          (Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps)) *
          10;
        gif.writeFrame(indices, width, height, {
          palette: i === 0 ? palette : undefined,
          delay,
          repeat: 0,
        });
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
