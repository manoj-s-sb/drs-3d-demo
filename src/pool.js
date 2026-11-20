// Rolling concurrency pool: run `worker` over `items` with at most `concurrency`
// running at once. The moment one finishes, the next starts (no batch stalls).
// Calls onResult(result, item, index) as each finishes. Honours an AbortSignal:
// if it aborts, no more items are started and the promise resolves early.
//
//   await runPool(balls, (b) => loadTrajectory(b), {
//     concurrency: 6,
//     signal: ac.signal,
//     onResult: (res, b) => addDot(res, b),
//   });
export async function runPool(items, worker, opts = {}) {
  const { concurrency = 6, signal, onResult } = opts;
  const list = Array.from(items);
  let next = 0;

  async function runWorker() {
    while (next < list.length) {
      if (signal?.aborted) return;
      const i = next++;
      const item = list[i];
      let result = null;
      try {
        result = await worker(item, i);
      } catch {
        result = null; // one failure never stops the pool
      }
      if (signal?.aborted) return; // dropped: filter changed mid-flight
      onResult?.(result, item, i);
    }
  }

  const n = Math.max(1, Math.min(concurrency, list.length));
  await Promise.all(Array.from({ length: n }, runWorker));
}
