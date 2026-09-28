export type InstagramProfileReport = {
  period: { days: number; requestedDays: number; limited: boolean; since: string; until: string }
  collectedAt: string
  available: boolean
  metrics: Record<"views" | "reach" | "accountsEngaged" | "interactions" | "likes" | "comments" | "shares" | "saves" | "replies" | "reposts" | "profileLinkTaps", number | null>
  followers: { gained: number | null; lost: number | null; net: number | null }
  dailyReach?: Array<{ date: string; value: number }>
  frequency: number | null
  engagementRate: number | null
  message?: string
}

export function instagramProfileWindow(report: InstagramProfileReport | null, requestedDays: number) {
  const days = report?.period.days ?? Math.min(requestedDays, 30)
  return {
    label: `Últimos ${days} dias`,
    notice: requestedDays > days
      ? `Resumo do perfil: últimos ${days} dias, limite desta consulta do Instagram. Publicações e histórico abaixo: últimos ${requestedDays} dias. O alcance não é somado entre janelas, para não contar a mesma pessoa várias vezes.`
      : `Resumo do perfil nos últimos ${days} dias. Totais consultados diretamente no Instagram; podem mudar enquanto a Meta atualiza os dados.`,
  }
}

export function instagramFollowerCards(report: InstagramProfileReport | null) {
  return [
    { label: "Novos seguidores", value: report?.followers.gained ?? null },
    { label: "Deixaram de seguir", value: report?.followers.lost ?? null },
    { label: "Saldo de seguidores", value: report?.followers.net ?? null },
  ]
}
