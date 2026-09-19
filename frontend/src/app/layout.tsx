import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
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
          <Sidebar />
          <div className="flex-1 flex min-h-screen min-w-0 flex-col bg-[#f8fafc]">
            <Header />
            <main className="flex-1 overflow-auto p-4 sm:p-6 md:p-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
