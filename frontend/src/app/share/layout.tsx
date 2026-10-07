import type { Metadata } from 'next'

// The token in the address is the only credential: keep it out of Referer
// headers sent to media CDNs and out of search engines.
export const metadata: Metadata = {
  title: 'Calendário de conteúdo',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children
}
