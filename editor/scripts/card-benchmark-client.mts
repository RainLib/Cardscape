import { measureScene, type PerformanceScene } from './performance-scene.mts';
import type Cosmetics from '../renderer/editing/cosmetics-model.ts';

const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const start = get<HTMLButtonElement>('run'),
  save = get<HTMLButtonElement>('save'),
  status = get('status'),
  output = get('results');
const stop = get<HTMLButtonElement>('stop');
stop.onclick = () => {
  document.body.dataset.benchmarkCancel = 'true';
  status.textContent = '正在停止并释放资源…';
};
window.addEventListener('cardscape-benchmark-progress', (event) => {
  const detail = (event as CustomEvent<{ seconds: number; frames: number }>)
    .detail;
  if (
    !document.body.dataset.benchmarkCancel ||
    document.body.dataset.benchmarkCancel === 'false'
  )
    status.textContent = `测试中：${detail.seconds.toFixed(0)} 秒，已提交 ${detail.frames} 帧。请保持本页在前台。`;
});
let report: unknown;
start.onclick = async () => {
  start.disabled = true;
  save.disabled = true;
  stop.disabled = false;
  document.body.dataset.benchmarkCancel = 'false';
  status.textContent = '载入原画并准备渲染器…';
  try {
    const fixture = (await fetch('fixture.json').then((r) => {
      if (!r.ok) throw Error('测试工程载入失败');
      return r.json();
    })) as Pick<PerformanceScene, 'doc' | 'textAssets' | 'textureAssets'>;
    const textureMode = get<HTMLSelectElement>('textures')
      .value as PerformanceScene['textureMode'];
    const quality = get<HTMLSelectElement>('quality').value,
      dpr = Math.min(
        devicePixelRatio,
        (
          window as unknown as { CardCosmetics: typeof Cosmetics }
        ).CardCosmetics.budget(quality).dpr,
      ),
      width = Math.round(Math.min(innerWidth - 24, 1280) * dpr),
      height = Math.round(
        Math.max(360, Math.min(innerHeight * 0.68, 900)) * dpr,
      );
    status.textContent = '正在测试，请保持本页在前台…';
    const result = await measureScene({
      ...fixture,
      count: Number(get<HTMLSelectElement>('count').value),
      quality,
      seconds: Number(get<HTMLSelectElement>('duration').value),
      cycles: 3,
      large: false,
      viewport: [width, height],
      textureMode,
      action: get<HTMLSelectElement>('action').value,
      audio: get<HTMLInputElement>('audio').checked,
      retainSmallEffects: textureMode === 'small',
      transitionCycles:
        textureMode === 'adaptive' &&
        get<HTMLInputElement>('transitions').checked
          ? 3
          : 0,
    });
    const preview = get<HTMLImageElement>('capture');
    preview.src = result.canvasPNG;
    preview.hidden = false;
    const { canvasPNG: _, ...metrics } = result;
    report = {
      schema: 'cardscape-device-benchmark/1',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: {
        width: screen.width,
        height: screen.height,
        dpr: devicePixelRatio,
      },
      hardwareConcurrency: navigator.hardwareConcurrency,
      metrics,
      scope:
        'Actual browser/device, real published texture tiers or explicit source baseline. Automatic policy follows projected card size; forced small keeps effects for comparison. GL storage estimates are not driver VRAM.',
    };
    output.textContent = JSON.stringify(report, null, 2);
    save.disabled = false;
    status.textContent = result.cancelled
      ? '已停止，资源已释放。'
      : result.backgrounded
        ? '本次曾进入后台，请在前台重新测试。'
        : `完成：${result.textureMode === 'source' ? '原图' : result.initialTier === 'small' ? '小图' : '高清'}，提交 ${result.submittedFps.toFixed(1)} 次／秒，CPU P95 ${result.submitMs.p95.toFixed(1)} ms，纹理分配估算 ${(result.steady.textureBytes / 1048576).toFixed(1)} MiB。`;
  } catch (error) {
    status.textContent =
      '测试未完成：' + (error instanceof Error ? error.message : String(error));
  } finally {
    start.disabled = false;
    stop.disabled = true;
  }
};
save.onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cardscape-device-benchmark.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
