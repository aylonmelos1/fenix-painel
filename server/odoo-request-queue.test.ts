import assert from 'node:assert/strict';
import test from 'node:test';
import { OdooRequestQueue, OdooRequestQueueFullError } from './odoo-request-queue.js';

test('serializes Odoo calls and spaces their start times', async () => {
  let now = 0;
  let active = 0;
  let maxActive = 0;
  const starts: number[] = [];
  const queue = new OdooRequestQueue({
    minIntervalMs: 1000,
    now: () => now,
    sleep: async (milliseconds) => { now += milliseconds; }
  });

  const results = await Promise.all(Array.from({ length: 4 }, (_, index) => queue.enqueue(async () => {
    starts.push(now);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active -= 1;
    return index;
  })));

  assert.deepEqual(results, [0, 1, 2, 3]);
  assert.deepEqual(starts, [0, 1000, 2000, 3000]);
  assert.equal(maxActive, 1);
});

test('honors a server cooldown before starting queued calls', async () => {
  let now = 0;
  const starts: number[] = [];
  const queue = new OdooRequestQueue({
    minIntervalMs: 1000,
    now: () => now,
    sleep: async (milliseconds) => { now += milliseconds; }
  });

  await Promise.all([
    queue.enqueue(() => { starts.push(now); queue.deferFor(5000); }),
    queue.enqueue(() => { starts.push(now); })
  ]);

  assert.deepEqual(starts, [0, 5000]);
});

test('continues draining after a failed call and rejects excess pending work', async () => {
  let now = 0;
  let releaseFirst: (() => void) | undefined;
  const queue = new OdooRequestQueue({
    minIntervalMs: 0,
    maxPending: 2,
    now: () => now,
    sleep: async (milliseconds) => { now += milliseconds; }
  });
  const first = queue.enqueue(() => new Promise<void>((resolve) => { releaseFirst = resolve; }));
  const second = queue.enqueue(() => { throw new Error('expected failure'); });
  assert.throws(() => queue.enqueue(() => undefined), OdooRequestQueueFullError);

  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseFirst?.();
  await first;
  await assert.rejects(second, /expected failure/);

  const third = await queue.enqueue(() => 'drained');
  assert.equal(third, 'drained');
});
