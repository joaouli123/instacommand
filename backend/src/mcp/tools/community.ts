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
    description: 'Lista os comentários mais recentes das publicações do Instagram da empresa, dos vídeos do canal do YouTube (network youtube), dos posts da Página do Facebook (network facebook) ou as respostas aos posts do Threads (network threads) vinculados a ela, do mais novo para o mais antigo, com texto, autor, a publicação ou vídeo de origem e se já foi respondido.',
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: { accountId: accountIdSchema, network: z.enum(['instagram', 'youtube', 'facebook', 'threads']).default('instagram').describe('youtube, facebook e threads usam o canal, a Página ou o perfil vinculados à empresa.') },
    handler: async ({ accountId, network }, { api }) => api.get('/community/comments', { accountId, network }),
  }),

  defineTool({
    name: 'reply_to_comment',
    title: 'Responder comentário',
    category: 'community',
    description: 'Publica uma resposta pública a um comentário do Instagram, do YouTube (mediaId é o id do vídeo), da Página do Facebook ou do Threads. Mostre o texto ao usuário e só envie após a confirmação dele.',
    scopes: ['publish'],
    annotations: EXTERNAL,
    inputSchema: {
      accountId: accountIdSchema,
      mediaId: mediaIdSchema,
      commentId: commentIdSchema,
      message: z.string().trim().min(1).max(1000).describe('Texto da resposta (até 1.000 caracteres).'),
      network: z.enum(['instagram', 'youtube', 'facebook', 'threads']).default('instagram'),
    },
    handler: async ({ accountId, mediaId, commentId, message, network }, { api }) => api.post(`/community/comments/${encodePathSegment(commentId)}/reply`, { accountId, mediaId, message, network }),
  }),

  defineTool({
    name: 'delete_comment',
    title: 'Excluir comentário',
    category: 'community',
    description: 'Exclui um comentário de uma publicação do Instagram ou, no YouTube, Facebook e Threads, oculta o comentário do público. Exige confirmação explícita.',
    scopes: ['publish'],
    annotations: DESTRUCTIVE,
    inputSchema: { accountId: accountIdSchema, mediaId: mediaIdSchema, commentId: commentIdSchema, network: z.enum(['instagram', 'youtube', 'facebook', 'threads']).default('instagram'), confirm: confirmSchema },
    handler: async ({ accountId, mediaId, commentId, network }, { api }) => api.delete(`/community/comments/${encodePathSegment(commentId)}`, { accountId, mediaId, network }),
  }),
];
