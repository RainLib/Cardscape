import Audio from '../renderer/animation/action-audio-model.ts';
/** Original, deterministic procedural sounds; no external recordings or samples. */
export function productionAudio() {
  const rate = 48000;
  const make = (kind: 'swish' | 'charge' | 'impact', duration: number) => {
    let seed = 123456789,
      last = 0,
      phase = 0;
    const pcm = Float32Array.from(
      { length: Math.round(rate * duration) },
      (_, i) => {
        const t = i / rate,
          u = t / duration;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 2147483648 - 1;
        last = last * 0.78 + noise * 0.22;
        const fade = Math.min(1, t / 0.015, (duration - t) / 0.04);
        if (kind === 'swish')
          return (noise - last) * Math.sin(Math.PI * u) ** 2 * 0.5 * fade;
        if (kind === 'impact')
          return (
            (last * 0.8 + Math.sin(2 * Math.PI * (95 * t - 32 * t * t)) * 0.3) *
            Math.exp(-u * 7) *
            fade
          );
        phase += (2 * Math.PI * (180 + u * 650)) / rate;
        return (
          (Math.sin(phase) * 0.22 +
            Math.sin(phase * 1.501) * 0.13 +
            last * 0.06) *
          Math.sin(Math.PI * u) ** 0.7 *
          fade
        );
      },
    );
    return Buffer.from(Audio.pcm([pcm], rate));
  };
  return {
    swish: make('swish', 0.6),
    charge: make('charge', 1.6),
    impact: make('impact', 1),
  };
}
