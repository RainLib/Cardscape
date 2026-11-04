import type { ActionAudioEvent } from '../shared/character';
const Audio: typeof import('../renderer/animation/action-audio-model').default = require('../renderer/action-audio-model.js');
export function audioBytes(event: ActionAudioEvent) {
  const match = /^data:audio\/wav;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    event.src,
  );
  if (!match) throw Error('音效导出需要内嵌 PCM WAV');
  const bytes = Buffer.from(match[1], 'base64');
  checkAudio(bytes, event.sourceDuration);
  return bytes;
}
export function checkAudio(bytes: Uint8Array, duration: number) {
  if (Math.abs(Audio.wav(bytes).duration - duration) > 0.025)
    throw Error('音效长度与工程记录不一致');
}
