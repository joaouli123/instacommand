// Turns each network report into the same small card for the dashboard: who the profile
// is, its audience and up to four numbers of the period, with the previous period when known.

export type SummaryMetric = { key: string; label: string; value: number | null; previous?: number | null; format?: 'number' | 'percent' | 'minutes' };
export type CompanyNetworkSummary = {
  network: string; accountId?: string; name: string; handle?: string | null; avatarUrl?: string | null;
  status: 'ok' | 'error'; error?: string; audience: number | null; audienceLabel: string; metrics: SummaryMetric[];
  notice?: string | null;
};

const value = (metric: { value?: number | null; available?: boolean } | undefined) => metric && metric.available !== false && typeof metric.value === 'number' ? metric.value : null;
const sum = (...values: Array<number | null | undefined>) => values.some((item) => typeof item === 'number') ? values.reduce<number>((total, item) => total + (item ?? 0), 0) : null;

export function failedSummary(network: string, reason: unknown): CompanyNetworkSummary {
  return { network, name: '', status: 'error', error: reason instanceof Error ? reason.message : 'Não foi possível carregar esta rede agora.', audience: null, audienceLabel: '', metrics: [] };
}

export function summarizeInstagram(company: { id: string; igUsername: string; igName?: string | null; igProfilePicUrl?: string | null }, stats: { followers: number | null; followerGrowth?: number | null; reach: number | null; interactions: number | null; engagementRate: number | null }): CompanyNetworkSummary {
  return {
    network: 'INSTAGRAM', accountId: company.id, name: company.igName || company.igUsername, handle: `@${company.igUsername}`, avatarUrl: company.igProfilePicUrl ?? null,
    status: 'ok', audience: stats.followers, audienceLabel: 'Seguidores',
    metrics: [
      { key: 'followerGrowth', label: 'Novos seguidores', value: stats.followerGrowth ?? null },
      { key: 'reach', label: 'Alcance', value: stats.reach },
      { key: 'interactions', label: 'Interações', value: stats.interactions },
      { key: 'engagementRate', label: 'Engajamento', value: stats.engagementRate, format: 'percent' },
    ],
  };
}

type Total = { value: number | null };
export function summarizeFacebook(company: { id: string; pageName?: string | null; igUsername: string }, body: any): CompanyNetworkSummary {
  if (!body) return failedSummary('FACEBOOK', new Error('Página do Facebook não encontrada.'));
  const totals = (body.totals || {}) as Record<string, Total>;
  const previous = (body.previous?.totals || {}) as Record<string, Total>;
  return {
    network: 'FACEBOOK', accountId: company.id, name: body.page?.name || company.pageName || 'Página do Facebook', handle: null, avatarUrl: body.page?.picture ?? null,
    status: 'ok', audience: body.followers ?? null, audienceLabel: 'Seguidores',
    metrics: [
      { key: 'views', label: 'Visualizações', value: body.insights?.mediaViews ?? null, previous: body.previous?.mediaViews ?? null },
      { key: 'posts', label: 'Publicações', value: body.contentAvailable ? body.posts?.length ?? null : null, previous: body.previous?.posts ?? null },
      { key: 'reactions', label: 'Reações', value: totals.reactions?.value ?? null, previous: previous.reactions?.value ?? null },
      { key: 'comments', label: 'Comentários', value: totals.comments?.value ?? null, previous: previous.comments?.value ?? null },
    ],
    notice: body.issues?.length ? 'Alguns números da Página não foram liberados pelo Facebook.' : null,
  };
}

export function summarizeThreads(body: any): CompanyNetworkSummary {
  if (!body) return failedSummary('THREADS', new Error('Perfil do Threads não encontrado.'));
  const metrics = body.metrics || {}, previous = body.previous?.metrics || {};
  return {
    network: 'THREADS', accountId: body.account?.id, name: body.account?.name || body.account?.username, handle: `@${body.account?.username}`, avatarUrl: null,
    status: 'ok', audience: value(metrics.followers_count), audienceLabel: 'Seguidores',
    metrics: [
      { key: 'views', label: 'Visualizações', value: value(metrics.views), previous: value(previous.views) },
      { key: 'likes', label: 'Curtidas', value: value(metrics.likes), previous: value(previous.likes) },
      { key: 'replies', label: 'Respostas', value: value(metrics.replies), previous: value(previous.replies) },
      { key: 'reposts', label: 'Reposts', value: sum(value(metrics.reposts), value(metrics.quotes)), previous: sum(value(previous.reposts), value(previous.quotes)) },
    ],
  };
}

export function summarizeX(body: any): CompanyNetworkSummary {
  if (!body) return failedSummary('X', new Error('Perfil do X não encontrado.'));
  const totals = body.totals || {}, previous = body.previous?.totals || {};
  return {
    network: 'X', accountId: body.account?.id, name: body.account?.name || body.account?.username, handle: `@${body.account?.username}`, avatarUrl: body.account?.profilePicUrl ?? null,
    status: 'ok', audience: body.followers ?? null, audienceLabel: 'Seguidores',
    metrics: [
      { key: 'impressions', label: 'Visualizações', value: totals.impressions ?? null, previous: previous.impressions ?? null },
      { key: 'engagement', label: 'Engajamentos', value: totals.engagement ?? null, previous: previous.engagement ?? null },
      { key: 'posts', label: 'Posts', value: totals.posts ?? null, previous: previous.posts ?? null },
      { key: 'engagementRate', label: 'Engajamento', value: body.engagementRate ?? null, previous: body.previous?.engagementRate ?? null, format: 'percent' },
    ],
  };
}

export function summarizeYouTube(body: any): CompanyNetworkSummary {
  if (!body) return failedSummary('YOUTUBE', new Error('Canal do YouTube não encontrado.'));
  const analytics = body.analytics?.available ? body.analytics : null;
  const previous = body.previous;
  return {
    network: 'YOUTUBE', accountId: body.account?.id, name: body.account?.title, handle: body.account?.handle ?? null, avatarUrl: body.account?.thumbnailUrl ?? null,
    status: 'ok', audience: body.channel?.subscribers ?? null, audienceLabel: 'Inscritos',
    metrics: analytics ? [
      { key: 'views', label: 'Visualizações', value: analytics.totals.views, previous: previous?.views ?? null },
      { key: 'watchMinutes', label: 'Tempo assistido', value: analytics.totals.watchMinutes, previous: previous?.watchMinutes ?? null, format: 'minutes' },
      { key: 'subscribers', label: 'Inscritos no período', value: analytics.totals.subscribersGained - analytics.totals.subscribersLost, previous: previous ? previous.subscribersGained - previous.subscribersLost : null },
      { key: 'videos', label: 'Vídeos publicados', value: body.totals?.videos ?? null },
    ] : [
      { key: 'videos', label: 'Vídeos publicados', value: body.totals?.videos ?? null },
      { key: 'videoViews', label: 'Views dos vídeos', value: body.totals?.views ?? null },
      { key: 'likes', label: 'Curtidas', value: body.totals?.likes ?? null },
      { key: 'comments', label: 'Comentários', value: body.totals?.comments ?? null },
    ],
    notice: analytics ? null : body.analytics?.reason === 'scope' ? 'Reconecte o canal em Contas para ver visualizações, tempo assistido e inscritos.' : body.analytics?.message || null,
  };
}
