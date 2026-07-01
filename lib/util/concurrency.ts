/**
 * Bounded-parallelism map: run `fn` over `items` with at most `limit` in flight,
 * preserving input order in the results. Used by the resolution workflow to
 * fan out per-track resolution without overwhelming upstream hosts.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const max = Math.max(1, Math.floor(limit));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(max, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * Per-host throttle: ensures a minimum interval between calls keyed by host, and
 * caps concurrent in-flight calls per host. Clock + sleep are injectable so it is
 * deterministically testable.
 */
export interface HostThrottleOptions {
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createHostThrottle(options: HostThrottleOptions = {}) {
  const minInterval = options.minIntervalMs ?? 0;
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const nextAllowed = new Map<string, number>();

  return async function throttle<R>(host: string, fn: () => Promise<R>): Promise<R> {
    const earliest = nextAllowed.get(host) ?? 0;
    const current = now();
    const wait = Math.max(0, earliest - current);
    if (wait > 0) await sleep(wait);
    nextAllowed.set(host, Math.max(current, earliest) + minInterval);
    return fn();
  };
}
