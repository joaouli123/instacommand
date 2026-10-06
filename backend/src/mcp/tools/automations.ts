import { z } from 'zod';
import { encodePathSegment, type InternalApi } from '../internal-api';
import { NotFoundError } from '../../utils/errors';
import {
  automationAccountIdSchema, automationPlatformSchema, confirmSchema, defineTool, DESTRUCTIVE, EXTERNAL, preview, READ, READ_LIVE,
  threadsAccountIdSchema, WRITE, WRITE_IDEMPOTENT,
} from '../tool-kit';

const TRIGGERS = ['COMMENT_ANY', 'COMMENT_KEYWORD', 'MESSAGE_ANY', 'MESSAGE_KEYWORD'] as const;
const reply = (description: string) => z.string().trim().max(1000).nullable().optional().describe(description);

const ruleFields = {
  name: z.string().trim().min(2).max(100).describe('Nome interno da regra.'),
  trigger: z.enum(TRIGGERS).describe('COMMENT_ANY / COMMENT_KEYWORD (comentários) ou MESSAGE_ANY / MESSAGE_KEYWORD (mensagens diretas). Facebook aceita só MESSAGE_*; Threads só COMMENT_*.'),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).describe('Palavras-chave (obrigatórias nos gatilhos *_KEYWORD).'),
  replyMode: z.enum(['TEMPLATE', 'AI']).describe('TEMPLATE = resposta pronta; AI = o agente de IA responde (configure com configure_ai_agent).'),
  publicCommentReply: reply('Resposta pública ao comentário (gatilhos COMMENT_*). No Threads, até 500 caracteres.'),
  privateCommentReply: reply('Resposta privada (DM) a quem comentou (somente Instagram, gatilhos COMMENT_*).'),
  directMessageReply: reply('Resposta à mensagem direta (gatilhos MESSAGE_*).'),
  continueConversation: z.boolean().optional().describe('Somente replyMode AI em MESSAGE_*: o agente continua a conversa nas próximas mensagens.'),
  enabled: z.boolean().describe('true ativa a regra: ela passa a responder sozinha (exige permissão publish e permissões da Meta).'),
};

async function loadWorkspace(api: InternalApi, accountId: string, platform: string) {
  return api.get('/automations', { accountId, platform });
}

const ruleBody = (rule: any) => ({
  name: rule.name,
  trigger: rule.trigger,
  keywords: rule.keywords ?? [],
  replyMode: rule.replyMode,
  publicCommentReply: rule.publicCommentReply ?? null,
  privateCommentReply: rule.privateCommentReply ?? null,
  directMessageReply: rule.directMessageReply ?? null,
  continueConversation: Boolean(rule.continueConversation),
  enabled: Boolean(rule.enabled),
});

const compactExecution = (execution: any) => ({
  id: execution.id,
  status: execution.status,
  eventType: execution.eventType,
  sender: execution.senderUsername || execution.senderId || null,
  eventText: preview(execution.eventText, 300),
  responseText: preview(execution.responseText, 300),
  automationId: execution.automationId ?? null,
  conversationId: execution.conversationId ?? null,
  error: execution.error ?? null,
  createdAt: execution.createdAt,
});

export const automationTools = [
  defineTool({
    name: 'get_automations',
    title: 'Ver automações',
    category: 'automations',
    description: 'Mostra as regras de automação, modelos de resposta, o agente de IA, o status das permissões/webhooks e as execuções e conversas recentes de uma conta. Execuções com status NEEDS_REVIEW aguardam revisão humana (send_reviewed_reply).',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {
      accountId: automationAccountIdSchema,
      platform: automationPlatformSchema,
      limit: z.number().int().min(1).max(100).default(20).describe('Quantidade de execuções e conversas recentes.'),
    },
    handler: async ({ accountId, platform, limit }, { api }) => {
      const workspace = await loadWorkspace(api, accountId, platform);
      return {
        rules: workspace.automations,
        templates: workspace.templates,
        agent: workspace.agent,
        status: workspace.status,
        needsReview: (workspace.executions || []).filter((execution: any) => execution.status === 'NEEDS_REVIEW').slice(0, limit).map(compactExecution),
        recentExecutions: (workspace.executions || []).slice(0, limit).map(compactExecution),
        conversations: (workspace.conversations || []).slice(0, limit).map((conversation: any) => ({
          id: conversation.id,
          contact: conversation.senderUsername || conversation.senderId,
          kind: conversation.kind,
          state: conversation.state,
          stateReason: conversation.stateReason,
          lastInboundAt: conversation.lastInboundAt,
          last: conversation.executions?.[0] ? { eventText: preview(conversation.executions[0].eventText, 200), responseText: preview(conversation.executions[0].responseText, 200), status: conversation.executions[0].status } : null,
        })),
      };
    },
  }),

  defineTool({
    name: 'get_automation_status',
    title: 'Status das automações',
    category: 'automations',
    description: 'Verifica na Meta as permissões concedidas, se comentários e mensagens podem ser automatizados, a URL de webhook e a última atividade.',
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: { accountId: automationAccountIdSchema, platform: automationPlatformSchema },
    handler: async ({ accountId, platform }, { api }) => api.get('/automations/status', { accountId, platform }),
  }),

  defineTool({
    name: 'create_automation_rule',
    title: 'Criar regra de automação',
    category: 'automations',
    description: 'Cria uma regra que responde comentários ou mensagens (ex.: quem comentar "EU QUERO" recebe o link por DM). A regra é criada desativada; com enabled=true ela é ativada em seguida, o que exige permissão publish e as permissões da Meta. Confirme o texto das respostas com o usuário.',
    scopes: ['write'],
    scopesFor: (args) => (args.enabled ? ['write', 'publish'] : ['write']),
    annotations: WRITE,
    inputSchema: { accountId: automationAccountIdSchema, platform: automationPlatformSchema, ...ruleFields, keywords: ruleFields.keywords.default([]), enabled: ruleFields.enabled.default(false) },
    handler: async ({ accountId, platform, enabled, ...rule }, { api }) => {
      const created = await api.post('/automations', { accountId, platform, ...ruleBody({ ...rule, enabled: false }) });
      if (!enabled) return { rule: created, note: 'Regra criada desativada. Ative com update_automation_rule (enabled=true) quando o usuário confirmar.' };
      const activated = await api.put(`/automations/${encodePathSegment(created.id)}`, { accountId, platform, ...ruleBody({ ...created, enabled: true }) });
      return { rule: activated };
    },
  }),

  defineTool({
    name: 'update_automation_rule',
    title: 'Editar ou ativar regra',
    category: 'automations',
    description: 'Altera campos de uma regra existente (envie só o que muda), incluindo ativar (enabled=true, exige permissão publish) ou desativar.',
    scopes: ['write'],
    scopesFor: (args) => (args.enabled ? ['publish'] : ['write']),
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      accountId: automationAccountIdSchema,
      platform: automationPlatformSchema,
      ruleId: z.string().uuid(),
      name: ruleFields.name.optional(),
      trigger: ruleFields.trigger.optional(),
      keywords: ruleFields.keywords.optional(),
      replyMode: ruleFields.replyMode.optional(),
      publicCommentReply: ruleFields.publicCommentReply,
      privateCommentReply: ruleFields.privateCommentReply,
      directMessageReply: ruleFields.directMessageReply,
      continueConversation: ruleFields.continueConversation,
      enabled: ruleFields.enabled.optional(),
    },
    handler: async ({ accountId, platform, ruleId, ...changes }, { api }) => {
      const workspace = await loadWorkspace(api, accountId, platform);
      const current = (workspace.automations || []).find((rule: any) => rule.id === ruleId);
      if (!current) throw new NotFoundError('Regra de automação não encontrada nesta conta e rede.');
      const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      return { rule: await api.put(`/automations/${encodePathSegment(ruleId)}`, { accountId, platform, ...ruleBody({ ...current, ...defined }) }) };
    },
  }),

  defineTool({
    name: 'delete_automation_rule',
    title: 'Excluir regra',
    category: 'automations',
    description: 'Exclui uma regra de automação. Exige confirmação explícita.',
    scopes: ['write'],
    annotations: { ...DESTRUCTIVE, openWorldHint: false },
    inputSchema: { accountId: automationAccountIdSchema, platform: automationPlatformSchema, ruleId: z.string().uuid(), confirm: confirmSchema },
    handler: async ({ accountId, platform, ruleId }, { api }) => {
      await api.delete(`/automations/${encodePathSegment(ruleId)}`, { accountId, platform });
      return { deleted: true, ruleId };
    },
  }),

  defineTool({
    name: 'create_automation_template',
    title: 'Criar modelo de resposta',
    category: 'automations',
    description: 'Salva um modelo de resposta reutilizável. Tipos: PUBLIC_COMMENT, PRIVATE_COMMENT (DM a quem comentou) e DIRECT_MESSAGE. Threads aceita só PUBLIC_COMMENT (até 500 caracteres); Facebook só DIRECT_MESSAGE.',
    scopes: ['write'],
    annotations: WRITE,
    inputSchema: {
      accountId: automationAccountIdSchema,
      platform: automationPlatformSchema,
      name: z.string().trim().min(2).max(100),
      type: z.enum(['PUBLIC_COMMENT', 'PRIVATE_COMMENT', 'DIRECT_MESSAGE']),
      content: z.string().trim().min(1).max(1000),
    },
    handler: async (args, { api }) => api.post('/automations/templates', args),
  }),

  defineTool({
    name: 'delete_automation_template',
    title: 'Excluir modelo de resposta',
    category: 'automations',
    description: 'Exclui um modelo de resposta salvo.',
    scopes: ['write'],
    annotations: { ...DESTRUCTIVE, openWorldHint: false },
    inputSchema: { accountId: automationAccountIdSchema, platform: automationPlatformSchema, templateId: z.string().uuid() },
    handler: async ({ accountId, platform, templateId }, { api }) => {
      await api.delete(`/automations/templates/${encodePathSegment(templateId)}`, { accountId, platform });
      return { deleted: true, templateId };
    },
  }),

  defineTool({
    name: 'configure_ai_agent',
    title: 'Configurar agente de IA',
    category: 'automations',
    description: 'Configura o agente de IA que responde comentários/mensagens nas regras com replyMode AI: tom, instruções, base de conhecimento, mensagem de transferência para humano, memória e limite por hora. Envie só o que muda. autoSend=true faz o agente enviar sem revisão (exige permissão publish); com autoSend=false as respostas ficam em revisão.',
    scopes: ['write'],
    scopesFor: (args) => (args.enabled && args.autoSend ? ['publish'] : ['write']),
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      accountId: automationAccountIdSchema,
      platform: automationPlatformSchema,
      enabled: z.boolean().optional(),
      autoSend: z.boolean().optional().describe('Envio automático sem revisão humana. Exige enabled=true.'),
      tone: z.string().trim().min(2).max(200).optional(),
      instructions: z.string().trim().max(2000).optional(),
      knowledgeBase: z.string().trim().max(8000).optional().describe('Fatos do negócio que o agente pode usar (horários, preços, links). Ele não deve inventar além disso.'),
      fallback: z.string().trim().min(1).max(1000).optional().describe('Mensagem usada ao transferir para um humano.'),
      memoryDays: z.number().int().min(0).max(30).optional(),
      maxRepliesPerHour: z.number().int().min(1).max(30).optional(),
    },
    handler: async ({ accountId, platform, ...changes }, { api }) => {
      const workspace = await loadWorkspace(api, accountId, platform);
      const current = workspace.agent || {};
      const merged = {
        enabled: false, autoSend: false, tone: 'Humano, cordial e direto', instructions: '', knowledgeBase: '',
        fallback: 'Vou chamar alguém da equipe para continuar com você.', memoryDays: 7, maxRepliesPerHour: 10,
        ...Object.fromEntries(['enabled', 'autoSend', 'tone', 'instructions', 'knowledgeBase', 'fallback', 'memoryDays', 'maxRepliesPerHour']
          .filter((key) => current[key] !== undefined && current[key] !== null).map((key) => [key, current[key]])),
        ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
      };
      return { agent: await api.put('/automations/agent', { accountId, platform, ...merged }) };
    },
  }),

  defineTool({
    name: 'subscribe_automation_webhooks',
    title: 'Ativar recebimento de eventos',
    category: 'automations',
    description: 'Inscreve a conta (Página/Instagram) para receber eventos de comentários e mensagens da Meta, necessário para as automações funcionarem. Instagram e Facebook apenas.',
    scopes: ['admin'],
    annotations: { ...EXTERNAL, idempotentHint: true },
    inputSchema: { accountId: automationAccountIdSchema, platform: automationPlatformSchema },
    handler: async ({ accountId, platform }, { api }) => api.post('/automations/subscribe', { accountId, platform }),
  }),

  defineTool({
    name: 'send_reviewed_reply',
    title: 'Enviar resposta revisada',
    category: 'automations',
    description: 'Envia a resposta de uma execução que aguarda revisão (status NEEDS_REVIEW em get_automations), com o texto aprovado pelo usuário.',
    scopes: ['publish'],
    annotations: EXTERNAL,
    inputSchema: {
      accountId: automationAccountIdSchema,
      platform: automationPlatformSchema,
      executionId: z.string().uuid(),
      message: z.string().trim().min(1).max(1000).describe('Texto final aprovado pelo usuário.'),
    },
    handler: async ({ accountId, platform, executionId, message }, { api }) => api.post(`/automations/executions/${encodePathSegment(executionId)}/send`, { accountId, platform, message }),
  }),

  defineTool({
    name: 'get_conversation',
    title: 'Ver conversa',
    category: 'automations',
    description: 'Histórico de uma conversa automatizada (mensagens recebidas, respostas e estados).',
    scopes: ['read'],
    annotations: READ,
    inputSchema: { accountId: automationAccountIdSchema, platform: automationPlatformSchema, conversationId: z.string().uuid() },
    handler: async ({ accountId, platform, conversationId }, { api }) => api.get(`/automations/conversations/${encodePathSegment(conversationId)}`, { accountId, platform }),
  }),

  defineTool({
    name: 'set_conversation_state',
    title: 'Pausar ou retomar conversa',
    category: 'automations',
    description: 'HUMAN pausa o bot para um atendente assumir; STOPPED encerra as respostas automáticas; BOT retoma. Se a pessoa pediu para parar, só retome com consentimento novo (consentConfirmed=true).',
    scopes: ['write'],
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      accountId: automationAccountIdSchema,
      platform: automationPlatformSchema,
      conversationId: z.string().uuid(),
      state: z.enum(['BOT', 'HUMAN', 'STOPPED']),
      consentConfirmed: z.boolean().default(false).describe('true somente se a pessoa autorizou novamente as respostas automáticas.'),
    },
    handler: async ({ accountId, platform, conversationId, state, consentConfirmed }, { api }) => api.put(`/automations/conversations/${encodePathSegment(conversationId)}/state`, { accountId, platform, state, consentConfirmed }),
  }),

  defineTool({
    name: 'forget_conversation',
    title: 'Limpar memória da conversa',
    category: 'automations',
    description: 'Faz o agente de IA esquecer o histórico desta conversa a partir de agora (o registro continua visível).',
    scopes: ['write'],
    annotations: WRITE_IDEMPOTENT,
    inputSchema: { accountId: automationAccountIdSchema, platform: automationPlatformSchema, conversationId: z.string().uuid() },
    handler: async ({ accountId, platform, conversationId }, { api }) => api.post(`/automations/conversations/${encodePathSegment(conversationId)}/forget`, { accountId, platform }),
  }),

  defineTool({
    name: 'sync_threads_automation',
    title: 'Sincronizar respostas do Threads',
    category: 'automations',
    description: 'Busca agora as novas respostas do Threads e processa as regras (no Threads a coleta é periódica, sem webhook).',
    scopes: ['write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: { threadsAccountId: threadsAccountIdSchema },
    handler: async ({ threadsAccountId }, { api }) => api.post('/automations/threads/sync', { accountId: threadsAccountId, platform: 'THREADS' }),
  }),
];
