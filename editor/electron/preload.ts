import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { EditorBridge, SplashState, WindowState, Unsubscribe } from '../shared/contracts';

function subscribe<T>(channel: string, callback: (value: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

const bridge: EditorBridge = Object.freeze({
  platform: process.platform,
  invoke: ((method: string, args?: unknown) => ipcRenderer.invoke('atelier:invoke', method, args)) as EditorBridge['invoke'],
  onSplashState: (callback: (state: SplashState) => void) => subscribe('atelier:splash-state', callback),
  onWindowState: (callback: (state: WindowState) => void) => subscribe('atelier:window-state', callback),
  onCommand: (callback: (command: string) => void) => subscribe('atelier:command', callback)
});
contextBridge.exposeInMainWorld('atelier', bridge);
