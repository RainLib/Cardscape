import type { EditorResults } from './editor-services';

export interface WindowState {
  platform: NodeJS.Platform;
  focused: boolean;
  fullscreen: boolean;
  maximized: boolean;
}

export interface SplashState {
  name: string;
  authoredName?: boolean;
  stage: string;
  percent: number;
  version?: string;
  uiLanguage?: UiLanguage;
}

export type UiLanguage = 'en' | 'zh-CN';
export type Unsubscribe = () => void;

/** Privileged IPC stays inside the preload; listeners always return a disposer. */
export interface EditorBridge {
  readonly platform: NodeJS.Platform;
  invoke(method: 'window-state'): Promise<WindowState>;
  invoke(method: 'splash-state'): Promise<SplashState>;
  invoke(method: 'ui-language'): Promise<UiLanguage>;
  invoke(method: 'set-ui-language', args: UiLanguage): Promise<UiLanguage>;
  invoke(
    method: 'document-state',
    args: { dirty: boolean },
  ): Promise<{ ok: true }>;
  invoke<K extends keyof EditorResults>(
    method: K,
    args?: unknown,
  ): Promise<EditorResults[K]>;
  invoke<T = unknown>(method: string, args?: unknown): Promise<T>;
  onSplashState(callback: (state: SplashState) => void): Unsubscribe;
  onWindowState(callback: (state: WindowState) => void): Unsubscribe;
  onUiLanguage(callback: (language: UiLanguage) => void): Unsubscribe;
  onCommand(callback: (command: string) => void): Unsubscribe;
}

export type RendererBridge = Pick<EditorBridge, 'invoke'> &
  Partial<Omit<EditorBridge, 'invoke'>>;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface EncodedSnapshot {
  project: JsonValue;
  blobs: Record<string, string>;
  ack(): void;
}
