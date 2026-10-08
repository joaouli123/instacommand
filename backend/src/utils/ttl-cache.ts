// Small in-process TTL cache for provider-backed reports (Meta/Threads). Each
// report costs several Graph API calls and seconds of latency, and dashboards
// ask for the same one repeatedly while the user switches tabs and periods.
// Concurrent callers share one in-flight promise, failures are never cached,
// and `refresh` (the ?refresh=1 query) forces a new provider read.
type Entry = { expires: number; promise: Promise<unknown> };

const MAX_ENTRIES = 500;
const entries = new Map<string, Entry>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, options: { refresh?: boolean; keep?: (value: T) => boolean } = {}): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (!options.refresh && hit && hit.expires > now) return hit.promise as Promise<T>;
  if (entries.size >= MAX_ENTRIES) {
    for (const [entryKey, entry] of entries) if (entry.expires <= now) entries.delete(entryKey);
    if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  }
  const entry: Entry = { expires: now + ttlMs, promise: Promise.resolve() };
  entry.promise = load().then((value) => {
    // Empty/missing answers (account not found, Meta returned nothing) are not kept.
    if (options.keep && !options.keep(value) && entries.get(key) === entry) entries.delete(key);
    return value;
  }, (error) => {
    if (entries.get(key) === entry) entries.delete(key);
    throw error;
  });
  entries.set(key, entry);
  return entry.promise as Promise<T>;
}

/** Drops every entry whose key contains one of the given ids (e.g. after a sync). */
export function invalidateCached(...ids: string[]) {
  const wanted = ids.filter(Boolean);
  for (const key of entries.keys()) if (wanted.some((id) => key.includes(id))) entries.delete(key);
}
