import type { RemoteObject, RemoteRecord } from '../../shared/export';
export interface RemoteCatalog {
  schema: 'cardscape-remote/1';
  runtimeVersion: 1;
  release: string;
  cards: Array<{ id: string; webgl: RemoteRecord; godot: RemoteRecord }>;
  objects: Record<string, RemoteObject>;
}
type Bytes = Uint8Array<ArrayBuffer>;
export interface RemoteCache {
  get(id: string): Promise<Bytes | null | undefined>;
  set(id: string, bytes: Bytes): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}
export interface RemoteStats {
  requests: number;
  downloadedBytes: number;
  cacheHits: number;
  retries: number;
  objects: number;
  offline: boolean;
}
export interface RemoteProgress extends RemoteStats {
  stage: string;
  id?: string;
  release?: string;
  card?: string;
  message?: string;
}
export interface RemoteOptions {
  fetcher?: typeof fetch;
  cache?: RemoteCache;
  progress?: (value: RemoteProgress) => void;
  resolveURL?: (url: string) => string | Promise<string>;
  headers?: HeadersInit;
  timeout?: number;
  retries?: number;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
/* Portable data-only downloader. SDK code stays in the application. */
const api = (() => {
  'use strict';
  const enc = new TextEncoder(),
    dec = new TextDecoder(),
    limit = 64 * 1024 * 1024;
  const idPattern = /^[a-f0-9]{64}$/;
  async function digest(bytes: Uint8Array) {
    // WebCrypto accepts ArrayBuffer-backed views. Keep normal downloads zero-copy;
    // shared-memory callers need a snapshot because WebCrypto rejects shared views.
    const input =
      bytes.buffer instanceof ArrayBuffer
        ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : new Uint8Array(bytes);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', input))]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  }
  function memoryCache(maxBytes = 256 * 1024 * 1024): RemoteCache {
    const values = new Map<string, Bytes>();
    let size = 0;
    return {
      async get(k) {
        return values.get(k);
      },
      async set(k, v) {
        size -= values.get(k)?.length || 0;
        values.delete(k);
        values.set(k, v);
        size += v.length;
        for (const [id, bytes] of values) {
          if (size <= maxBytes) break;
          values.delete(id);
          size -= bytes.length;
        }
      },
      async delete(k) {
        size -= values.get(k)?.length || 0;
        values.delete(k);
      },
      async clear() {
        values.clear();
        size = 0;
      },
    };
  }
  function browserCache(maxBytes: number): RemoteCache {
    if (typeof caches === 'undefined') return memoryCache(maxBytes);
    const fallback = memoryCache(maxBytes);
    let available = true;
    const cache = () => caches.open('cardscape-remote-v1'),
      key = (id: string) =>
        new URL(
          '/__cardscape_objects__/' + encodeURIComponent(id),
          location.origin === 'null'
            ? 'https://cardscape-cache.invalid'
            : location.origin,
        ).href;
    const persistent: RemoteCache = {
      async get(id) {
        const c = await cache(),
          r = await c.match(key(id));
        return r ? new Uint8Array(await r.arrayBuffer()) : null;
      },
      async set(id, bytes) {
        const c = await cache();
        await c.put(
          key(id),
          new Response(bytes, {
            headers: { 'Content-Length': String(bytes.length) },
          }),
        );
        const keys = await c.keys();
        let total = 0;
        const entries: Array<[Request, number]> = [];
        for (const k of keys) {
          const r = await c.match(k);
          if (!r) continue;
          const size = Number(r.headers.get('Content-Length') || 0);
          total += size;
          entries.push([k, size]);
        }
        for (const [k, size] of entries) {
          if (total <= maxBytes) break;
          await c.delete(k);
          total -= size;
        }
      },
      async delete(id) {
        await (await cache()).delete(key(id));
      },
      async clear() {
        await caches.delete('cardscape-remote-v1');
      },
    };
    // Keep each operation's argument/result relationship through the fallback.
    async function use<T>(
      primary: () => Promise<T>,
      backup: () => Promise<T>,
    ): Promise<T> {
      if (available)
        try {
          return await primary();
        } catch {
          available = false;
        }
      return backup();
    }
    return {
      get: (id) =>
        use(
          () => persistent.get(id),
          () => fallback.get(id),
        ),
      set: (id, bytes) =>
        use(
          () => persistent.set(id, bytes),
          () => fallback.set(id, bytes),
        ),
      delete: (id) =>
        use(
          () => persistent.delete(id),
          () => fallback.delete(id),
        ),
      clear: () =>
        use(
          () => persistent.clear(),
          () => fallback.clear(),
        ),
    };
  }
  function validate(index: unknown): RemoteCatalog {
    if (
      !record(index) ||
      index.schema !== 'cardscape-remote/1' ||
      index.runtimeVersion !== 1 ||
      typeof index.release !== 'string' ||
      !idPattern.test(index.release) ||
      !Array.isArray(index.cards) ||
      !record(index.objects)
    )
      throw Error('不支持的远端资源目录');
    const objects = index.objects;
    for (const [id, o] of Object.entries(objects))
      if (
        !record(o) ||
        !idPattern.test(id) ||
        typeof o.path !== 'string' ||
        !new RegExp('^objects/' + id + '\\.(gz|json|webp|png|bin)$').test(
          o.path,
        ) ||
        typeof o.mime !== 'string' ||
        (o.compression !== 'gzip' && o.compression !== 'identity') ||
        typeof o.bytes !== 'number' ||
        !Number.isInteger(o.bytes) ||
        o.bytes <= 0 ||
        o.bytes > limit ||
        typeof o.downloadBytes !== 'number' ||
        !Number.isInteger(o.downloadBytes) ||
        o.downloadBytes <= 0 ||
        o.downloadBytes > limit
      )
        throw Error('远端对象描述无效');
    for (const c of index.cards) {
      if (!record(c) || typeof c.id !== 'string')
        throw Error('远端卡牌依赖缺失');
      for (const engine of ['webgl', 'godot'] as const) {
        const r = c[engine];
        if (
          !record(r) ||
          typeof r.definition !== 'string' ||
          !Object.hasOwn(objects, r.definition) ||
          !Array.isArray(r.base) ||
          !Array.isArray(r.detail) ||
          [...r.base, ...r.detail].some(
            (id) => typeof id !== 'string' || !Object.hasOwn(objects, id),
          )
        )
          throw Error('远端卡牌依赖缺失');
      }
    }
    // Every field exposed by the catalog contract was checked above; extensions stay opaque.
    return index as unknown as RemoteCatalog;
  }
  async function bounded(stream: ReadableStream<Uint8Array>, max: number) {
    const reader = stream.getReader(),
      parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) throw Error('远端资源超过大小限制');
        parts.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const b of parts) {
      bytes.set(b, at);
      at += b.length;
    }
    return bytes;
  }
  function create({
    fetcher = fetch,
    cache = browserCache(256 * 1024 * 1024),
    progress = () => {},
    resolveURL = (url) => url,
    headers = {},
    timeout = 20000,
    retries = 2,
  }: RemoteOptions = {}) {
    let index: RemoteCatalog | null = null,
      base: URL | null = null,
      closed = false,
      openToken = 0,
      active = 0;
    const waiting: Array<() => void> = [],
      jobs = new Map<string, Promise<Bytes>>(),
      urls = new Map<string, string>(),
      urlJobs = new Map<string, Promise<string>>(),
      controllers = new Set<AbortController>(),
      sources = new Map<string, { object: RemoteObject; url: string }>();
    const stats = {
      requests: 0,
      downloadedBytes: 0,
      cacheHits: 0,
      retries: 0,
      objects: 0,
      offline: false,
    };
    const report = (stage: string, extra: Partial<RemoteProgress> = {}) =>
      progress({ stage, ...stats, ...extra });
    async function slot() {
      if (active >= 4) {
        await new Promise<void>((resolve) => waiting.push(resolve));
        return;
      }
      active++;
    }
    function release() {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
    async function request(url: string, max: number): Promise<Bytes> {
      await slot();
      try {
        for (let attempt = 0; attempt <= retries; attempt++) {
          if (closed) throw Error('远端加载已取消');
          const controller = new AbortController();
          controllers.add(controller);
          const timer = setTimeout(() => controller.abort(), timeout);
          try {
            stats.requests++;
            const response = await fetcher(await resolveURL(url), {
              headers,
              signal: controller.signal,
              cache: 'no-store',
            });
            if (!response.ok) throw Error('HTTP ' + response.status);
            const bytes = response.body
              ? await bounded(response.body, max)
              : new Uint8Array(await response.arrayBuffer());
            if (bytes.length > max) throw Error('远端资源超过大小限制');
            stats.downloadedBytes += bytes.length;
            report('download');
            return bytes;
          } catch (error) {
            if (closed || attempt === retries) throw error;
            stats.retries++;
            report('retry', { message: message(error) });
          } finally {
            clearTimeout(timer);
            controllers.delete(controller);
          }
        }
        throw Error('远端下载重试次数无效');
      } finally {
        release();
      }
    }
    async function object(id: string): Promise<Bytes> {
      if (closed) throw Error('远端加载已取消');
      const existing = jobs.get(id);
      if (existing) return existing;
      const task = (async () => {
        const source = sources.get(id);
        if (!source) throw Error('远端资源不存在：' + id);
        const o = source.object;
        let bytes = await cache.get(id);
        if (bytes && bytes.length === o.bytes && (await digest(bytes)) === id) {
          stats.cacheHits++;
          report('cache', { id });
          return bytes;
        }
        if (bytes) await cache.delete(id);
        const packed = await request(source.url, o.downloadBytes);
        if (packed.length !== o.downloadBytes)
          throw Error('远端资源下载不完整');
        bytes =
          o.compression === 'gzip'
            ? await bounded(
                new Blob([packed])
                  .stream()
                  .pipeThrough(new DecompressionStream('gzip')),
                o.bytes,
              )
            : packed;
        if (bytes.length !== o.bytes || (await digest(bytes)) !== id)
          throw Error('远端资源校验失败：' + id);
        if (closed) throw Error('远端加载已取消');
        await cache.set(id, bytes);
        stats.objects++;
        report('verified', { id });
        return bytes;
      })();
      jobs.set(id, task);
      try {
        return await task;
      } finally {
        if (jobs.get(id) === task) jobs.delete(id);
      }
    }
    async function json(id: string): Promise<unknown> {
      return JSON.parse(dec.decode(await object(id)));
    }
    async function expand(
      value: unknown,
      chain: string[] = [],
    ): Promise<unknown> {
      if (typeof value === 'string' && value.startsWith('@json:')) {
        const id = value.slice(6);
        if (chain.length > 32 || chain.includes(id))
          throw Error('远端组件存在循环引用');
        return expand(await json(id), [...chain, id]);
      }
      if (Array.isArray(value))
        return Promise.all(value.map((v) => expand(v, chain)));
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value))
          Object.defineProperty(out, k, {
            value: await expand(v, chain),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        return out;
      }
      return value;
    }
    async function resolve(src: string): Promise<string> {
      if (typeof src !== 'string' || !src.startsWith('@asset:')) return src;
      const id = src.slice(7);
      const existing = urls.get(id);
      if (existing) return existing;
      const pending = urlJobs.get(id);
      if (pending) return pending;
      const task = (async () => {
        const bytes = await object(id);
        if (closed) throw Error('远端加载已取消');
        const url = URL.createObjectURL(
          new Blob([bytes], { type: sources.get(id)?.object.mime }),
        );
        urls.set(id, url);
        return url;
      })();
      urlJobs.set(id, task);
      try {
        return await task;
      } finally {
        urlJobs.delete(id);
      }
    }
    async function hydrate(
      value: unknown,
      baseIDs: Set<string>,
    ): Promise<unknown> {
      if (
        typeof value === 'string' &&
        value.startsWith('@asset:') &&
        baseIDs.has(value.slice(7))
      )
        return resolve(value);
      if (Array.isArray(value))
        return Promise.all(value.map((v) => hydrate(v, baseIDs)));
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value))
          Object.defineProperty(out, String(await hydrate(k, baseIDs)), {
            value: await hydrate(v, baseIDs),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        return out;
      }
      return value;
    }
    return {
      get stats() {
        return { ...stats };
      },
      get catalog() {
        return index;
      },
      resolve,
      object,
      async open(
        url: string,
        { release: expected }: { release?: string } = {},
      ) {
        const token = ++openToken,
          nextURL = new URL(
            url,
            typeof location === 'object' ? location.href : undefined,
          ),
          cacheKey = 'index:' + (await digest(enc.encode(nextURL.href)));
        let bytes;
        try {
          bytes = await request(nextURL.href, 4 * 1024 * 1024);
          validate(JSON.parse(dec.decode(bytes)));
          stats.offline = false;
        } catch (error) {
          bytes = await cache.get(cacheKey);
          if (!bytes) throw error;
          stats.offline = true;
          report('offline');
        }
        const next = validate(JSON.parse(dec.decode(bytes)));
        if (expected && next.release !== expected)
          throw Error('远端资源版本不匹配');
        if (closed || token !== openToken) throw Error('远端目录加载已取消');
        await cache.set(cacheKey, bytes);
        index = next;
        base = nextURL;
        for (const [id, o] of Object.entries(index.objects))
          sources.set(id, { object: o, url: new URL(o.path, base).href });
        report('catalog', { release: index.release });
        return index;
      },
      async loadCard(
        id: string,
        { tier = 'small' }: { tier?: 'small' | 'large' } = {},
      ) {
        const entry = index?.cards.find((c) => c.id === id);
        if (!entry) throw Error('远端卡牌不存在');
        const dependency = entry.webgl,
          baseIDs = new Set<string>([
            ...dependency.base,
            ...(tier === 'large' ? dependency.detail : []),
          ]);
        const config = await json(dependency.definition);
        await Promise.all(
          [...baseIDs].filter((id) => id !== dependency.definition).map(object),
        );
        const content = await hydrate(await expand(config), baseIDs);
        if (!record(content)) throw Error('远端卡牌定义无效');
        report('ready', { card: id });
        return content;
      },
      async clearCache() {
        if (jobs.size || controllers.size)
          throw Error('请等待当前下载完成后清理缓存');
        await cache.clear();
      },
      close() {
        closed = true;
        openToken++;
        for (const c of controllers) c.abort();
        for (const url of urls.values()) URL.revokeObjectURL(url);
        urls.clear();
      },
    };
  }
  return { create, validate, memoryCache, digest };
})();

export default api;
