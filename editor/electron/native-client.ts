import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { nativeBinary } from './paths';
import { errorMessage, isRecord } from './validation';
import type { NativeResults, Timed } from '../shared/native-protocol';

interface WorkerOptions {
  args?: string[];
  label?: string;
}
interface PendingCall {
  child: ChildProcessWithoutNullStreams;
  timer: ReturnType<typeof setTimeout>;
  resolve(value: Timed<Record<string, unknown>>): void;
  reject(error: Error): void;
}
export class NativeWorker {
  readonly binary: string;
  readonly args: string[];
  readonly label: string;
  private pending = new Map<number, PendingCall>();
  private nextId = 1;
  private child: ChildProcessWithoutNullStreams | null = null;
  constructor(binary = nativeBinary, options: WorkerOptions = {}) {
    this.binary = binary;
    this.args = options.args || [];
    this.label = options.label || 'Rust';
  }
  start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const child = spawn(this.binary, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try {
        const response: unknown = JSON.parse(line);
        if (!isRecord(response) || typeof response.id !== 'number') return;
        const entry = this.pending.get(response.id);
        if (!entry || entry.child !== child) return;
        if (typeof response.ok !== 'boolean')
          throw Error('Malformed native response');
        if (response.ok) {
          if (
            !isRecord(response.result) ||
            typeof response.elapsed_ms !== 'number'
          )
            throw Error('Malformed native response');
          this.pending.delete(response.id);
          clearTimeout(entry.timer);
          entry.resolve({ ...response.result, elapsedMs: response.elapsed_ms });
        } else {
          if (typeof response.error !== 'string')
            throw Error('Malformed native response');
          this.pending.delete(response.id);
          clearTimeout(entry.timer);
          entry.reject(Error(response.error));
        }
      } catch (error) {
        this.fail(
          child,
          Error('Invalid native response: ' + errorMessage(error)),
        );
        child.kill();
      }
    });
    // A canceled worker may close the pipe while a large PNG is still buffered.
    child.stdin.on('error', (error) => this.fail(child, error));
    child.stderr.on('data', (data: Buffer) => process.stderr.write(data));
    child.on('error', (error) => this.fail(child, error));
    child.on('exit', () =>
      this.fail(child, Error(this.label + ' worker exited')),
    );
    return child;
  }
  private fail(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child === child) this.child = null;
    for (const [id, entry] of this.pending)
      if (entry.child === child) {
        clearTimeout(entry.timer);
        entry.reject(error);
        this.pending.delete(id);
      }
  }
  call<K extends keyof NativeResults>(
    op: K,
    args?: unknown,
  ): Promise<Timed<NativeResults[K]>>;
  call<T extends object = Record<string, unknown>>(
    op: string,
    args?: unknown,
  ): Promise<Timed<T>>;
  call(
    op: string,
    args: unknown = {},
  ): Promise<Timed<Record<string, unknown>>> {
    const child = this.start(),
      id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.cancel(), 120_000);
      this.pending.set(id, { resolve, reject, timer, child });
      child.stdin.write(JSON.stringify({ id, op, args }) + '\n', (error) => {
        if (error) this.fail(child, error);
      });
    });
  }
  cancel(): void {
    const child = this.child;
    if (!child) return;
    this.fail(child, Error('处理已取消'));
    child.kill();
  }
  close(): void {
    this.cancel();
  }
}
