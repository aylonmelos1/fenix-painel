import { performance } from 'node:perf_hooks';

export class OdooRequestQueueFullError extends Error {
  constructor() {
    super('A fila de consultas Odoo está cheia.');
    this.name = 'OdooRequestQueueFullError';
  }
}

type OdooRequestQueueOptions = {
  minIntervalMs?: number;
  maxPending?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Serializes Odoo calls and enforces a minimum interval between request starts. */
export class OdooRequestQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  private nextStartAt = 0;
  private readonly minIntervalMs: number;
  private readonly maxPending: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: OdooRequestQueueOptions = {}) {
    this.minIntervalMs = Math.max(0, options.minIntervalMs ?? 1000);
    this.maxPending = Math.max(1, Math.floor(options.maxPending ?? 64));
    this.now = options.now ?? (() => performance.now());
    this.sleep = options.sleep ?? delay;
  }

  enqueue<T>(request: () => Promise<T> | T): Promise<T> {
    if (this.pending >= this.maxPending) throw new OdooRequestQueueFullError();
    this.pending += 1;

    const result = this.tail.then(async () => {
      const waitMs = Math.max(0, this.nextStartAt - this.now());
      if (waitMs > 0) await this.sleep(waitMs);
      this.nextStartAt = this.now() + this.minIntervalMs;
      return request();
    });

    this.tail = result.then(() => undefined, () => undefined).finally(() => {
      this.pending -= 1;
    });
    return result;
  }

  deferFor(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    this.nextStartAt = Math.max(this.nextStartAt, this.now() + milliseconds);
  }
}
