import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dailyPlanSchema } from '../../services/ai-output';
import { accountIdSchema, defineTool, WRITE } from '../tool-kit';

export const aiTools = [
  defineTool({
    name: 'generate_ai_content',
    title: 'Gerar conteúdo com a IA do workspace',
    category: 'ai',
    description: 'Usa a IA configurada no workspace (Gemini) com o contexto real da conta. Modos: caption (legenda + CTA + hashtags), plan (plano de 7 dias), daily (3 posts para um dia, salvável com save_daily_plan_as_drafts), audit (auditoria do perfil) e reply (resposta para um comentário). Você também pode escrever o conteúdo diretamente; esta ferramenta é útil para manter a voz e os dados do workspace.',
    scopes: ['write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: {
      mode: z.enum(['caption', 'plan', 'daily', 'audit', 'reply']),
      accountId: accountIdSchema.optional().describe('Conta usada como contexto (recomendado).'),
      topic: z.string().max(500).optional().describe('Tema ou briefing.'),
      audience: z.string().max(300).optional(),
      tone: z.string().max(100).optional(),
      objective: z.string().max(200).optional(),
      mediaType: z.string().max(50).optional().describe('Formato pretendido, ex.: IMAGE, CAROUSEL, REEL.'),
      platforms: z.array(z.string().max(30)).max(5).optional(),
      caption: z.string().max(2200).optional().describe('Legenda existente (para revisar ou responder).'),
      comment: z.string().max(1000).optional().describe('Comentário a responder (modo reply).'),
    },
    handler: async (args, { api }) => (await api.post('/ai/generate', args, { timeoutMs: 180_000 })).result,
  }),

  defineTool({
    name: 'save_daily_plan_as_drafts',
    title: 'Salvar plano diário como rascunhos',
    category: 'ai',
    description: 'Salva os 3 posts de um plano do modo "daily" de generate_ai_content como rascunhos (sem mídia) no calendário do dia, nos horários sugeridos (America/Sao_Paulo). Nada é publicado. Reenviar o mesmo requestId não duplica.',
    scopes: ['write'],
    annotations: WRITE,
    inputSchema: {
      accountId: accountIdSchema,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Dia do plano, formato AAAA-MM-DD.'),
      plan: dailyPlanSchema.describe('Objeto retornado por generate_ai_content no modo daily, sem alterações de estrutura.'),
      requestId: z.string().uuid().optional().describe('Chave de idempotência; gere uma e reutilize ao repetir a mesma operação.'),
    },
    handler: async ({ accountId, date, plan, requestId }, { api }) => {
      const id = requestId ?? randomUUID();
      const result = await api.post('/ai/daily-drafts', { requestId: id, accountId, date, plan });
      return {
        requestId: id,
        drafts: (result.posts || []).map((post: any) => ({ id: post.id, mediaType: post.mediaType, scheduledFor: post.scheduledFor, topic: post.editorialBrief?.topic ?? null })),
        next: 'Os rascunhos não têm mídia. Adicione as mídias com update_post antes de agendar.',
      };
    },
  }),
];
