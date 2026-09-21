import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'InstaCommand - Gestão Inteligente de Instagram',
  description: 'Gerencie múltiplas contas do Instagram com agendamento, analytics e inteligência competitiva.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="light">
      <body className={`${inter.className} bg-background text-text min-h-screen flex antialiased selection:bg-indigo-100 selection:text-indigo-900`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
