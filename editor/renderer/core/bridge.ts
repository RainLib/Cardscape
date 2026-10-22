import type { EditorBridge, RendererBridge } from '../../shared/contracts';

/** The HTTP preview implements the same request boundary as the Electron preload. */
export function createBridge(): RendererBridge {
  if (window.atelier) return window.atelier;
  return {
    async invoke<T = unknown>(method: string, args?: unknown): Promise<T> {
      const body = JSON.stringify({ method, args });
      const response = await fetch('/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Atelier-Client': 'local-editor',
        },
        body,
        keepalive: method === 'editor-session-save' && body.length < 60000,
      });
      const value: unknown = await response.json();
      if (!response.ok)
        throw Error(
          value && typeof value === 'object' && 'error' in value
            ? String(value.error)
            : `Request failed: ${response.status}`,
        );
      return value as T;
    },
  };
}
