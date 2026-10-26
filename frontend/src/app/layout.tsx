import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'
import { Providers } from './providers'
import { hasBrowserSessionHint } from '@/lib/browser-session-hint'

const inter = Inter({ subsets: ['latin'] })

// A fresh nonce must be rendered into the HTML; never reuse static/cached HTML.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'UX Code Social — Gestão de redes sociais',
  description: 'Produto independente da UX Code para agendamento, relatórios e gestão de interações de contas sociais autorizadas. Não é o Instagram nem um produto da Meta.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const hasBrowserSession = await hasBrowserSessionHint()
  return (
    <html lang="pt-BR" className="light">
      <body className={`${inter.className} bg-background text-text min-h-screen flex antialiased selection:bg-indigo-100 selection:text-indigo-900`}>
        <Providers>
          <AppShell hasBrowserSession={hasBrowserSession}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
