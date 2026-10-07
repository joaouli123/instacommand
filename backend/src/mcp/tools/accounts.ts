import { z } from 'zod';
import { encodePathSegment } from '../internal-api';
import { accountIdSchema, compactAccount, compactThreadsAccount, confirmSchema, defineTool, DESTRUCTIVE, READ, READ_LIVE, WRITE } from '../tool-kit';

export const accountTools = [
  defineTool({
    name: 'list_accounts',
    title: 'Listar contas conectadas',
    category: 'accounts',
    description: 'Lista as contas do Instagram (cada uma com a Página do Facebook vinculada) e as contas do Threads e do X conectadas, com os IDs usados nas demais ferramentas.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {},
    handler: async (_args, { api }) => {
      const [instagram, threads, x] = await Promise.all([api.get<any[]>('/accounts'), api.get<any[]>('/accounts/threads'), api.get<{ accounts: any[] }>('/accounts/x').catch(() => ({ accounts: [] }))]);
      return {
        instagram: instagram.map(compactAccount),
        threads: threads.map(compactThreadsAccount),
        x: (x.accounts || []).map((account: any) => ({ id: account.id, username: account.username, name: account.name, followers: account.followersCount ?? null })),
        note: 'Para publicar no Facebook use o accountId da conta do Instagram: o post vai para a Página em facebookPage.',
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
    description: 'Gera o link oficial de autorização para conectar contas. network "meta" conecta Instagram profissional + Página do Facebook; "threads" conecta o Threads; "x" conecta o X (Twitter). Entregue o link ao usuário para abrir no navegador (válido por 10 minutos). As contas escolhidas na tela da Meta ficam ativas na hora e a primeira sincronização começa sozinha; depois, chame list_accounts para confirmar.',
    scopes: ['admin'],
    annotations: READ_LIVE,
    inputSchema: {
      network: z.enum(['meta', 'threads', 'x']).describe('meta = Instagram + Facebook; threads = Threads; x = X (Twitter).'),
      enableThreadsReplies: z.boolean().default(false).describe('Somente Threads: pede também a permissão de gerenciar respostas, necessária para automações.'),
    },
    handler: async ({ network, enableThreadsReplies }, { api }) => {
      const result = network === 'meta'
        ? await api.get('/auth/facebook/url')
        : network === 'x'
          ? await api.get('/auth/x/url')
          : await api.get('/auth/threads/url', enableThreadsReplies ? { automations: 1 } : undefined);
      return {
        authorizationUrl: result.url,
        expiresInMinutes: 10,
        nextSteps: network === 'meta'
          ? ['Peça ao usuário para abrir o link, entrar na Meta e escolher as Páginas e contas profissionais.', 'Ao terminar, chame list_accounts: as contas autorizadas já aparecem ativas. Publicações e métricas são importadas automaticamente em seguida (alguns segundos a poucos minutos).']
          : ['Peça ao usuário para abrir o link e autorizar o Threads.', 'Ao terminar, chame list_accounts para ver a conta do Threads conectada.'],
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
    name: 'disconnect_account',
    title: 'Desconectar conta',
    category: 'accounts',
    description: 'Desconecta uma conta do Instagram (e sua Página do Facebook), do Threads ou do X deste workspace. Agendamentos dela deixam de ser publicados. Exige confirmação explícita.',
    scopes: ['admin'],
    annotations: DESTRUCTIVE,
    inputSchema: {
      network: z.enum(['instagram', 'threads', 'x']),
      accountId: z.string().uuid().describe('id da conta do Instagram, do Threads ou do X.'),
      confirm: confirmSchema,
    },
    handler: async ({ network, accountId }, { api }) => api.delete(network === 'threads'
      ? `/accounts/threads/${encodePathSegment(accountId)}`
      : network === 'x'
        ? `/accounts/x/${encodePathSegment(accountId)}`
        : `/accounts/${encodePathSegment(accountId)}`),
  }),
];
