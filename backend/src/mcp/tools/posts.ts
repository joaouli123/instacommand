import { z } from 'zod';
import { encodePathSegment, type InternalApi } from '../internal-api';
import { ValidationError } from '../../utils/errors';
import {
  accountIdSchema, advancedSettingsSchema, audioFields, confirmSchema, dateTimeSchema, defineTool, DESTRUCTIVE, EXTERNAL,
  instagramAudioSchema, MEDIA_TYPES, mergeHashtagsIntoCaption, normalizeHashtags, platformSchema, POST_STATUSES,
  postDetails, postIdSchema, postSummary, READ, threadsAccountIdSchema, xAccountIdSchema, toIso, WRITE,
} from '../tool-kit';

const EDITABLE = new Set(['DRAFT', 'SCHEDULED', 'FAILED']);
const QUEUE_DELAY_MS = 30_000;

const mediaUrlsSchema = z.array(z.string().url().max(2048)).max(10)
  .describe('URLs públicas retornadas por import_media_from_url ou upload_media_base64, na ordem do post. TEXT não usa mídia.');
const captionSchema = z.string().max(2200).describe('Legenda/texto do post. No Threads, o texto final (com hashtags) precisa ter até 500 caracteres; no X, até 280.');
const hashtagsSchema = z.array(z.string().min(1).max(100)).max(30)
  .describe('Hashtags sem "#". São acrescentadas ao fim da legenda ao agendar/publicar (sem duplicar as que já estão no texto).');
const platformsSchema = z.array(platformSchema).min(1).max(4)
  .describe('Redes de destino. FACEBOOK publica na Página vinculada à conta do Instagram; THREADS exige threadsAccountId; X exige xAccountId (até 280 caracteres e 4 mídias).');

const unique = <T>(values: T[]) => [...new Set(values)];

async function loadPost(api: InternalApi, postId: string) {
  return api.get(`/posts/${encodePathSegment(postId)}`);
}

const assertEditable = (post: any, action: string) => {
  if (!EDITABLE.has(post.status)) {
    throw new ValidationError(`Esta publicação está ${post.status} e não pode ${action}. Use get_post para ver o resultado.`);
  }
};

/** The caption that will reach the networks, exactly as the composer builds it. */
const captionForPublication = (post: any) => mergeHashtagsIntoCaption(post.caption, post.hashtags);

export const postTools = [
  defineTool({
    name: 'list_posts',
    title: 'Listar publicações e calendário',
    category: 'posts',
    description: 'Lista publicações (rascunhos, agendadas, publicadas, com falha) em ordem de data. Filtre por status, conta, rede, intervalo de datas (calendário) e texto. Retorna resumos; use get_post para o conteúdo completo.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {
      status: z.enum(POST_STATUSES).optional(),
      accountId: accountIdSchema.optional(),
      platform: platformSchema.optional().describe('Somente posts que incluem esta rede.'),
      from: dateTimeSchema.optional().describe('Início do intervalo (inclusive) para scheduledFor, ISO 8601 com fuso.'),
      to: dateTimeSchema.optional().describe('Fim do intervalo (inclusive) para scheduledFor, ISO 8601 com fuso.'),
      search: z.string().max(200).optional().describe('Trecho a procurar na legenda ou hashtags (sem diferenciar maiúsculas).'),
      limit: z.number().int().min(1).max(200).default(50),
    },
    handler: async ({ status, accountId, platform, from, to, search, limit }, { api }) => {
      const posts = await api.get<any[]>('/posts', { status, accountId });
      const fromTime = from ? new Date(from).getTime() : -Infinity;
      const toTime = to ? new Date(to).getTime() : Infinity;
      const needle = search?.trim().toLocaleLowerCase('pt-BR');
      const filtered = posts.filter((post) => {
        const time = new Date(post.scheduledFor).getTime();
        if (time < fromTime || time > toTime) return false;
        if (platform && !post.platforms?.includes(platform)) return false;
        if (needle && !`${post.caption || ''} ${(post.hashtags || []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(needle)) return false;
        return true;
      });
      return { total: filtered.length, truncated: filtered.length > limit, posts: filtered.slice(0, limit).map(postSummary) };
    },
  }),

  defineTool({
    name: 'get_post',
    title: 'Detalhes da publicação',
    category: 'posts',
    description: 'Conteúdo completo de uma publicação: legenda, legenda final como será publicada (captionAsPublished), mídias, redes, data, opções avançadas, erros e links quando já publicada.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: { postId: postIdSchema },
    handler: async ({ postId }, { api }) => postDetails(await loadPost(api, postId)),
  }),

  defineTool({
    name: 'create_post',
    title: 'Criar publicação',
    category: 'posts',
    description: 'Cria uma publicação para Instagram, Facebook e/ou Threads. Por padrão salva como DRAFT (rascunho, nada é publicado). Com status SCHEDULED agenda para scheduledFor (exige permissão publish e confirmação do usuário). Envie as mídias antes com import_media_from_url/upload_media_base64. Veja get_publishing_guide para formatos e limites.',
    scopes: ['write'],
    scopesFor: (args) => (args.status === 'SCHEDULED' ? ['publish'] : ['write']),
    annotations: WRITE,
    inputSchema: {
      accountId: accountIdSchema.describe('Conta do Instagram dona do post (obrigatória mesmo para posts só no Facebook ou só no Threads).'),
      platforms: platformsSchema.default(['INSTAGRAM']),
      threadsAccountId: threadsAccountIdSchema.optional().describe('Obrigatório quando platforms inclui THREADS.'),
      xAccountId: xAccountIdSchema.optional().describe('Obrigatório quando platforms inclui X.'),
      mediaType: z.enum(MEDIA_TYPES).describe('IMAGE (1 imagem), CAROUSEL (2–10 mídias; no X até 4), REEL (1 vídeo), STORY (1 mídia, só Instagram) ou TEXT (só Threads e/ou X, sem mídia).'),
      mediaUrls: mediaUrlsSchema.default([]),
      caption: captionSchema.default(''),
      hashtags: hashtagsSchema.optional(),
      scheduledFor: dateTimeSchema.describe('Data/hora planejada, ISO 8601 com fuso. Para SCHEDULED precisa ser futura; para DRAFT define o dia no calendário.'),
      status: z.enum(['DRAFT', 'SCHEDULED']).default('DRAFT'),
      isAiGenerated: z.boolean().optional().describe('Marca o post do Instagram como conteúdo gerado por IA.'),
      instagramAudio: instagramAudioSchema.optional(),
      advancedSettings: advancedSettingsSchema.optional(),
    },
    handler: async (args, { api }) => {
      const hashtags = normalizeHashtags(args.hashtags) ?? [];
      const caption = args.status === 'SCHEDULED' ? mergeHashtagsIntoCaption(args.caption, hashtags) : args.caption;
      const created = await api.post('/posts', {
        accountId: args.accountId,
        threadsAccountId: args.threadsAccountId,
        xAccountId: args.xAccountId,
        platforms: unique(args.platforms),
        mediaType: args.mediaType,
        mediaUrls: args.mediaUrls,
        caption,
        hashtags,
        scheduledFor: toIso(args.scheduledFor),
        status: args.status,
        isAiGenerated: args.isAiGenerated,
        ...audioFields(args.instagramAudio),
        advancedSettings: args.advancedSettings,
      });
      const post = await loadPost(api, created.id);
      return {
        post: postDetails(post),
        next: post.status === 'DRAFT'
          ? 'Rascunho salvo; nada foi publicado. Mostre o resumo ao usuário e, após confirmação, use schedule_post ou publish_post_now.'
          : `Agendado para ${post.scheduledFor}. A fila publicará automaticamente.`,
      };
    },
  }),

  defineTool({
    name: 'update_post',
    title: 'Editar publicação',
    category: 'posts',
    description: 'Edita um rascunho, um agendamento ou um post com falha. Envie só os campos que mudam. Editar um post agendado mantém o agendamento (exige permissão publish). Para remover hashtags que já foram incorporadas à legenda de um post agendado, envie a legenda corrigida.',
    scopes: ['write'],
    scopesFor: (args) => (args.status === 'SCHEDULED' ? ['publish'] : ['write']),
    annotations: WRITE,
    inputSchema: {
      postId: postIdSchema,
      platforms: platformsSchema.optional(),
      threadsAccountId: threadsAccountIdSchema.nullable().optional().describe('null remove a conta do Threads.'),
      xAccountId: xAccountIdSchema.nullable().optional().describe('null remove a conta do X.'),
      mediaType: z.enum(MEDIA_TYPES).optional(),
      mediaUrls: mediaUrlsSchema.optional(),
      caption: captionSchema.optional(),
      hashtags: hashtagsSchema.optional(),
      scheduledFor: dateTimeSchema.optional(),
      status: z.enum(['DRAFT', 'SCHEDULED']).optional().describe('DRAFT cancela o agendamento; SCHEDULED agenda (exige permissão publish).'),
      isAiGenerated: z.boolean().optional(),
      instagramAudio: instagramAudioSchema.nullable().optional().describe('null remove a música.'),
      advancedSettings: advancedSettingsSchema.nullable().optional().describe('Substitui todas as opções avançadas; null limpa.'),
    },
    handler: async ({ postId, ...changes }, { api }) => {
      const current = await loadPost(api, postId);
      assertEditable(current, 'ser editada');
      const hashtags = normalizeHashtags(changes.hashtags);
      const body: Record<string, unknown> = {};
      if (changes.platforms) body.platforms = unique(changes.platforms);
      if (changes.threadsAccountId !== undefined) body.threadsAccountId = changes.threadsAccountId;
      if (changes.xAccountId !== undefined) body.xAccountId = changes.xAccountId;
      if (changes.mediaType) body.mediaType = changes.mediaType;
      if (changes.mediaUrls) body.mediaUrls = changes.mediaUrls;
      if (changes.caption !== undefined) body.caption = changes.caption;
      if (hashtags) body.hashtags = hashtags;
      if (changes.scheduledFor) body.scheduledFor = toIso(changes.scheduledFor);
      if (changes.status) body.status = changes.status;
      if (changes.isAiGenerated !== undefined) body.isAiGenerated = changes.isAiGenerated;
      Object.assign(body, audioFields(changes.instagramAudio));
      if (changes.advancedSettings !== undefined) body.advancedSettings = changes.advancedSettings;

      const nextStatus = changes.status ?? current.status;
      if (nextStatus === 'SCHEDULED') {
        const caption = mergeHashtagsIntoCaption(changes.caption ?? current.caption, hashtags ?? current.hashtags);
        if (caption !== (current.caption ?? '')) body.caption = caption;
      }
      if (!Object.keys(body).length) return { post: postDetails(current), note: 'Nada para alterar.' };
      await api.patch(`/posts/${encodePathSegment(postId)}`, body);
      return { post: postDetails(await loadPost(api, postId)) };
    },
  }),

  defineTool({
    name: 'schedule_post',
    title: 'Agendar ou reagendar',
    category: 'posts',
    description: 'Agenda um rascunho (ou post com falha) para publicação automática em scheduledFor, ou muda o horário de um post já agendado. As hashtags são incorporadas à legenda. Confirme data, hora e redes com o usuário antes.',
    scopes: ['publish'],
    annotations: EXTERNAL,
    inputSchema: { postId: postIdSchema, scheduledFor: dateTimeSchema.describe('Data/hora futura, ISO 8601 com fuso.') },
    handler: async ({ postId, scheduledFor }, { api }) => {
      const current = await loadPost(api, postId);
      assertEditable(current, 'ser agendada');
      const caption = captionForPublication(current);
      await api.patch(`/posts/${encodePathSegment(postId)}`, {
        status: 'SCHEDULED',
        scheduledFor: toIso(scheduledFor),
        ...(caption !== (current.caption ?? '') ? { caption } : {}),
      });
      const post = await loadPost(api, postId);
      return { post: postDetails(post), message: `Agendado para ${post.scheduledFor}.` };
    },
  }),

  defineTool({
    name: 'unschedule_post',
    title: 'Cancelar agendamento',
    category: 'posts',
    description: 'Cancela o agendamento e devolve a publicação para rascunho. Nada é apagado.',
    scopes: ['write'],
    annotations: WRITE,
    inputSchema: { postId: postIdSchema },
    handler: async ({ postId }, { api }) => {
      await api.delete(`/scheduler/${encodePathSegment(postId)}`);
      return { post: postDetails(await loadPost(api, postId)), message: 'Agendamento cancelado; o post voltou para rascunho.' };
    },
  }),

  defineTool({
    name: 'publish_post_now',
    title: 'Publicar agora',
    category: 'posts',
    description: 'Publica imediatamente nas redes do post. IRREVERSÍVEL: só use após o usuário confirmar explicitamente. mode "auto" (padrão) aguarda o resultado para IMAGE e TEXT e coloca vídeos, Reels, Stories e carrosséis na fila (publicação em ~30 s; acompanhe com get_post), evitando estourar o tempo limite. Se a chamada expirar, consulte get_post antes de tentar de novo.',
    scopes: ['publish'],
    annotations: EXTERNAL,
    inputSchema: {
      postId: postIdSchema,
      confirm: confirmSchema,
      mode: z.enum(['auto', 'wait', 'queue']).default('auto').describe('wait = aguarda e retorna o resultado; queue = envia pela fila em ~30 s; auto = escolhe pelo formato.'),
    },
    handler: async ({ postId, mode }, { api }) => {
      const current = await loadPost(api, postId);
      assertEditable(current, 'ser publicada');
      const caption = captionForPublication(current);
      const captionChange = caption !== (current.caption ?? '') ? { caption } : {};
      const effectiveMode = mode === 'auto' ? (['IMAGE', 'TEXT'].includes(current.mediaType) ? 'wait' : 'queue') : mode;

      if (effectiveMode === 'queue') {
        const publishAt = new Date(Date.now() + QUEUE_DELAY_MS).toISOString();
        await api.patch(`/posts/${encodePathSegment(postId)}`, { status: 'SCHEDULED', scheduledFor: publishAt, ...captionChange });
        return {
          queued: true,
          publishAt,
          post: postDetails(await loadPost(api, postId)),
          next: 'A fila publicará em cerca de 30 segundos. Consulte get_post em 1 a 3 minutos para ver PUBLISHED ou FAILED.',
        };
      }

      if (Object.keys(captionChange).length) await api.patch(`/posts/${encodePathSegment(postId)}`, captionChange);
      const result = await api.post(`/posts/${encodePathSegment(postId)}/publish`, {}, { timeoutMs: 10 * 60_000 });
      return {
        publishSummary: result.publishSummary,
        published: {
          permalink: result.igPermalink ?? null,
          instagramMediaId: result.igMediaId ?? null,
          facebookPostId: result.facebookPostId ?? null,
          threadsPostId: result.threadsPostId ?? null,
          publishedAt: result.publishedAt ?? null,
        },
        post: postDetails(await loadPost(api, postId)),
      };
    },
  }),

  defineTool({
    name: 'duplicate_post',
    title: 'Duplicar publicação',
    category: 'posts',
    description: 'Cria um novo RASCUNHO a partir de uma publicação existente (inclusive já publicada), opcionalmente para outra conta, outras redes ou outra data. Útil para repostar ou adaptar conteúdo.',
    scopes: ['write'],
    annotations: WRITE,
    inputSchema: {
      postId: postIdSchema,
      scheduledFor: dateTimeSchema.describe('Data planejada do novo rascunho.'),
      accountId: accountIdSchema.optional().describe('Outra conta do Instagram (padrão: a mesma).'),
      platforms: platformsSchema.optional(),
      threadsAccountId: threadsAccountIdSchema.nullable().optional(),
    },
    handler: async ({ postId, scheduledFor, accountId, platforms, threadsAccountId }, { api }) => {
      const source = await loadPost(api, postId);
      const nextPlatforms = unique(platforms ?? source.platforms ?? ['INSTAGRAM']);
      const created = await api.post('/posts', {
        accountId: accountId ?? source.accountId,
        threadsAccountId: nextPlatforms.includes('THREADS') ? (threadsAccountId === undefined ? source.threadsAccountId : threadsAccountId) ?? undefined : undefined,
        platforms: nextPlatforms,
        mediaType: source.mediaType,
        mediaUrls: source.mediaUrls,
        caption: source.caption ?? '',
        hashtags: source.hashtags ?? [],
        scheduledFor: toIso(scheduledFor),
        status: 'DRAFT',
        isAiGenerated: nextPlatforms.includes('INSTAGRAM') ? Boolean(source.isAiGenerated) : false,
        ...(source.instagramAudioId && nextPlatforms.includes('INSTAGRAM') && source.mediaType === 'REEL' ? {
          instagramAudioId: source.instagramAudioId, instagramAudioTitle: source.instagramAudioTitle, instagramAudioArtist: source.instagramAudioArtist,
          instagramAudioVolume: source.instagramAudioVolume ?? undefined, instagramVideoVolume: source.instagramVideoVolume ?? undefined,
        } : {}),
        advancedSettings: nextPlatforms.includes('INSTAGRAM') ? source.advancedSettings ?? undefined : undefined,
      });
      return { post: postDetails(await loadPost(api, created.id)), sourcePostId: postId };
    },
  }),

  defineTool({
    name: 'delete_post',
    title: 'Excluir publicação',
    category: 'posts',
    description: 'Exclui a publicação do InstaCommand (cancela agendamento). Se já publicada, tenta excluir no Facebook e no Threads; o Instagram não permite excluir pela API (o usuário apaga no app). IRREVERSÍVEL: exige confirmação explícita.',
    scopes: ['write'],
    annotations: DESTRUCTIVE,
    inputSchema: { postId: postIdSchema, confirm: confirmSchema },
    handler: async ({ postId }, { api }) => api.delete(`/posts/${encodePathSegment(postId)}`),
  }),
];
