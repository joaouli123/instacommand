import { z } from 'zod';
import { encodePathSegment } from '../internal-api';
import { accountIdSchema, confirmSchema, defineTool, DESTRUCTIVE, EXTERNAL, READ_LIVE } from '../tool-kit';

const mediaIdSchema = z.string().regex(/^\d{1,200}$/).describe('ID da mídia do Instagram (campo mediaId do comentário em list_comments).');
const commentIdSchema = z.string().regex(/^\d{1,200}$/).describe('ID do comentário (campo id em list_comments).');

export const communityTools = [
  defineTool({
    name: 'list_comments',
    title: 'Listar comentários',
    category: 'community',
    description: 'Lista os comentários mais recentes das publicações do Instagram da conta (até 50), do mais novo para o mais antigo, com o texto, autor e a publicação de origem.',
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: { accountId: accountIdSchema },
    handler: async ({ accountId }, { api }) => api.get('/community/comments', { accountId }),
  }),

  defineTool({
    name: 'reply_to_comment',
    title: 'Responder comentário',
    category: 'community',
    description: 'Publica uma resposta pública a um comentário do Instagram. Mostre o texto ao usuário e só envie após a confirmação dele.',
    scopes: ['publish'],
    annotations: EXTERNAL,
    inputSchema: {
      accountId: accountIdSchema,
      mediaId: mediaIdSchema,
      commentId: commentIdSchema,
      message: z.string().trim().min(1).max(1000).describe('Texto da resposta (até 1.000 caracteres).'),
    },
    handler: async ({ accountId, mediaId, commentId, message }, { api }) => api.post(`/community/comments/${encodePathSegment(commentId)}/reply`, { accountId, mediaId, message }),
  }),

  defineTool({
    name: 'delete_comment',
    title: 'Excluir comentário',
    category: 'community',
    description: 'Exclui um comentário de uma publicação do Instagram da conta. IRREVERSÍVEL: exige confirmação explícita.',
    scopes: ['publish'],
    annotations: DESTRUCTIVE,
    inputSchema: { accountId: accountIdSchema, mediaId: mediaIdSchema, commentId: commentIdSchema, confirm: confirmSchema },
    handler: async ({ accountId, mediaId, commentId }, { api }) => api.delete(`/community/comments/${encodePathSegment(commentId)}`, { accountId, mediaId }),
  }),
];
