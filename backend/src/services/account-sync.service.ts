import { saveProfileSnapshot } from './instagram/insights.service';

type SyncResult = Awaited<ReturnType<typeof saveProfileSnapshot>>;

// One sync per account at a time in this process: the automatic sync started
// right after connecting and a manual "Sincronizar" click share the same run
// instead of importing the same media and snapshots twice.
const running = new Map<string, Promise<SyncResult>>();

export function syncAccountOnce(accountId: string): Promise<SyncResult> {
  const current = running.get(accountId);
  if (current) return current;
  const run = saveProfileSnapshot(accountId).finally(() => running.delete(accountId));
  running.set(accountId, run);
  return run;
}

export const isAccountSyncRunning = (accountId: string) => running.has(accountId);

/** First sync right after a connection, so profile, posts and metrics appear without waiting for the scheduled job. */
export function syncAccountsInBackground(accountIds: string[]) {
  const unique = [...new Set(accountIds)];
  if (!unique.length) return;
  void (async () => {
    // Sequential: one authorization can bring many accounts, and Meta rate-limits per app.
    for (const accountId of unique) {
      try {
        await syncAccountOnce(accountId);
      } catch (error) {
        console.error(`Initial sync failed for account ${accountId}:`, error instanceof Error ? error.message : error);
      }
    }
  })();
}
