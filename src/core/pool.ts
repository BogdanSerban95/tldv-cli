/**
 * Bounded-concurrency map. Hand-rolled to keep the runtime dependency list at three.
 *
 * Rejections are captured per item rather than aborting the run: a bulk export should not
 * lose 90 good meetings because one had no transcript.
 */

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function mapPool<In, Out>(
  items: readonly In[],
  concurrency: number,
  worker: (item: In, index: number) => Promise<Out>,
): Promise<Settled<Out>[]> {
  const results = new Array<Settled<Out>>(items.length);
  const limit = Math.max(1, Math.min(Math.trunc(concurrency), items.length || 1));
  let cursor = 0;

  const runners = Array.from({ length: limit }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await worker(items[index]!, index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  });

  await Promise.all(runners);
  return results;
}
