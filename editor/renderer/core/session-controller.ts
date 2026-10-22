import type { EncodedSnapshot } from '../../shared/contracts';

export type SessionStatus = 'pending' | 'saved' | 'error';
export interface RecoveryState {
  ready: boolean;
  blocked: boolean;
  documentKey: string;
  cardId: string;
  revision: number;
  savedRevision: number;
  view: unknown;
}
export interface RecoveryOptions {
  state(): RecoveryState;
  capture(): unknown;
  encode(value: unknown): Promise<EncodedSnapshot>;
  save(value: {
    token: string;
    sequence: number;
    project: EncodedSnapshot['project'];
    blobs: Record<string, string>;
    view: unknown;
    revision: number;
    savedRevision: number;
  }): Promise<{ stale?: boolean }>;
  status(status: SessionStatus, cardId?: string): void;
  error(error: unknown): void;
  schedule?(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  cancel?(timer: ReturnType<typeof setTimeout>): void;
}

/** Owns recovery sequencing; rendering and automatic playback never trigger writes. */
export function createSessionController(options: RecoveryOptions) {
  let token: string | null = null,
    sequence = 0,
    fingerprint = '',
    again = false,
    failed = false;
  let timer: ReturnType<typeof setTimeout> | undefined,
    flight: Promise<void> | null = null;
  const schedule: NonNullable<RecoveryOptions['schedule']> =
    options.schedule || ((callback, delay) => setTimeout(callback, delay));
  const cancel = options.cancel || clearTimeout;
  const clear = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  function queue() {
    if (!token || !options.state().ready) return;
    clear();
    timer = schedule(() => {
      timer = undefined;
      void persist();
    }, 180);
  }
  async function persistNow() {
    const state = options.state();
    if (!token || !state.ready) return;
    if (state.blocked) {
      queue();
      return;
    }
    const current = JSON.stringify([state.documentKey, state.view]);
    if (current === fingerprint) return;
    const capturedToken = token,
      capturedSequence = ++sequence;
    options.status('pending');
    try {
      const encoded = await options.encode(options.capture());
      const result = await options.save({
        token: capturedToken,
        sequence: capturedSequence,
        project: encoded.project,
        blobs: encoded.blobs,
        view: state.view,
        revision: state.revision,
        savedRevision: state.savedRevision,
      });
      if (capturedToken !== token || result.stale) return;
      encoded.ack();
      fingerprint = current;
      failed = false;
      // A preview clock changes continuously. Only document edits or queued UI changes matter.
      if (options.state().documentKey !== state.documentKey || again) {
        again = true;
        options.status('pending');
      } else options.status('saved', state.cardId);
    } catch (error) {
      if (capturedToken === token) {
        failed = true;
        options.status('error');
        options.error(error);
      }
    } finally {
      if (again) {
        again = false;
        queue();
      }
    }
  }
  function persist(): Promise<void> {
    if (flight) {
      again = true;
      return flight;
    }
    flight = persistNow().finally(() => {
      flight = null;
    });
    return flight;
  }
  return {
    queue,
    persist,
    activate(nextToken: string) {
      clear();
      token = nextToken;
      sequence = 0;
      fingerprint = '';
      failed = false;
      again = false;
    },
    suspend() {
      clear();
      token = null;
      again = false;
    },
    async flush() {
      if (options.state().blocked)
        throw Error('请先结束当前操作，再同步恢复副本');
      clear();
      if (flight) await flight;
      // Edits may arrive during either write. Drain queued revisions before leaving.
      do {
        clear();
        if (options.state().blocked)
          throw Error('请先结束当前操作，再同步恢复副本');
        await persist();
        if (failed) {
          clear();
          throw Error('恢复副本未同步成功，请重试后再切换工程');
        }
      } while (timer !== undefined);
    },
    unload() {
      clear();
      if (options.state().ready) void persist();
    },
  };
}
