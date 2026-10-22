import type { EncodedSnapshot, JsonValue } from '../shared/contracts';

/** Hash image bytes once; release obsolete base64 keys after an acknowledged save. */
export function encoder() {
  const ids = new Map<string, string>();
  const sent = new Set<string>();
  let generation = 0;
  return async function encode(value: unknown): Promise<EncodedSnapshot> {
    const token = ++generation;
    const sources = new Set<string>();
    function collect(item: unknown): void {
      if (typeof item === 'string' && item.startsWith('data:')) sources.add(item);
      else if (Array.isArray(item)) item.forEach(collect);
      else if (item && typeof item === 'object') Object.values(item).forEach(collect);
    }
    collect(value);
    const queue = [...sources];
    const blobs: Record<string, string> = {};
    let cursor = 0;
    // Bound transient UTF-8 buffers when a card contains many large PNG strings.
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (cursor < queue.length) {
        const src = queue[cursor++];
        let id = ids.get(src);
        if (!id) {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
          id = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
          ids.set(src, id);
        }
        if (!sent.has(id)) blobs[id] = src;
      }
    }));
    function walk(item: unknown): JsonValue {
      if (typeof item === 'string' && ids.has(item)) return { $blob: ids.get(item)! };
      if (Array.isArray(item)) return item.map(walk);
      if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).map(([key, v]) => [key, walk(v)]));
      if (item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return item as JsonValue;
      return null;
    }
    return {
      project: walk(value), blobs,
      ack() {
        Object.keys(blobs).forEach(id => sent.add(id));
        if (token !== generation) return;
        for (const src of ids.keys()) if (!sources.has(src)) ids.delete(src);
        const current = new Set(ids.values());
        for (const id of sent) if (!current.has(id)) sent.delete(id);
      }
    };
  };
}
