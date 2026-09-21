const STORAGE_KEY = 'instacommand_active_account'
const CHANGED_EVENT = 'instacommand-account-changed'
let fallbackId = ''

export function getSelectedAccountId(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return fallbackId
  }
}

export const getServerAccountId = () => ''

export function subscribeToAccount(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener(CHANGED_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function selectAccount(id: string) {
  if (getSelectedAccountId() === id) return
  fallbackId = id
  try { window.localStorage.setItem(STORAGE_KEY, id) } catch { /* Session-only selection. */ }
  window.dispatchEvent(new Event(CHANGED_EVENT))
}
