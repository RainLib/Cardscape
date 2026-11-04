import Model from '../animation/action-audio-model.ts';
import type { ActionAudioState, CharacterAction } from '../../shared/character';
interface Clip {
  refs: number;
  bytes: number;
  promise: Promise<AudioBuffer>;
  abort: AbortController;
}
let context: AudioContext | null = null;
let leases = 0,
  totalBytes = 0,
  totalVoices = 0;
const clips = new Map<string, Clip>();
const maxBytes = 64 * 1024 * 1024;
function acquire(src: string, ctx: AudioContext) {
  const existing = clips.get(src);
  if (existing) {
    existing.refs++;
    return existing;
  }
  if (clips.size >= 32) throw Error('共享音频素材超过 32 项');
  const abort = new AbortController();
  const entry: Clip = {
    refs: 1,
    bytes: 0,
    abort,
    promise: Promise.resolve(null as unknown as AudioBuffer),
  };
  entry.promise = (async () => {
    const response = await fetch(src, { signal: abort.signal });
    if (!response.ok) throw Error('音效素材下载失败');
    const length = Number(response.headers.get('content-length'));
    if (length > Model.limits.bytes) throw Error('音效素材超过 8 MiB');
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > Model.limits.bytes) throw Error('音效素材超过 8 MiB');
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    } else {
      const data = new Uint8Array(await response.arrayBuffer());
      size = data.length;
      chunks.push(data);
    }
    if (size > Model.limits.bytes) throw Error('音效素材超过 8 MiB');
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const part of chunks) {
      bytes.set(part, at);
      at += part.length;
    }
    if (
      String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' ||
      String.fromCharCode(...bytes.slice(8, 12)) !== 'WAVE'
    )
      throw Error('音效需要 PCM WAV 文件');
    const info = Model.wav(bytes);
    // Reserve before decoding: concurrent cards cannot all pass the same free
    // memory check and allocate many large PCM buffers in parallel.
    const reservation =
      Math.ceil(info.duration * (ctx.sampleRate || 48000)) * info.channels * 4;
    if (entry.refs <= 0 || context !== ctx) throw Error('音效载入已取消');
    if (totalBytes + reservation > maxBytes)
      throw Error('音效解码超出共享 64 MiB 预算');
    entry.bytes = reservation;
    totalBytes += reservation;
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    const storage = buffer.length * buffer.numberOfChannels * 4;
    if (
      buffer.duration > 30.01 ||
      buffer.numberOfChannels > 2 ||
      totalBytes - entry.bytes + storage > maxBytes
    )
      throw Error('音效解码超出共享 64 MiB 预算');
    if (entry.refs <= 0 || context !== ctx) throw Error('音效载入已取消');
    totalBytes += storage - entry.bytes;
    entry.bytes = storage;
    return buffer;
  })().catch((reason) => {
    totalBytes -= entry.bytes;
    entry.bytes = 0;
    throw reason;
  });
  clips.set(src, entry);
  return entry;
}
function release(src: string) {
  const clip = clips.get(src);
  if (!clip) return;
  if (--clip.refs <= 0) {
    clip.abort.abort();
    totalBytes -= clip.bytes;
    clip.bytes = 0;
    clips.delete(src);
  }
}
function create() {
  let enabled = false,
    disposed = false,
    ctx: AudioContext | null = null,
    master: GainNode | null = null,
    meter: AnalyserNode | null = null;
  let starts = 0,
    error = '',
    epoch = 0,
    clock = 0,
    seconds = 0,
    running = false,
    action: CharacterAction | null = null;
  const assets = new Map<
    string,
    { clip: Clip; buffer?: AudioBuffer; failed?: boolean }
  >();
  const voices = new Map<
    string,
    {
      source: AudioBufferSourceNode;
      gain: GainNode;
      signature: string;
      offset: number;
      at: number;
      rate: number;
    }
  >();
  const finished = new Set<string>();
  function stop(key: string) {
    const v = voices.get(key);
    if (!v) return;
    voices.delete(key);
    totalVoices--;
    v.source.onended = null;
    try {
      v.source.stop();
    } catch {}
    v.source.disconnect();
    v.gain.disconnect();
  }
  function silence() {
    for (const key of voices.keys()) stop(key);
    finished.clear();
  }
  function reset() {
    epoch++;
    silence();
    for (const src of assets.keys()) release(src);
    assets.clear();
    error = '';
    action = null;
    running = false;
  }
  function reconcile(at: number) {
    if (
      !enabled ||
      !ctx ||
      !master ||
      disposed ||
      !running ||
      ctx.state !== 'running'
    ) {
      silence();
      return;
    }
    const cues = Model.cues(action, at),
      wanted = new Set(cues.map((c) => c.key));
    for (const key of voices.keys()) if (!wanted.has(key)) stop(key);
    for (const key of finished) if (!wanted.has(key)) finished.delete(key);
    for (const cue of cues) {
      const e = cue.event,
        signature = JSON.stringify(e);
      let asset = assets.get(e.src);
      if (!asset) {
        try {
          const clip = acquire(e.src, ctx);
          asset = { clip };
          assets.set(e.src, asset);
          const current = asset,
            generation = epoch;
          clip.promise
            .then((buffer) => {
              if (
                disposed ||
                generation !== epoch ||
                assets.get(e.src) !== current
              )
                return;
              if (Math.abs(buffer.duration - e.sourceDuration) > 0.025)
                throw Error('音效长度与工程记录不一致');
              current.buffer = buffer;
              reconcile(
                seconds +
                  (running && ctx?.state === 'running'
                    ? ctx.currentTime - clock
                    : 0),
              );
            })
            .catch((reason) => {
              if (generation === epoch && !disposed) {
                current.failed = true;
                error =
                  reason instanceof Error ? reason.message : String(reason);
              }
            });
        } catch (reason) {
          error = reason instanceof Error ? reason.message : String(reason);
        }
      }
      if (!asset?.buffer || asset.failed || finished.has(cue.key)) continue;
      const old = voices.get(cue.key);
      if (old) {
        const span = e.sourceDuration - e.offset;
        let expected = old.offset + (ctx.currentTime - old.at) * old.rate;
        if (e.loop) expected = e.offset + ((expected - e.offset) % span);
        if (
          old.signature === signature &&
          Math.abs(expected - cue.offset) < 0.1
        )
          continue;
        stop(cue.key);
      }
      if (totalVoices >= 32) continue;
      const source = ctx.createBufferSource(),
        gain = ctx.createGain(),
        now = ctx.currentTime;
      source.buffer = asset.buffer;
      source.playbackRate.value = e.playbackRate;
      source.loop = e.loop;
      source.loopStart = e.offset;
      source.loopEnd = e.sourceDuration;
      const fade = Math.min(0.005, cue.remaining / 2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(e.volume, now + fade);
      gain.gain.setValueAtTime(e.volume, now + cue.remaining - fade);
      gain.gain.linearRampToValueAtTime(0, now + cue.remaining);
      source.connect(gain);
      gain.connect(master);
      voices.set(cue.key, {
        source,
        gain,
        signature,
        offset: cue.offset,
        at: now,
        rate: e.playbackRate,
      });
      totalVoices++;
      starts++;
      source.onended = () => {
        if (voices.get(cue.key)?.source === source) {
          stop(cue.key);
          finished.add(cue.key);
        }
      };
      source.start(now, cue.offset);
      source.stop(now + cue.remaining);
    }
  }
  return {
    async enable(value: boolean) {
      if (disposed) return false;
      if (!value) {
        enabled = false;
        reset();
        master?.disconnect();
        meter?.disconnect();
        master = null;
        meter = null;
        if (ctx) {
          ctx = null;
          if (--leases === 0) {
            const old = context;
            context = null;
            void old?.close().catch(() => {});
          }
        }
        return false;
      }
      try {
        if (!ctx) {
          context ||= new AudioContext({ sampleRate: 48000 });
          ctx = context;
          leases++;
          master = ctx.createGain();
          meter = ctx.createAnalyser();
          meter.fftSize = 256;
          master.connect(meter);
          meter.connect(ctx.destination);
        }
        await ctx.resume();
        if (disposed || !ctx) return false;
        enabled = ctx.state === 'running';
        error = enabled ? '' : '浏览器尚未允许音频，请点击启用音效';
        return enabled;
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
        return false;
      }
    },
    sync(next: CharacterAction | null, time: number, play: boolean) {
      if (disposed) return;
      const now = ctx?.currentTime || 0;
      if (
        next?.id !== action?.id ||
        time < seconds - 1e-6 ||
        (running && Math.abs(time - seconds - (now - clock)) > 0.12)
      )
        silence();
      const wantedSources = new Set(
        (next?.audioEvents || []).map((e) => e.src),
      );
      for (const src of assets.keys())
        if (!wantedSources.has(src)) {
          release(src);
          assets.delete(src);
        }
      action = next;
      seconds = time;
      clock = now;
      running = play;
      reconcile(time);
    },
    stop() {
      running = false;
      silence();
    },
    reset,
    state(): ActionAudioState {
      let level = 0;
      if (meter && enabled) {
        const data = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(data);
        for (const sample of data) level = Math.max(level, Math.abs(sample));
      }
      return {
        enabled,
        context: ctx?.state || 'uninitialized',
        voices: voices.size,
        sources: assets.size,
        decodedBytes: [...assets.values()].reduce(
          (n, a) => n + a.clip.bytes,
          0,
        ),
        starts,
        error,
        level,
      };
    },
    async dispose() {
      await this.enable(false);
      disposed = true;
    },
  };
}
export default { create };
