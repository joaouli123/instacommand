import { z } from 'zod';
import { encodePathSegment } from '../internal-api';
import { defineTool, READ, WRITE, WRITE_IDEMPOTENT } from '../tool-kit';

export const settingsTools = [
  defineTool({
    name: 'list_notifications',
    title: 'Notificações',
    category: 'settings',
    description: 'As 30 notificações mais recentes do workspace (falhas de publicação, alertas de engajamento, relatórios) e o total não lido.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {},
    handler: async (_args, { api }) => api.get('/notifications'),
  }),

  defineTool({
    name: 'mark_notifications_read',
    title: 'Marcar notificações como lidas',
    category: 'settings',
    description: 'Marca notificações específicas como lidas, ou todas com all=true.',
    scopes: ['write'],
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      notificationIds: z.array(z.string().uuid()).max(30).optional(),
      all: z.boolean().default(false),
    },
    handler: async ({ notificationIds, all }, { api }) => {
      if (all) {
        await api.post('/notifications/read-all');
        return { markedAll: true };
      }
      for (const id of notificationIds || []) await api.post(`/notifications/${encodePathSegment(id)}/read`);
      return { marked: notificationIds?.length || 0 };
    },
  }),

  defineTool({
    name: 'get_settings',
    title: 'Configurações do workspace',
    category: 'settings',
    description: 'Preferências de coleta e notificações, status da conexão com a Meta, com o Threads e da IA (chaves nunca são exibidas).',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {},
    handler: async (_args, { api }) => {
      const [preferences, meta, threads, ai] = await Promise.all([
        api.get('/settings/preferences'), api.get('/settings/meta'), api.get('/settings/threads'), api.get('/settings/ai'),
      ]);
      return { preferences, meta, threads, ai };
    },
  }),

  defineTool({
    name: 'update_preferences',
    title: 'Alterar preferências',
    category: 'settings',
    description: 'Altera a frequência de coleta de métricas e as notificações (envie só o que muda).',
    scopes: ['write'],
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      dataRefreshFrequency: z.enum(['15m', '1h', '24h']).optional(),
      weeklyReport: z.boolean().optional(),
      engagementAlerts: z.boolean().optional(),
      publishFailureAlerts: z.boolean().optional(),
    },
    handler: async (changes, { api }) => {
      const current = await api.get('/settings/preferences');
      return api.put('/settings/preferences', {
        dataRefreshFrequency: changes.dataRefreshFrequency ?? current.dataRefreshFrequency,
        weeklyReport: changes.weeklyReport ?? current.weeklyReport,
        engagementAlerts: changes.engagementAlerts ?? current.engagementAlerts,
        publishFailureAlerts: changes.publishFailureAlerts ?? current.publishFailureAlerts,
      });
    },
  }),

  defineTool({
    name: 'configure_ai_provider',
    title: 'Configurar IA do workspace',
    category: 'settings',
    description: 'Define a chave da API do Gemini e/ou o modelo usados pela IA do workspace. A chave é guardada criptografada e nunca é devolvida. Só envie uma chave que o usuário forneceu para isso.',
    scopes: ['admin'],
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      apiKey: z.string().trim().min(10).max(500).optional(),
      model: z.string().trim().min(1).max(120).optional().describe('Ex.: gemini-2.5-flash'),
    },
    handler: async (args, { api }) => api.put('/settings/ai', args),
  }),

  defineTool({
    name: 'configure_app_credentials',
    title: 'Credenciais de aplicativo Meta/Threads',
    category: 'settings',
    description: 'Configura App ID e App Secret próprios da Meta ou do Threads para este workspace (uso avançado; normalmente o servidor já fornece). Segredos ficam criptografados e nunca são devolvidos.',
    scopes: ['admin'],
    annotations: WRITE,
    inputSchema: {
      network: z.enum(['meta', 'threads']),
      appId: z.string().trim().min(1).max(100),
      appSecret: z.string().trim().max(200).optional(),
      clientToken: z.string().trim().max(200).optional().describe('Somente Meta.'),
    },
    handler: async ({ network, appId, appSecret, clientToken }, { api }) => api.put(`/settings/${network}`, network === 'meta' ? { appId, appSecret, clientToken } : { appId, appSecret }),
  }),
];
