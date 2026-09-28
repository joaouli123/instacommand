// Explicitly synthetic UI scenarios. Localhost only; no credentials or provider calls.
// Run: node tests/fixtures/report-api.cjs; point NEXT_PUBLIC_BACKEND_URL to port 4312.
const http = require('node:http');
const now = new Date().toISOString();
const account = { id: '33333333-3333-4333-8333-333333333333', igUsername: 'teste_visual_ficticio', igName: 'Perfil fictício de validação', igFollowersCount: 5328, pageName: 'Página fictícia para validação', pageId: 'page-fixture', isActive: true, lastSyncAt: now };
const date = (day) => `2026-09-${String(day).padStart(2, '0')}`;
const growth = Array.from({ length: 28 }, (_, i) => ({ date: date(i + 1), followers: 5200 + i * 5, reach: i === 12 ? null : 400 + i * 12, views: 600 + i * 17, interactions: i * 3 }));
const engagement = growth.map((row, i) => ({ date: row.date, likes: i * 2, comments: i % 5, saves: i === 12 ? null : i % 3, shares: 0, reach: row.reach, impressions: row.views, engagement: 3, posts: 1, interactions: i * 3 }));
const posts = Array.from({ length: 25 }, (_, i) => ({ id: `fixture-${i}`, mediaType: ['REEL', 'CAROUSEL', 'IMAGE'][i % 3], caption: `Publicação fictícia ${i + 1}: conteúdo de exemplo para testar busca, paginação e quebras de linha.`, publishedAt: `${date(28 - i)}T12:00:00Z`, igMediaUrl: null, igPermalink: null, metrics: { likes: i === 2 ? null : 46 - i, comments: i % 3, saves: i === 2 ? null : 0, shares: i % 4, views: 1038 - i * 20, reach: 770 - i * 10, interactions: 48 - i, engagement: 3.44 } }));
const dashboard = { followers: 5328, followerGrowth: 2.8, hasFollowerHistory: true, reach: 2556, views: 5367, impressions: 5367, accountsEngaged: 88, profileLinkTaps: 0, interactions: 170, interactionsPartial: false, engagementRate: 3.44, pendingPosts: 2 };
const period = { days: 30, since: '2026-08-29T00:00:00Z', until: now };
const facebook = { account: { instagram: account.igUsername }, page: { id: account.pageId, name: account.pageName }, collectedAt: now, period, followers: 3210, pageLikes: 2541, posts: posts.map(p => ({ id: p.id, text: p.caption, createdAt: p.publishedAt, permalink: null, reactions: p.metrics.likes, comments: p.metrics.comments, shares: p.metrics.shares })), contentAvailable: true, complete: true, totals: { reactions: { value: 786, availablePosts: 24, complete: false }, comments: { value: 24, availablePosts: 25, complete: true }, shares: { value: 36, availablePosts: 25, complete: true } }, insights: { mediaViews: 5367, mediaViewsAvailable: true, daily: growth.map(row => ({ date: row.date, value: row.views })) }, issues: ['Um post fictício não tem contagem de reações.'], measurement: 'Contadores acumulados dos posts, agrupados pela data da publicação. Não representam interações recebidas em cada dia.' };
const threads = { account: { id: 'threads-fixture', username: 'threads_ficticio', name: 'Threads fictício' }, collectedAt: now, period, metrics: Object.fromEntries(['views', 'likes', 'replies', 'reposts', 'quotes', 'followers_count'].map((key, i) => [key, { value: [4548, 46, 37, 1, 0, 377][i], available: true, daily: key === 'followers_count' ? [] : growth.map((row, index) => ({ date: `${date(index + 2)}T00:00:00Z`, value: i === 0 ? row.views : index % (i + 1) })) }])), posts: posts.map(p => ({ id: p.id, text: p.caption, timestamp: p.publishedAt, permalink: null, mediaType: 'TEXT_POST' })), contentAvailable: true, truncated: false, issues: [] };
facebook.insights.history = {
  viewers: growth.map(row => ({ date: row.date, value: row.reach })),
  followers: growth.map(row => ({ date: row.date, value: row.followers })),
  gained: growth.map((row, i) => ({ date: row.date, value: i % 4 })),
  lost: growth.map((row, i) => ({ date: row.date, value: i % 3 })),
};
http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (['http://127.0.0.1:4310', 'http://localhost:4310'].includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://127.0.0.1:4312'); const path = url.pathname;
  const endpoint = path.split('/').at(-1); let data;
  if (req.method !== 'GET' && !path.endsWith('/sync')) { res.writeHead(405); return res.end(); }
  if (path === '/api/auth/me') data = { id: 'fixture-owner', name: 'Validação local', email: 'fixture@example.invalid' };
  else if (path === '/api/accounts') data = [account];
  else if (path === '/api/accounts/threads') data = [{ id: 'threads-fixture', username: 'threads_ficticio' }];
  else if (path.endsWith('/sync')) data = { success: true };
  else if (path === '/api/notifications') data = { items: [], unreadCount: 0 };
  else if (path === '/api/settings/ai') data = { configured: true, apiKeyConfigured: true, model: 'gemini-2.5-flash', source: 'server' };
  else if (path === '/api/settings/threads') data = { configured: true };
  else if (path === '/api/settings/meta') data = { appIdConfigured: true, appSecretConfigured: true, clientTokenConfigured: false };
  else if (path === '/api/settings/preferences') data = { dataRefreshFrequency: '1h', weeklyReport: true, engagementAlerts: true, publishFailureAlerts: true };
  else if (path.startsWith('/api/competitors/')) data = [];
  else if (path.endsWith('/saved')) data = [];
  else if (path === '/api/community/comments') data = [];
  else if (path === '/api/accounts/pending') data = [];
  else if (path.includes('/networks/facebook/')) { const requestedDays = Number(url.searchParams.get('days') || 30), days = Math.min(requestedDays, 90); data = { ...facebook, insights: { ...facebook.insights, period: { days, limited: days !== requestedDays, since: '2026-08-29', until: '2026-09-28' } } }; }
  else if (path.includes('/networks/threads/')) data = threads;
  else if (path.startsWith('/api/analytics/')) {
    if (endpoint === 'dashboard') data = dashboard;
    else if (endpoint === 'profile-report') {
      const requestedDays = Number(url.searchParams.get('days') || 30), days = Math.min(30, requestedDays);
      data = { period: { days, requestedDays, limited: days !== requestedDays, since: new Date(Date.parse(now) - days * 86400000).toISOString(), until: now }, collectedAt: now, available: true,
        metrics: { views: days === 7 ? 2000 : 20994, reach: days === 7 ? 1000 : 7699, accountsEngaged: 191, interactions: 580, likes: 402, comments: 21, shares: 41, saves: 9, replies: null, reposts: 1, profileLinkTaps: 0 }, followers: { gained: 42, lost: 48, net: -6 }, dailyReach: growth.slice(-days).map(row => ({ date: row.date, value: row.reach })), frequency: 2.73, engagementRate: 2.48 };
    }
    else if (endpoint === 'access') data = { verified: true, instagramInsights: true, facebookInsights: true, facebookCounters: true };
    else if (endpoint === 'growth') data = growth;
    else if (endpoint === 'engagement') data = engagement;
    else if (endpoint === 'posts') { const page = Number(url.searchParams.get('page') || 1); data = { data: posts.slice((page - 1) * 20, page * 20), total: posts.length, page, totalPages: 2 }; }
    else if (endpoint === 'top-posts') data = { data: posts.filter(p => !url.searchParams.get('mediaType') || p.mediaType === url.searchParams.get('mediaType') || url.searchParams.get('mediaType') === 'FEED' && p.mediaType !== 'REEL').slice(0, 20) };
    else if (endpoint === 'content-types') data = [{ type: 'REEL', posts: 9, likes: 400, comments: 10, saves: 0, shares: 16, views: 5367, reach: 2556, engagement: 3.44, interactions: 426 }, { type: 'IMAGE', posts: 8, likes: null, comments: 0, saves: null, shares: 20, views: 2100, reach: 1500, engagement: null, interactions: 20 }];
    else if (endpoint === 'best-times') data = [{ day: 'Segunda', hour: 19, score: 78, averageInteractions: 78, posts: 5 }, { day: 'Sábado', hour: 12, score: 55, averageInteractions: 55, posts: 3 }];
    else if (endpoint === 'recommendations') data = [{ type: 'DATA', message: 'Cenário fictício para validar a interface.', basedOn: 25 }];
    else if (endpoint === 'audience') data = { available: true, data: ['gender', 'age', 'country', 'city'].map((name, index) => ({ name: `followers_${name}`, values: [{ value: [{ F: 1750, M: 1100, U: 600 }, { '25-34': 1200, '35-44': 900, '18-24': 500 }, { BR: 2500, PT: 300 }, { 'Curitiba, Paraná': 1500, 'São Paulo, São Paulo': 500 }][index] }] })) };
  } else if (path === '/api/posts') data = [{ id: 'scheduled-fixture', accountId: account.id, mediaType: 'REEL', caption: 'Agenda fictícia — validar detalhes', scheduledFor: `${date(28)}T18:00:00Z`, status: 'SCHEDULED', platforms: ['INSTAGRAM', 'FACEBOOK'] }];
  else if (path === '/api/automations') data = { automations: [], templates: [], agent: null, conversations: [], executions: [], status: { webhookConfigured: true } };
  if (data === undefined) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Cenário local não implementado' })); }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
}).listen(4312, '127.0.0.1', () => console.log('Synthetic report fixture: http://127.0.0.1:4312; no production data or writes.'));
