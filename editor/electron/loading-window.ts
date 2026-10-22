import type {
  BrowserWindow as ElectronWindow,
  IpcMainInvokeEvent,
} from 'electron';
import type { SplashState } from '../shared/contracts';
interface LoadingOptions {
  BrowserWindow: typeof ElectronWindow;
  main: ElectronWindow;
  preload: string;
  url: string;
  version: string;
  background?: boolean;
}
type SplashUpdate = {
  name?: unknown;
  stage?: unknown;
  percent?: unknown;
  version?: string;
};
('use strict');
export function normalize(
  state: SplashUpdate,
  previous: Partial<SplashState> = {},
): SplashState {
  return {
    name: String(state.name ?? previous.name ?? '准备创作空间').slice(0, 120),
    stage: String(state.stage ?? previous.stage ?? '正在启动…').slice(0, 160),
    percent:
      typeof state.percent === 'number' && Number.isFinite(state.percent)
        ? Math.max(0, Math.min(100, state.percent))
        : previous.percent || 8,
    version: previous.version || state.version,
  };
}
export function createLoadingWindow({
  BrowserWindow,
  main,
  preload,
  url,
  version,
  background = false,
}: LoadingOptions) {
  let win: ElectronWindow | null = null,
    ready: Promise<void> | null = null,
    generation = 0,
    shownAt = 0,
    state = normalize({ version }),
    closing = false,
    loading = false;
  function ensure() {
    if (win && !win.isDestroyed()) return ready;
    win = new BrowserWindow({
      show: false,
      width: 920,
      height: 560,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      closable: false,
      frame: false,
      backgroundColor: '#111b25',
      title: 'Cardscape · 正在准备',
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('console-message', (event) =>
      console.log('[loading]', event.message),
    );
    win.webContents.on('will-navigate', (event, target) => {
      if (target !== url) event.preventDefault();
    });
    ready = win.loadURL(url);
    return ready;
  }
  async function show(next: SplashUpdate = {}) {
    const current = ++generation;
    closing = false;
    loading = true;
    main.webContents?.setBackgroundThrottling(false);
    state = normalize(next, state);
    await ensure();
    if (current !== generation || !win) return;
    if (!background) {
      main.hide();
      win.show();
      win.focus();
    }
    shownAt = Date.now();
    win.webContents.send('atelier:splash-state', state);
    console.log(
      'LOADING_WINDOW_VISIBLE',
      JSON.stringify({ id: win.id, name: state.name, background }),
    );
  }
  function update(next: SplashUpdate) {
    state = normalize(next, state);
    if (win && !win.isDestroyed() && !closing)
      win.webContents.send('atelier:splash-state', state);
  }
  async function finish() {
    const current = generation;
    update({ percent: 100 });
    closing = true;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.max(0, 400 - (Date.now() - shownAt))),
    );
    if (current !== generation) return;
    const id = win?.id;
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    ready = null;
    loading = false;
    if (!main.isDestroyed()) {
      main.webContents?.setBackgroundThrottling(true);
      if (!background) {
        main.show();
        main.focus();
      }
    }
    console.log('LOADING_WINDOW_FINISHED', JSON.stringify({ id }));
  }
  function focus() {
    if (background || main.isDestroyed()) return;
    if (loading) {
      main.hide();
      if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
      }
    } else {
      if (main.isMinimized?.()) main.restore();
      main.show();
      main.focus();
    }
  }
  function destroy() {
    generation++;
    loading = false;
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
  }
  return {
    show,
    update,
    finish,
    focus,
    destroy,
    state: () => ({ ...state }),
    isSender: (event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>) =>
      !!win &&
      event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame &&
      event.senderFrame?.url === url,
  };
}
