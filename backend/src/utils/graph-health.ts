// Shared view of the Graph API's health for this process: which failures are worth retrying and
// how close Meta says the app/business is to its rate limit (X-App-Usage / X-Business-Use-Case-Usage).

/** Graph codes Meta documents as temporary (unknown, service, app/user/page throttling). */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80001, 80002]);

export const isTransientGraphError = (error: unknown) => {
  const value = error as { metaCode?: number; statusCode?: number; status?: number; message?: string } | null;
  if (!value || typeof value !== 'object') return false;
  if (typeof value.metaCode === 'number') return TRANSIENT_CODES.has(value.metaCode);
  const status = value.statusCode ?? value.status;
  if (typeof status === 'number' && status >= 500) return true;
  // Network failures and our own 30 s timeout carry no Meta code.
  return /timeout|aborted|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(String(value.message || ''));
};

// Per token (≈ per customer account/business) plus the app-wide window shared by every customer.
// Kept in memory per replica: it only decides whether to spend or defer a call, never correctness.
const usage = new Map<string, { percent: number; at: number }>();
const USAGE_TTL_MS = 10 * 60_000;
const MAX_TRACKED = 20_000;

const highest = (value: unknown): number => {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return Math.max(0, ...value.map(highest));
  const entry = value as Record<string, unknown>;
  const own = ['call_count', 'total_time', 'total_cputime', 'acc_id_util_pct']
    .map((key) => Number(entry[key])).filter(Number.isFinite);
  return Math.max(0, ...own, ...Object.values(entry).filter((item) => item && typeof item === 'object').map(highest));
};

const tokenKey = (token: string) => token.slice(-24);
const read = (header: string | null) => { if (!header) return 0; try { return highest(JSON.parse(header)); } catch { return 0; } };

/** Records the usage headers of a Graph response (percentages of the current window). */
export const recordGraphUsage = (token: string, headers: { get(name: string): string | null }) => {
  const now = Date.now();
  const app = read(headers.get('x-app-usage'));
  const business = Math.max(read(headers.get('x-business-use-case-usage')), read(headers.get('x-ad-account-usage')));
  if (headers.get('x-app-usage')) usage.set('app', { percent: app, at: now });
  if (token && (business || usage.has(tokenKey(token)))) {
    if (usage.size > MAX_TRACKED) usage.clear();
    usage.set(tokenKey(token), { percent: business, at: now });
  }
  if (Math.max(app, business) >= 80) console.warn('Meta Graph API usage is high:', { app, business });
};

const fresh = (key: string) => { const entry = usage.get(key); return entry && Date.now() - entry.at < USAGE_TTL_MS ? entry.percent : 0; };

/** Highest recent usage for this token's business and for the whole app (0 when unknown). */
export const graphUsagePercent = (token = '') => Math.max(fresh('app'), token ? fresh(tokenKey(token)) : 0);

export const resetGraphUsage = () => usage.clear();

/** Small random spread so many posts due in the same minute do not hit Meta at once. */
export const jitter = (maxMs: number) => Math.floor(Math.random() * maxMs);
