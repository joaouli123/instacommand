import { z } from 'zod';
import { encodePathSegment } from '../internal-api';
import { accountIdSchema, compactAccount, compactThreadsAccount, confirmSchema, defineTool, DESTRUCTIVE, READ, READ_LIVE, WRITE } from '../tool-kit';

export const accountTools = [
  defineTool({
    name: 'list_accounts',
    title: 'Listar contas conectadas',
    category: 'accounts',
    description: 'Lista as contas do Instagram (cada uma com a Página do Facebook vinculada) e as contas do Threads, do X e os canais do YouTube conectados, com os IDs usados nas demais ferramentas.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {},
    handler: async (_args, { api }) => {
      const [instagram, threads, x, youtube] = await Promise.all([
        api.get<any[]>('/accounts'), api.get<any[]>('/accounts/threads'),
        api.get<{ accounts: any[] }>('/accounts/x').catch(() => ({ accounts: [] })),
        api.get<{ accounts: any[] }>('/accounts/youtube').catch(() => ({ accounts: [] })),
      ]);
      return {
        instagram: instagram.map(compactAccount),
        threads: threads.map((account: any) => ({ ...compactThreadsAccount(account), companyAccountId: account.workspaceAccountId ?? null })),
        x: (x.accounts || []).map((account: any) => ({ id: account.id, username: account.username, name: account.name, followers: account.followersCount ?? null, companyAccountId: account.workspaceAccountId ?? null })),
        youtube: (youtube.accounts || []).map((account: any) => ({ id: account.id, title: account.title, handle: account.handle ?? null, subscribers: account.subscriberCount ?? null, companyAccountId: account.workspaceAccountId ?? null })),
        note: 'Cada empresa é uma conta do Instagram (id em instagram). Threads, X e YouTube têm companyAccountId: use num post somente as contas cujo companyAccountId é igual ao accountId do post; contas com companyAccountId null precisam ser vinculadas a uma empresa em Contas antes de publicar. Para publicar no Facebook use o accountId da conta do Instagram: o post vai para a Página em facebookPage.',
      };
    },
  }),

  defineTool({
    name: 'get_account',
    title: 'Detalhes da conta',
    category: 'accounts',
    description: 'Detalhes de uma conta do Instagram conectada: seguidores, bio, Página do Facebook e última sincronização.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: { accountId: accountIdSchema },
    handler: async ({ accountId }, { api }) => compactAccount(await api.get(`/accounts/${encodePathSegment(accountId)}`)),
  }),

  defineTool({
    name: 'sync_account',
    title: 'Sincronizar conta',
    category: 'accounts',
    description: 'Atualiza agora o perfil, as publicações e as métricas da conta do Instagram a partir da Meta. Se uma sincronização já estiver em andamento (por exemplo, logo após conectar), aguarda o mesmo resultado em vez de repetir.',
    scopes: ['write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: { accountId: accountIdSchema },
    handler: async ({ accountId }, { api }) => api.post(`/accounts/${encodePathSegment(accountId)}/sync`),
  }),

  defineTool({
    name: 'start_account_connection',
    title: 'Conectar nova conta',
    category: 'accounts',
    description: 'Gera o link oficial de autorização para conectar contas. network "meta" conecta Instagram profissional + Página do Facebook (cada conta do Instagram é uma empresa); "threads", "x" e "youtube" conectam o perfil e o vinculam à empresa informada em companyAccountId. Entregue o link ao usuário para abrir no navegador (válido por 10 minutos); depois, chame list_accounts para confirmar.',
    scopes: ['admin'],
    annotations: READ_LIVE,
    inputSchema: {
      network: z.enum(['meta', 'threads', 'x', 'youtube']).describe('meta = Instagram + Facebook; threads = Threads; x = X (Twitter); youtube = canal do YouTube.'),
      companyAccountId: accountIdSchema.optional().describe('Threads, X e YouTube: empresa (id da conta do Instagram) dona do perfil. Pergunte ao usuário se não estiver claro; sem ela, o perfil precisa ser vinculado depois em Contas.'),
      enableThreadsReplies: z.boolean().default(false).describe('Somente Threads: pede também a permissão de gerenciar respostas, necessária para automações.'),
    },
    handler: async ({ network, companyAccountId, enableThreadsReplies }, { api }) => {
      const workspace = companyAccountId ? { workspace: companyAccountId } : {};
      const result = network === 'meta'
        ? await api.get('/auth/facebook/url')
        : network === 'threads'
          ? await api.get('/auth/threads/url', { ...workspace, ...(enableThreadsReplies ? { automations: 1 } : {}) })
          : await api.get(`/auth/${network}/url`, workspace);
      const label = network === 'threads' ? 'o Threads' : network === 'x' ? 'o X' : 'o YouTube';
      return {
        authorizationUrl: result.url,
        expiresInMinutes: 10,
        nextSteps: network === 'meta'
          ? ['Peça ao usuário para abrir o link, entrar na Meta e escolher as Páginas e contas profissionais.', 'Ao terminar, chame list_accounts: as contas autorizadas já aparecem ativas. Publicações e métricas são importadas automaticamente em seguida (alguns segundos a poucos minutos).']
          : [`Peça ao usuário para abrir o link e autorizar ${label}.`, 'Ao terminar, chame list_accounts e confira o companyAccountId do perfil conectado.'],
      };
    },
  }),

  defineTool({
    name: 'list_pending_accounts',
    title: 'Contas aguardando seleção',
    category: 'accounts',
    description: 'Lista contas de conexões antigas que ainda aguardam a escolha de quais ficam ativas. Conexões novas já ativam as contas automaticamente, então normalmente a lista vem vazia.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {},
    handler: async (_args, { api }) => ({ pending: (await api.get<any[]>('/accounts/pending')).map(compactAccount) }),
  }),

  defineTool({
    name: 'select_accounts',
    title: 'Ativar contas pendentes',
    category: 'accounts',
    description: 'Ativa as contas pendentes escolhidas. ATENÇÃO: as contas pendentes que não estiverem na lista são descartadas desta conexão. Confirme a lista com o usuário.',
    scopes: ['admin'],
    annotations: { ...WRITE, destructiveHint: true },
    inputSchema: { accountIds: z.array(z.string().uuid()).min(1).max(100).describe('IDs (de list_pending_accounts) que devem ficar ativos.') },
    handler: async ({ accountIds }, { api }) => {
      const result = await api.post('/accounts/select', { accountIds });
      return { message: result.message, activeAccounts: (result.accounts || []).map(compactAccount) };
    },
  }),

  defineTool({
    name: 'link_account_to_company',
    title: 'Vincular perfil a uma empresa',
    category: 'accounts',
    description: 'Define a empresa (conta do Instagram) dona de um perfil do Threads, do X ou de um canal do YouTube. Relatórios, painel e publicações de uma empresa usam só os perfis vinculados a ela. companyAccountId null desvincula. Confirme a empresa com o usuário antes.',
    scopes: ['admin'],
    annotations: WRITE,
    inputSchema: {
      network: z.enum(['threads', 'x', 'youtube']),
      accountId: z.string().uuid().describe('id do perfil do Threads, do X ou do canal do YouTube (list_accounts).'),
      companyAccountId: accountIdSchema.nullable().describe('id da conta do Instagram da empresa, ou null para desvincular.'),
    },
    handler: async ({ network, accountId, companyAccountId }, { api }) => api.patch(`/accounts/${network}/${encodePathSegment(accountId)}/workspace`, { workspaceAccountId: companyAccountId }),
  }),

  defineTool({
    name: 'list_youtube_playlists',
    title: 'Playlists do canal do YouTube',
    category: 'accounts',
    description: 'Lista as playlists do canal do YouTube (id, nome, visibilidade e quantidade de vídeos), para usar em youtubeSettings.playlistIds.',
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: { youtubeAccountId: z.string().uuid().describe('id do canal do YouTube (list_accounts).') },
    handler: async ({ youtubeAccountId }, { api }) => api.get(`/accounts/youtube/${encodePathSegment(youtubeAccountId)}/playlists`),
  }),

  defineTool({
    name: 'disconnect_account',
    title: 'Desconectar conta',
    category: 'accounts',
    description: 'Desconecta uma conta do Instagram (e sua Página do Facebook), do Threads, do X ou um canal do YouTube deste workspace. Agendamentos dela deixam de ser publicados. Exige confirmação explícita.',
    scopes: ['admin'],
    annotations: DESTRUCTIVE,
    inputSchema: {
      network: z.enum(['instagram', 'threads', 'x', 'youtube']),
      accountId: z.string().uuid().describe('id da conta do Instagram, do Threads, do X ou do canal do YouTube.'),
      confirm: confirmSchema,
    },
    handler: async ({ network, accountId }, { api }) => api.delete(network === 'threads'
      ? `/accounts/threads/${encodePathSegment(accountId)}`
      : network === 'x' || network === 'youtube'
        ? `/accounts/${network}/${encodePathSegment(accountId)}`
        : `/accounts/${encodePathSegment(accountId)}`),
  }),
];
