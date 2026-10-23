import type { TextureAsset } from '../../shared/export';
export type TextureEntry =
  | {
      asset: string;
      variants?: Partial<Record<'small' | 'large', TextureAsset>>;
    }
  | { asset?: string; variants: { large: TextureAsset; small?: TextureAsset } };
export interface TextureBatch<E, I> {
  entry: E;
  variant: TextureAsset;
  image: I;
}
export interface TextureStatus {
  level: string;
  current: string | null;
  loading: boolean;
  error?: string;
}
export interface AdaptiveOptions<E extends TextureEntry, I> {
  entries: (level: string) => E[];
  load: (src: string) => Promise<I> | I;
  apply: (batch: TextureBatch<E, I>[], level: string) => void;
  status?: (value: TextureStatus) => void;
}
/* Decode complete texture batches before swapping. A newer zoom or locale wins;
 * failed/stale loads keep the last complete frame and cannot reset animation. */

const api = (() => {
  'use strict';
  function create<E extends TextureEntry, I>({
    entries,
    load,
    apply,
    status = () => {},
  }: AdaptiveOptions<E, I>) {
    let generation = 0,
      disposed = false,
      current: string | null = null,
      desired: string | null = null;
    const pending = new Map<string, Promise<I>>();
    const image = (src: string) => {
      if (!pending.has(src)) {
        const p = Promise.resolve().then(() => load(src));
        pending.set(src, p);
        p.finally(() => {
          if (pending.get(src) === p) pending.delete(src);
        }).catch(() => {});
      }
      return pending.get(src)!;
    };
    function fallback(entry: TextureEntry): TextureAsset {
      if (typeof entry.asset !== 'string') throw Error('缺少纹理资源路径');
      return { asset: entry.asset };
    }
    async function set(level: string) {
      if (disposed || desired === level) return;
      desired = level;
      const token = ++generation;
      status({ level, current, loading: true });
      const tasks = entries(level),
        results = new Array<TextureBatch<E, I>>(tasks.length),
        decoded = new Map<string, Promise<I>>();
      const batchImage = (src: string) => {
        if (!decoded.has(src)) decoded.set(src, image(src));
        return decoded.get(src)!;
      };
      let cursor = 0;
      try {
        await Promise.all(
          Array.from({ length: Math.min(4, tasks.length) }, async () => {
            while (cursor < tasks.length) {
              const i = cursor++,
                e = tasks[i],
                variant =
                  (level === 'small' || level === 'large'
                    ? e.variants?.[level]
                    : undefined) ||
                  e.variants?.large ||
                  fallback(e);
              results[i] = {
                entry: e,
                variant,
                image: await batchImage(variant.asset),
              };
              if (disposed || token !== generation) return;
            }
          }),
        );
        if (disposed || token !== generation) return;
        apply(results, level);
        current = level;
        if (token === generation) status({ level, current, loading: false });
      } catch (error) {
        if (disposed || token !== generation) return;
        desired = null;
        status({
          level,
          current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
        if (current === null) throw error;
      }
    }
    return {
      set,
      get current() {
        return current;
      },
      dispose() {
        disposed = true;
        generation++;
        pending.clear();
      },
    };
  }
  return { create };
})();

export default api;
