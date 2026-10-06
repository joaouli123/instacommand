// Cross-tab signal for "a social account was just connected". The OAuth flow
// finishes in a separate tab; every other open tab of the app must refresh.
const CHANNEL = 'instacommand-oauth'
const STORAGE_KEY = 'instacommand-oauth-completed'
export const SAME_TAB_EVENT = 'instacommand-accounts-connected'

// BroadcastChannel also delivers to other channel objects in the same tab, so
// each tab tags its messages and ignores its own.
const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

type Message = { type: 'accounts-connected'; from: string } | { type: 'accounts-connected-ack'; from: string; to: string }

const openChannel = () => (typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null)

/**
 * Tells the other tabs that accounts were connected. Resolves true when another
 * tab of the app acknowledged it, meaning this tab was opened only for the
 * authorization and can be closed.
 */
export function announceAccountsConnected(waitMs = 1500): Promise<boolean> {
  const channel = openChannel()
  if (!channel) {
    try { localStorage.setItem(STORAGE_KEY, Date.now().toString()) } catch { /* storage blocked */ }
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    const finish = (acknowledged: boolean) => { window.clearTimeout(timer); channel.close(); resolve(acknowledged) }
    const timer = window.setTimeout(() => finish(false), waitMs)
    channel.onmessage = (event: MessageEvent<Message>) => {
      if (event.data?.type === 'accounts-connected-ack' && event.data.to === TAB_ID && event.data.from !== TAB_ID) finish(true)
    }
    channel.postMessage({ type: 'accounts-connected', from: TAB_ID } satisfies Message)
  })
}

/** Runs `onConnected` when another tab finishes a connection, and acknowledges it. */
export function subscribeAccountsConnected(onConnected: () => void) {
  const channel = openChannel()
  const onMessage = (event: MessageEvent<Message>) => {
    if (event.data?.type !== 'accounts-connected' || event.data.from === TAB_ID) return
    channel?.postMessage({ type: 'accounts-connected-ack', from: TAB_ID, to: event.data.from } satisfies Message)
    onConnected()
  }
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) onConnected() }
  channel?.addEventListener('message', onMessage)
  window.addEventListener('storage', onStorage)
  return () => {
    channel?.removeEventListener('message', onMessage)
    channel?.close()
    window.removeEventListener('storage', onStorage)
  }
}

/** Same-tab notification, used when the authorization returned to this very tab. */
export const notifySameTabAccountsConnected = () => window.dispatchEvent(new Event(SAME_TAB_EVENT))
