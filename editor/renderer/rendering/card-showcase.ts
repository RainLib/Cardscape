import { encode, widths } from './card-capture.ts';
import type { CaptureFormat } from './card-capture';
import type { PreviewAPI } from '../../shared/preview';

const languages = {
  zh: [
    '展示与录制',
    '互动方式',
    '拖动',
    '跟随指针',
    '设备倾斜',
    '自动悬浮',
    '纯展示',
    '退出纯展示',
    '输出宽度',
    '取消',
    '启用后将手机置于自然观看角度',
    '无法读取设备倾斜，请使用拖动。',
    '正在准备',
    '已下载',
    '已取消',
  ],
  en: [
    'Showcase & capture',
    'Interaction',
    'Drag',
    'Follow pointer',
    'Device tilt',
    'Float',
    'Clean view',
    'Exit clean view',
    'Output width',
    'Cancel',
    'Hold the phone at a comfortable viewing angle',
    'Device tilt is unavailable. Drag to tilt.',
    'Preparing',
    'Downloaded',
    'Canceled',
  ],
  ja: [
    '表示・書き出し',
    '操作方法',
    'ドラッグ',
    'ポインター追従',
    '端末の傾き',
    '自動浮遊',
    '全画面表示',
    '全画面表示を終了',
    '出力幅',
    'キャンセル',
    '端末を見やすい角度で構えてください',
    '傾きを取得できません。ドラッグで操作できます。',
    '準備中',
    'ダウンロード完了',
    'キャンセルしました',
  ],
  ko: [
    '보기 및 내보내기',
    '조작 방식',
    '드래그',
    '포인터 따라가기',
    '기기 기울기',
    '자동 부유',
    '카드만 보기',
    '카드 보기 종료',
    '출력 너비',
    '취소',
    '보기 편한 각도로 기기를 들어 주세요',
    '기기 각도를 읽을 수 없습니다. 드래그로 조작하세요.',
    '준비 중',
    '다운로드 완료',
    '취소됨',
  ],
  pt: [
    'Apresentação e gravação',
    'Interação',
    'Arrastar',
    'Seguir o ponteiro',
    'Inclinação do dispositivo',
    'Flutuação',
    'Mostrar só a carta',
    'Sair da apresentação',
    'Largura',
    'Cancelar',
    'Segure o telefone em um ângulo confortável',
    'Inclinação indisponível. Arraste para girar.',
    'Preparando',
    'Baixado',
    'Cancelado',
  ],
  es: [
    'Presentación y grabación',
    'Interacción',
    'Arrastrar',
    'Seguir el puntero',
    'Inclinación del dispositivo',
    'Flotación',
    'Mostrar solo la carta',
    'Salir de la presentación',
    'Ancho',
    'Cancelar',
    'Sujeta el teléfono en un ángulo cómodo',
    'Sensor no disponible. Arrastra para girar.',
    'Preparando',
    'Descargado',
    'Cancelado',
  ],
} as const;
type Mode = 'drag' | 'hover' | 'sensor' | 'float';
interface Options {
  preview: Pick<
    PreviewAPI,
    'getView' | 'pose' | 'inspect' | 'stopInspection' | 'createCapture'
  >;
  canvas: () => HTMLCanvasElement | null;
  title: () => string;
  identity?: () => string;
  prepare?: () => void;
  prepareCapture?: () => Promise<unknown>;
  initialMode?: Mode;
  locale?: string;
}

export function createShowcase(root: HTMLElement, options: Options) {
  const { preview } = options;
  let canvas: HTMLCanvasElement | null = null;
  let mode = options.initialMode || 'drag',
    active = true;
  let lang = options.locale?.split('-')[0] as keyof typeof languages;
  if (!Object.hasOwn(languages, lang)) lang = 'zh';
  let job: AbortController | null = null,
    dragging = false,
    raf = 0,
    ticket = 0;
  let orientation: [number, number] | undefined,
    sensorTimeout = 0;
  const target = { yaw: 0, pitch: 0 };
  root.classList.add('card-showcase');
  root.innerHTML = `<details><summary></summary><div class="card-showcase-controls">
    <label><span data-label="1"></span><select data-control="mode"></select></label>
    <label><span data-label="8"></span><select data-control="width"></select></label>
    <select data-control="language" aria-label="Language"><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option><option value="pt">Português</option><option value="es">Español</option></select>
    <button type="button" data-control="clean" data-label="6"></button>
    <button type="button" data-format="gif">GIF</button><button type="button" data-format="mp4">MP4</button>
    <button type="button" data-control="cancel" data-label="9" hidden></button>
    <output aria-live="polite"></output>
  </div></details><button type="button" class="card-showcase-exit" data-control="exit" data-label="7"></button>`;
  const control = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-control="${name}"]`)!;
  const modeField = control<HTMLSelectElement>('mode'),
    widthField = control<HTMLSelectElement>('width'),
    language = control<HTMLSelectElement>('language'),
    clean = control<HTMLButtonElement>('clean'),
    exit = control<HTMLButtonElement>('exit'),
    cancel = control<HTMLButtonElement>('cancel'),
    status = root.querySelector('output')!,
    exportButtons = [
      ...root.querySelectorAll<HTMLButtonElement>('[data-format]'),
    ];
  document.body.append(exit);
  widthField.replaceChildren(
    ...widths.map((w) => new Option(`${w} × ${w * 1.5}`, String(w))),
  );
  widthField.value = '480';
  function labels() {
    root.querySelector('summary')!.textContent = languages[lang][0];
    [...root.querySelectorAll<HTMLElement>('[data-label]'), exit].forEach(
      (e) => {
        e.textContent = languages[lang][Number(e.dataset.label)];
      },
    );
    modeField.replaceChildren(
      ...(['drag', 'hover', 'sensor', 'float'] as const).map(
        (id, i) => new Option(languages[lang][2 + i], id),
      ),
    );
    modeField.value = mode;
    language.value = lang;
  }
  function ease() {
    raf = 0;
    if (dragging || !active || job || mode === 'drag') return;
    const view = preview.getView();
    const dx = ((((target.yaw - view.yaw + 180) % 360) + 360) % 360) - 180;
    const dy = target.pitch - view.pitch;
    if (Math.abs(dx) < 0.08 && Math.abs(dy) < 0.08) return;
    preview.pose(view.yaw + dx * 0.23, view.pitch + dy * 0.23);
    raf = requestAnimationFrame(ease);
  }
  function aim(yaw: number, pitch: number) {
    [target.yaw, target.pitch] = [yaw, pitch];
    if (!raf) raf = requestAnimationFrame(ease);
  }
  function move(e: PointerEvent) {
    if (
      (mode !== 'hover' && mode !== 'float') ||
      e.pointerType !== 'mouse' ||
      e.buttons ||
      !canvas
    )
      return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    aim(
      35 * ((e.clientX - box.left) / box.width - 0.5),
      -21 * ((e.clientY - box.top) / box.height - 0.5),
    );
  }
  const leave = () => {
    if (mode === 'hover') aim(0, 0);
    if (mode === 'float' && !dragging) startFloat();
  };
  const startDrag = () => {
    dragging = true;
  };
  const endDrag = (event: PointerEvent) => {
    dragging = false;
    if (mode === 'float' && event.pointerType !== 'mouse') startFloat();
  };
  function startFloat() {
    cancelAnimationFrame(raf);
    raf = 0;
    preview.pose(0, 0);
    preview.inspect({ mode: 'float', period: 3 });
  }
  function attach() {
    const current = options.canvas();
    if (!current || current === canvas) return;
    canvas = current;
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerdown', startDrag);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);
  }
  function rotate(e: DeviceOrientationEvent) {
    if (mode !== 'sensor' || e.gamma === null || e.beta === null) return;
    clearTimeout(sensorTimeout);
    orientation ||= [e.gamma, e.beta];
    const dx = (e.gamma - orientation[0]) * 0.65,
      dy = (e.beta - orientation[1]) * 0.55;
    const screenAngle = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
    const x = dx * Math.cos(screenAngle) - dy * Math.sin(screenAngle);
    const y = dx * Math.sin(screenAngle) + dy * Math.cos(screenAngle);
    aim(Math.min(24, Math.max(-24, x)), Math.min(16, Math.max(-16, y)));
  }
  function disableSensor() {
    clearTimeout(sensorTimeout);
    window.removeEventListener('deviceorientation', rotate);
    orientation = undefined;
  }
  function fallbackSensor() {
    disableSensor();
    mode = 'drag';
    modeField.value = mode;
    status.textContent = languages[lang][11];
  }
  const ready = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  async function setMode(next: Mode) {
    const pending = ++ticket;
    if (mode === 'float') preview.stopInspection();
    disableSensor();
    mode = next;
    status.textContent = '';
    if (mode === 'drag') return;
    options.prepare?.();
    if (mode === 'sensor') {
      const sensor = globalThis.DeviceOrientationEvent as
        | (typeof DeviceOrientationEvent & {
            requestPermission?: () => Promise<'granted' | 'denied'>;
          })
        | undefined;
      try {
        if (
          !sensor ||
          (sensor.requestPermission &&
            (await sensor.requestPermission()) !== 'granted')
        ) {
          if (pending === ticket) fallbackSensor();
          return;
        }
        if (pending !== ticket) return;
        status.textContent = languages[lang][10];
        window.addEventListener('deviceorientation', rotate);
        sensorTimeout = window.setTimeout(fallbackSensor, 2200);
      } catch {
        if (pending === ticket) fallbackSensor();
      }
    }
    await ready();
    if (pending !== ticket) return;
    attach();
    if (mode === 'float') startFloat();
  }
  function cleanView(value: boolean) {
    if (value) options.prepare?.();
    document.body.classList.toggle('card-showcase-clean', value);
    (value ? exit : clean).focus();
  }
  function buttons() {
    modeField.disabled = widthField.disabled = Boolean(job);
    for (const btn of exportButtons) btn.disabled = Boolean(job);
    cancel.hidden = !job;
  }
  async function download(format: CaptureFormat) {
    if (job) return;
    job = new AbortController();
    const signal = job.signal;
    const identity = options.identity?.();
    buttons();
    try {
      status.textContent = languages[lang][12];
      options.prepare?.();
      await ready();
      await options.prepareCapture?.();
      signal.throwIfAborted();
      attach();
      const blob = await encode(
        preview,
        format,
        +widthField.value,
        signal,
        (done, total) => {
          if (options.identity?.() !== identity) job?.abort();
          status.textContent = `${done} / ${total}`;
        },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        (options.title().replace(/[\\/:*?"<>|]/g, '_') || 'Cardscape') +
        '.' +
        format;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      status.textContent = languages[lang][13];
    } catch (error) {
      status.textContent = signal.aborted
        ? languages[lang][14]
        : error instanceof Error
          ? error.message
          : String(error);
    } finally {
      job = null;
      buttons();
    }
  }
  clean.onclick = () => cleanView(true);
  exit.onclick = () => cleanView(false);
  cancel.onclick = () => job?.abort();
  modeField.onchange = () => void setMode(modeField.value as Mode);
  language.onchange = () => {
    lang = language.value as keyof typeof languages;
    labels();
  };
  for (const btn of exportButtons)
    btn.onclick = () => void download(btn.dataset.format as CaptureFormat);
  window.addEventListener(
    'keydown',
    (e) => {
      if (
        e.key === 'Escape' &&
        document.body.classList.contains('card-showcase-clean')
      ) {
        e.preventDefault();
        cleanView(false);
      }
    },
    true,
  );
  window.addEventListener(
    'pagehide',
    () => {
      disableSensor();
      job?.abort();
      cancelAnimationFrame(raf);
    },
    { once: true },
  );
  labels();
  attach();
  return {
    refresh(value: boolean) {
      root.hidden = !value;
      if (active && !value) {
        ++ticket;
        disableSensor();
        job?.abort();
        if (mode === 'float') preview.stopInspection();
        mode = options.initialMode || 'drag';
        modeField.value = mode;
        document.body.classList.remove('card-showcase-clean');
      }
      active = value;
      if (active) attach();
    },
  };
}
