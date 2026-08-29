/**
 * Runs `fn` over `items` with at most `concurrency` calls in flight at once.
 *
 * Unlike a serial `for` loop (wall-clock cost = sum of every call) or
 * `Promise.all` (fires every call at once, unbounded), this caps how many
 * outbound calls run concurrently — useful for a backlog of unknown size
 * hitting a rate-limited external API (e.g. a payment gateway), where a
 * traffic spike or outage can produce N stale rows and you want throughput
 * to scale with the backlog without either slogging through it one at a
 * time or opening N simultaneous connections.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
