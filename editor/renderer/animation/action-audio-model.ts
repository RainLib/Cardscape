import type { ActionAudioEvent, CharacterAction } from '../../shared/character';
const limits = {
  events: 16,
  voices: 8,
  sourceSeconds: 30,
  bytes: 8 * 1024 * 1024,
};
function validate(action: Pick<CharacterAction, 'duration' | 'audioEvents'>) {
  const events = action.audioEvents;
  if (events === undefined) return;
  if (!Array.isArray(events) || events.length > limits.events)
    throw Error('每个动作最多保存 16 个音效事件');
  const ids = new Set<string>();
  for (const e of events) {
    if (
      !e ||
      typeof e !== 'object' ||
      Object.keys(e).some(
        (k) =>
          ![
            'id',
            'name',
            'src',
            'sourceDuration',
            'at',
            'duration',
            'offset',
            'volume',
            'playbackRate',
            'loop',
            'enabled',
          ].includes(k),
      )
    )
      throw Error('音效事件格式或字段无效');
    const range = (n: unknown, lo: number, hi: number) =>
      typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
    if (
      typeof e.id !== 'string' ||
      !e.id ||
      e.id.length > 80 ||
      ids.has(e.id) ||
      typeof e.name !== 'string' ||
      e.name.length > 120 ||
      !range(e.at, 0, 1) ||
      !range(e.duration, 0.02, 30) ||
      e.at * action.duration + e.duration > action.duration + 1e-6 ||
      !range(e.sourceDuration, 0.02, 30) ||
      !range(e.offset, 0, e.sourceDuration - 0.01) ||
      !range(e.volume, 0, 1) ||
      !range(e.playbackRate, 0.25, 4) ||
      typeof e.loop !== 'boolean' ||
      typeof e.enabled !== 'boolean'
    )
      throw Error('音效事件参数超出范围或超出动作结束时间');
    if (
      typeof e.src !== 'string' ||
      !e.src ||
      e.src.length > Math.ceil((limits.bytes * 4) / 3) + 64 ||
      (e.src.startsWith('data:')
        ? !/^data:audio\/wav;base64,[A-Za-z0-9+/]+={0,2}$/.test(e.src)
        : /^(?:javascript|file):/i.test(e.src))
    )
      throw Error('音效需要有效的 PCM WAV 素材');
    if (e.src.startsWith('data:')) {
      const encoded = e.src.slice(e.src.indexOf(',') + 1);
      if (encoded.length % 4 !== 0) throw Error('PCM WAV 编码无效');
      const header = Uint8Array.from(atob(encoded.slice(0, 60)), (c) =>
        c.charCodeAt(0),
      );
      const bytes =
        (encoded.length / 4) * 3 -
        (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
      if (Math.abs(wav(header, bytes).duration - e.sourceDuration) > 0.025)
        throw Error('音效长度与工程记录不一致');
    }
    ids.add(e.id);
  }
}
/** Output window is half-open. Seeking reconstructs the remaining clip, never missed cues. */
function cues(action: CharacterAction | null, seconds: number) {
  if (
    !action ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    !(action.duration > 0)
  )
    return [];
  if (!action.loop && seconds >= action.duration) return [];
  const cycle = action.loop ? Math.floor(seconds / action.duration) : 0;
  const local = seconds - cycle * action.duration;
  return (action.audioEvents || [])
    .flatMap((event) => {
      const age = local - event.at * action.duration,
        span = event.sourceDuration - event.offset;
      const length = event.loop
        ? event.duration
        : Math.min(event.duration, span / event.playbackRate);
      if (
        !event.enabled ||
        event.volume <= 0 ||
        age < 0 ||
        age >= length - 1e-7 ||
        span <= 0
      )
        return [];
      return [
        {
          event,
          key: action.id + ':' + event.id + ':' + cycle,
          age,
          remaining: length - age,
          offset:
            event.offset +
            (event.loop
              ? (age * event.playbackRate) % span
              : age * event.playbackRate),
        },
      ];
    })
    .slice(0, limits.voices);
}
/** Canonical lossless PCM16 container shared by the browser and native runtime. */
function pcm(channels: readonly Float32Array[], sampleRate: number) {
  if (
    !channels.length ||
    channels.length > 2 ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 48000 ||
    channels.some((c) => c.length !== channels[0].length) ||
    channels[0].length / sampleRate > 30 ||
    channels[0].length / sampleRate < 0.02
  )
    throw Error('音效须为 0.02–30 秒、单声道或双声道、8–48 kHz');
  const bytes = new Uint8Array(44 + channels[0].length * channels.length * 2),
    d = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) d.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  d.setUint32(4, bytes.length - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, channels.length, true);
  d.setUint32(24, sampleRate, true);
  d.setUint32(28, sampleRate * channels.length * 2, true);
  d.setUint16(32, channels.length * 2, true);
  d.setUint16(34, 16, true);
  ascii(36, 'data');
  d.setUint32(40, bytes.length - 44, true);
  for (let frame = 0; frame < channels[0].length; frame++)
    for (let c = 0; c < channels.length; c++) {
      const value = channels[c][frame];
      if (!Number.isFinite(value)) throw Error('音频采样无效');
      d.setInt16(
        44 + (frame * channels.length + c) * 2,
        Math.round(
          Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767),
        ),
        true,
      );
    }
  return bytes;
}
function wav(bytes: Uint8Array, totalBytes = bytes.length) {
  if (bytes.length < 44 || totalBytes > limits.bytes)
    throw Error('PCM WAV 大小无效');
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ascii = (at: number, n: number) =>
      String.fromCharCode(...bytes.slice(at, at + n));
  const channels = d.getUint16(22, true),
    rate = d.getUint32(24, true),
    size = d.getUint32(40, true);
  if (
    ascii(0, 4) !== 'RIFF' ||
    ascii(8, 8) !== 'WAVEfmt ' ||
    ascii(36, 4) !== 'data' ||
    d.getUint32(4, true) !== totalBytes - 8 ||
    d.getUint32(16, true) !== 16 ||
    d.getUint16(20, true) !== 1 ||
    ![1, 2].includes(channels) ||
    rate < 8000 ||
    rate > 48000 ||
    d.getUint16(34, true) !== 16 ||
    d.getUint16(32, true) !== channels * 2 ||
    d.getUint32(28, true) !== rate * channels * 2 ||
    size !== totalBytes - 44 ||
    size % (channels * 2) !== 0
  )
    throw Error('音效需要规范的 PCM16 WAV，请重新导入');
  const duration = size / (channels * 2 * rate);
  if (duration < 0.02 || duration > 30) throw Error('音效须为 0.02–30 秒');
  return { duration, channels, sampleRate: rate };
}
export default { validate, cues, pcm, wav, limits };
