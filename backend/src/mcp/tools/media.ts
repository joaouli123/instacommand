import { z } from 'zod';
import { detectMediaSignature, SUPPORTED_MEDIA_DESCRIPTION } from '../../utils/media-signature';
import { ValidationError } from '../../utils/errors';
import { accountIdSchema, defineTool, READ_LIVE, WRITE } from '../tool-kit';

// Base64 travels inside the JSON-RPC request; the MCP route accepts 25 MB bodies.
const MAX_BASE64_FILE_BYTES = 15 * 1024 * 1024;
const MAX_BASE64_TOTAL_BYTES = 18 * 1024 * 1024;

export function decodeBase64Media(data: string, index: number) {
  const payload = data.trim().replace(/^data:[^;,]+;base64,/i, '').replace(/\s+/g, '');
  if (!payload || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(payload)) throw new ValidationError(`O arquivo ${index + 1} não está em base64 válido.`);
  const buffer = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!buffer.length) throw new ValidationError(`O arquivo ${index + 1} está vazio.`);
  if (buffer.length > MAX_BASE64_FILE_BYTES) throw new ValidationError(`O arquivo ${index + 1} passa de 15 MB. Para arquivos maiores, use import_media_from_url ou o CLI.`);
  const detected = detectMediaSignature(buffer.subarray(0, 16));
  if (!detected) throw new ValidationError(`O arquivo ${index + 1} não é uma imagem ou vídeo suportado (${SUPPORTED_MEDIA_DESCRIPTION}).`);
  return { data: buffer, filename: `upload-${index + 1}${detected.extension}`, mimeType: detected.mimeType };
}

export const mediaTools = [
  defineTool({
    name: 'import_media_from_url',
    title: 'Importar mídia por URL',
    category: 'media',
    description: `Baixa imagens ou vídeos de URLs públicas e diretas (ex.: imagem gerada por IA, arquivo em um CDN) para o armazenamento público do InstaCommand e devolve as URLs a usar em mediaUrls. Aceita ${SUPPORTED_MEDIA_DESCRIPTION}, até 100 MB cada. Links de páginas (Google Drive, Dropbox com visualizador) não funcionam: use o link direto do arquivo. A ordem das URLs retornadas segue a ordem enviada.`,
    scopes: ['write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: { urls: z.array(z.string().url().max(2048)).min(1).max(10).describe('URLs http(s) diretas das mídias, na ordem desejada no post.') },
    handler: async ({ urls }, { api }) => {
      const result = await api.post('/posts/import-url', { urls }, { timeoutMs: 15 * 60_000 });
      return {
        urls: result.urls,
        items: (result.items || []).map((item: any) => ({ sourceUrl: item.sourceUrl, url: item.url, kind: item.kind, mimeType: item.mimeType, bytes: item.bytes })),
        errors: result.errors || [],
        note: result.errors?.length ? 'Algumas URLs falharam; não use as que estão em errors.' : undefined,
      };
    },
  }),

  defineTool({
    name: 'upload_media_base64',
    title: 'Enviar mídia em base64',
    category: 'media',
    description: `Envia arquivos pequenos codificados em base64 (até 15 MB cada, 18 MB no total) e devolve as URLs públicas para mediaUrls. Use quando o arquivo existe apenas na conversa. Para arquivos grandes ou que já estão na web, prefira import_media_from_url. Formatos: ${SUPPORTED_MEDIA_DESCRIPTION}.`,
    scopes: ['write'],
    annotations: WRITE,
    inputSchema: {
      files: z.array(z.object({
        data: z.string().min(8).describe('Conteúdo em base64 (pode vir como data URL "data:image/jpeg;base64,...").'),
        filename: z.string().max(200).optional().describe('Nome original, apenas informativo.'),
      })).min(1).max(10).describe('Arquivos na ordem desejada no post.'),
    },
    handler: async ({ files }, { api }) => {
      const decoded = files.map((file, index) => decodeBase64Media(file.data, index));
      const total = decoded.reduce((sum, file) => sum + file.data.length, 0);
      if (total > MAX_BASE64_TOTAL_BYTES) throw new ValidationError('Os arquivos somam mais de 18 MB. Envie em partes ou use import_media_from_url.');
      const result = await api.upload(decoded);
      return { urls: result.urls, items: decoded.map((file, index) => ({ url: result.urls[index], mimeType: file.mimeType, bytes: file.data.length, originalName: files[index].filename ?? null })) };
    },
  }),

  defineTool({
    name: 'search_instagram_audio',
    title: 'Buscar música do Instagram',
    category: 'media',
    description: 'Busca faixas da biblioteca de áudio do Instagram para usar em um REEL (campo instagramAudio de create_post/update_post).',
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: {
      accountId: accountIdSchema,
      type: z.enum(['music', 'original_sound']).default('music').describe('music = músicas licenciadas; original_sound = áudios originais.'),
      query: z.string().max(100).optional().describe('Termo de busca (artista, música). Vazio retorna sugestões.'),
    },
    handler: async ({ accountId, type, query }, { api }) => api.get('/posts/instagram-audio', { accountId, type, q: query }),
  }),
];
