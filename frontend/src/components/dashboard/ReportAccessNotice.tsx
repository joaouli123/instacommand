'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api'
import { Info } from 'lucide-react'

export function ReportAccessNotice({ accountId, network }: { accountId: string; network: 'Instagram' | 'Facebook' }) {
  const access = useQuery<{ verified: boolean; instagramInsights: boolean | null; facebookInsights: boolean | null; facebookCounters: boolean | null }>({
    queryKey: ['analytics-access', accountId], enabled: !!accountId,
    queryFn: ({ signal }) => fetchApi(`/analytics/${encodeURIComponent(accountId)}/access`, { signal }), staleTime: 5 * 60_000, retry: false,
  })
  const missing = network === 'Instagram' ? access.data?.instagramInsights === false : access.data?.facebookInsights === false || access.data?.facebookCounters === false
  if (!access.data?.verified || !missing) return null
  return <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4">
    <Info size={18} className="mt-0.5 shrink-0 text-amber-700"/>
    <div className="min-w-0 text-xs leading-relaxed text-amber-950"><p className="font-semibold">Sua conexão ainda não liberou todas as métricas</p><p className="mt-1">{network === 'Instagram' ? 'Alcance, visualizações e dados de público precisam da autorização de métricas do Instagram.' : 'Visualizações e alguns contadores precisam de autorizações adicionais da Página.'} Os dados já disponíveis continuam aparecendo.</p><a className="mt-1.5 inline-flex min-h-8 items-center font-semibold underline underline-offset-2" href="/accounts">Revisar conexão</a><details className="mt-1 text-[11px] text-amber-800"><summary className="cursor-pointer">Informações para o administrador</summary><p className="mt-1">{network === 'Instagram' ? 'Permissão ausente: instagram_manage_insights.' : [access.data.facebookInsights === false ? 'read_insights' : '', access.data.facebookCounters === false ? 'pages_read_user_content' : ''].filter(Boolean).join(' · ')} A Meta também pode exigir aprovação do aplicativo para contas de clientes.</p></details></div>
  </div>
}
