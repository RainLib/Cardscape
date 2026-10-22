/** Promise deduplication, true LRU and byte bounds for decoded images. */
interface CacheEntry<T> {
  promise: Promise<T>;
  bytes: number;
  settled: boolean;
}
interface CacheOptions<T> {
  load(key: string): Promise<T>;
  size(value: T): number;
  keyBytes?(key: string): number;
  maxBytes: number;
  maxEntries: number;
  concurrency?: number;
}

export class ResourceCache<T> {
  private entries = new Map<string, CacheEntry<T>>();
  private active = 0;
  private waiting: Array<() => void> = [];
  private bytes = 0;
  private options: CacheOptions<T>;
  loads = 0;
  hits = 0;

  constructor(options: CacheOptions<T>) {
    if (
      options.maxEntries < 1 ||
      options.maxBytes < 1 ||
      (options.concurrency ?? 4) < 1
    )
      throw Error('Invalid cache budget');
    this.options = options;
  }

  get(key: string): Promise<T> {
    const cached = this.entries.get(key);
    if (cached) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.promise;
    }
    const entry: CacheEntry<T> = {
      promise: Promise.resolve(null as T),
      bytes: 0,
      settled: false,
    };
    this.entries.set(key, entry);
    entry.promise = this.load(key).then(
      (value) => {
        if (this.entries.get(key) === entry) {
          entry.bytes =
            Math.max(0, this.options.size(value)) +
            Math.max(0, this.options.keyBytes?.(key) ?? 0);
          entry.settled = true;
          this.bytes += entry.bytes;
          this.evict();
        }
        return value;
      },
      (error) => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw error;
      },
    );
    return entry.promise;
  }

  private async load(key: string): Promise<T> {
    const limit = this.options.concurrency ?? 4;
    if (this.active >= limit)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    this.loads++;
    try {
      return await this.options.load(key);
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }

  private evict(): void {
    for (const [key, entry] of this.entries) {
      if (
        this.bytes <= this.options.maxBytes &&
        this.entries.size <= this.options.maxEntries
      )
        break;
      // In-flight work remains deduplicated until it settles.
      if (!entry.settled) continue;
      this.entries.delete(key);
      this.bytes -= entry.bytes;
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
  get stats() {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      active: this.active,
      queued: this.waiting.length,
      hits: this.hits,
      loads: this.loads,
    };
  }
}
