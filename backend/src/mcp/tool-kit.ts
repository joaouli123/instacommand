import { z, type ZodRawShape } from 'zod';
import type { ApiScope } from '../services/api-scopes';
import type { InternalApi } from './internal-api';

export type McpAuth = {
  userId: string;
  email: string;
  scopes: ApiScope[];
  tokenKind: 'PERSONAL' | 'OAUTH';
  tokenName: string;
  clientName: string | null;
};

export type ToolContext = { api: InternalApi; auth: McpAuth };

export const TOOL_CATEGORIES = {
  workspace: 'Workspace',
  accounts: 'Contas e conexões',
  media: 'Mídias',
  posts: 'Publicações e calendário',
  ai: 'Assistente de IA',
  analytics: 'Relatórios',
  community: 'Comunidade',
  automations: 'Automações',
  research: 'Concorrentes e hashtags',
  settings: 'Notificações e configurações',
} as const;
export type ToolCategory = keyof typeof TOOL_CATEGORIES;

export type ToolAnnotations = { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };

export type ToolDefinition<Shape extends ZodRawShape = ZodRawShape> = {
  name: string;
  title: string;
  category: ToolCategory;
  description: string;
  /** Scopes the call needs. `scopesFor` refines it from the arguments (e.g. DRAFT vs SCHEDULED). */
  scopes: ApiScope[];
  scopesFor?: (args: z.infer<z.ZodObject<Shape>>) => ApiScope[];
  annotations: ToolAnnotations;
  inputSchema: Shape;
  meta?: Record<string, unknown>;
  handler: (args: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<unknown>;
};

export const defineTool = <Shape extends ZodRawShape>(definition: ToolDefinition<Shape>) => definition as unknown as ToolDefinition;

/** Reads InstaCommand data only. */
export const READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
/** Reads live data from Meta/Threads. */
export const READ_LIVE: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
/** Changes InstaCommand data without touching the social networks. */
export const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
/** Changes InstaCommand data idempotently (settings, merges). */
export const WRITE_IDEMPOTENT: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
/** Creates something public or contacts an external service. */
export const EXTERNAL: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
/** Deletes or overwrites; never retried automatically. */
export const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

// ---------------------------------------------------------------- shared schemas

export const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'THREADS', 'X'] as const;
export const MEDIA_TYPES = ['IMAGE', 'CAROUSEL', 'REEL', 'STORY', 'TEXT'] as const;
export const POST_STATUSES = ['DRAFT', 'SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED'] as const;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export const accountIdSchema = z.string().uuid()
  .describe('ID interno da conta do Instagram no InstaCommand (campo "id" de list_accounts). Não é o @usuário nem o ID da Meta.');
export const threadsAccountIdSchema = z.string().uuid().describe('ID interno da conta do Threads (campo "id" em threads de list_accounts).');
export const xAccountIdSchema = z.string().uuid().describe('ID interno da conta do X (campo "id" em x de list_accounts).');
export const postIdSchema = z.string().uuid().describe('ID da publicação no InstaCommand (campo "id" de list_posts).');

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
export const dateTimeSchema = z.string()
  .regex(ISO_WITH_OFFSET, 'Use ISO 8601 com fuso horário, ex.: 2026-10-10T18:30:00-03:00')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Data inválida.')
  .describe(`Data e hora em ISO 8601 com fuso explícito, ex.: 2026-10-10T18:30:00-03:00 (fuso padrão do workspace: ${DEFAULT_TIMEZONE}).`);

export const confirmSchema = z.literal(true)
  .describe('Envie true somente depois que o usuário confirmou explicitamente esta ação nesta conversa.');

export const platformSchema = z.enum(PLATFORMS);
export const automationPlatformSchema = z.enum(PLATFORMS).default('INSTAGRAM')
  .describe('Rede da automação. INSTAGRAM (comentários e DMs), FACEBOOK (Messenger da Página) ou THREADS (respostas públicas).');
export const automationAccountIdSchema = z.string().uuid()
  .describe('Para INSTAGRAM e FACEBOOK: id da conta do Instagram. Para THREADS: id da conta do Threads.');

export const daysSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365), z.literal(730)]).default(30)
  .describe('Período do relatório em dias: 7, 30, 90, 365 ou 730.');

export const advancedSettingsSchema = z.object({
  altTexts: z.array(z.string().max(1000)).max(10).optional().describe('Texto alternativo por mídia, na mesma ordem de mediaUrls (somente Instagram).'),
  collaborators: z.array(z.string().max(31)).max(3).optional().describe('Até 3 @usuários colaboradores (IMAGE, CAROUSEL ou REEL no Instagram).'),
  firstComment: z.string().max(2200).optional().describe('Primeiro comentário publicado logo após o post (não vale para STORY).'),
  disableComments: z.boolean().optional().describe('Desativa comentários no post do Instagram (não vale para STORY).'),
  userTags: z.array(z.object({
    username: z.string().max(31).describe('@usuário marcado.'),
    x: z.number().min(0).max(1).describe('Posição horizontal de 0 (esquerda) a 1 (direita).'),
    y: z.number().min(0).max(1).describe('Posição vertical de 0 (topo) a 1 (base).'),
    mediaIndex: z.number().int().min(0).max(9).describe('Índice da mídia em mediaUrls (0 = primeira).'),
  })).max(20).optional().describe('Pessoas marcadas na imagem (IMAGE ou CAROUSEL no Instagram).'),
  locationId: z.string().max(300).nullable().optional().describe('Localização (location_id): ID de uma Página do Facebook com endereço, de locations_search, ou o link da Página. IMAGE, CAROUSEL ou REEL; não vale para STORY.'),
  locationName: z.string().max(200).nullable().optional().describe('Nome do local, só para exibição (ex.: "Parque Ibirapuera, São Paulo").'),
  shareToFeed: z.boolean().optional().describe('Somente REEL: mostrar o Reel também no feed/grade do perfil (share_to_feed). Padrão true.'),
  coverUrl: z.string().url().max(2000).nullable().optional().describe('Somente REEL: URL pública de uma imagem para a capa (cover_url). Use import_media_from_url antes. Não combine com thumbOffset.'),
  thumbOffset: z.number().int().min(0).max(900000).nullable().optional().describe('Somente REEL: quadro do vídeo usado como capa, em milissegundos (thumb_offset). Ignorado se coverUrl for usado.'),
  trialGraduation: z.enum(['MANUAL', 'SS_PERFORMANCE']).nullable().optional().describe('Somente REEL: publica como Reel de teste, mostrado primeiro só a não seguidores (trial_params). MANUAL = você decide no app se vai para os seguidores; SS_PERFORMANCE = o Instagram promove automaticamente se for bem.'),
}).describe('Opções avançadas do Instagram. Em update_post, envie o objeto completo (substitui o anterior).');

export const instagramAudioSchema = z.object({
  id: z.string().regex(/^\d{1,30}$/).describe('ID da faixa retornado por search_instagram_audio.'),
  title: z.string().max(200).optional(),
  artist: z.string().max(200).optional(),
  audioVolume: z.number().int().min(0).max(100).optional().describe('Volume da música (0–100, padrão 80).'),
  videoVolume: z.number().int().min(0).max(100).optional().describe('Volume do áudio original do vídeo (0–100, padrão 60).'),
}).describe('Música da biblioteca do Instagram (somente REEL publicado no Instagram).');

// ---------------------------------------------------------------- helpers

export const isPlainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Same rule as the composer: hashtags not yet in the text are appended after a blank line. */
export function mergeHashtagsIntoCaption(caption: string | null | undefined, hashtags: readonly string[] | null | undefined) {
  const base = (caption || '').trim();
  const existing = new Set((base.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase()));
  const extra: string[] = [];
  for (const raw of hashtags || []) {
    const tag = String(raw).trim().replace(/^#+/, '');
    if (!tag || existing.has(`#${tag}`.toLowerCase())) continue;
    existing.add(`#${tag}`.toLowerCase());
    extra.push(`#${tag}`);
  }
  return [base, extra.join(' ')].filter(Boolean).join('\n\n');
}

export const normalizeHashtags = (hashtags: readonly string[] | undefined) => hashtags?.map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean);

export const normalizeUsername = (value: string) => value.trim().replace(/^@+/, '');

export const preview = (text: string | null | undefined, length = 280) => {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

export function compactAccount(account: any) {
  return {
    id: account.id,
    username: account.igUsername,
    name: account.igName ?? null,
    followers: account.igFollowersCount ?? null,
    following: account.igFollowsCount ?? null,
    mediaCount: account.igMediaCount ?? null,
    bio: account.igBio ?? null,
    profilePicUrl: account.igProfilePicUrl ?? null,
    facebookPage: account.pageId ? { id: account.pageId, name: account.pageName ?? null } : null,
    connectedAt: account.connectedAt ?? null,
    lastSyncAt: account.lastSyncAt ?? null,
    syncing: Boolean(account.syncing),
  };
}

export function compactThreadsAccount(account: any) {
  return {
    id: account.id,
    username: account.username,
    name: account.name ?? null,
    profilePicUrl: account.profilePicUrl ?? null,
    connectedAt: account.connectedAt ?? null,
    lastSyncAt: account.lastSyncAt ?? null,
  };
}

const publishedSummary = (published: any) => published ? {
  permalink: published.igPermalink ?? null,
  publishedAt: published.publishedAt ?? null,
  instagramMediaId: published.igMediaId ?? null,
  facebookPostId: published.facebookPostId ?? null,
  threadsPostId: published.threadsPostId ?? null,
  results: published.publishResults ?? null,
} : null;

export function postSummary(post: any) {
  return {
    id: post.id,
    status: post.status,
    mediaType: post.mediaType,
    platforms: post.platforms,
    accountId: post.accountId,
    threadsAccountId: post.threadsAccountId ?? null,
    scheduledFor: post.scheduledFor,
    captionPreview: preview(post.caption),
    captionLength: post.caption?.length ?? 0,
    hashtags: post.hashtags ?? [],
    mediaCount: Array.isArray(post.mediaUrls) ? post.mediaUrls.length : 0,
    mediaUrls: post.mediaUrls ?? [],
    errorMessage: post.errorMessage ?? null,
    published: publishedSummary(post.publishedPost),
  };
}

export function postDetails(post: any) {
  return {
    id: post.id,
    status: post.status,
    mediaType: post.mediaType,
    platforms: post.platforms,
    accountId: post.accountId,
    threadsAccountId: post.threadsAccountId ?? null,
    scheduledFor: post.scheduledFor,
    caption: post.caption ?? '',
    hashtags: post.hashtags ?? [],
    captionAsPublished: mergeHashtagsIntoCaption(post.caption, post.hashtags),
    mediaUrls: post.mediaUrls ?? [],
    isAiGenerated: Boolean(post.isAiGenerated),
    instagramAudio: post.instagramAudioId ? {
      id: post.instagramAudioId, title: post.instagramAudioTitle ?? null, artist: post.instagramAudioArtist ?? null,
      audioVolume: post.instagramAudioVolume ?? null, videoVolume: post.instagramVideoVolume ?? null,
    } : null,
    advancedSettings: post.advancedSettings ?? null,
    editorialBrief: post.editorialBrief ?? null,
    errorMessage: post.errorMessage ?? null,
    published: publishedSummary(post.publishedPost),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

/** Maps the tool's audio object to the REST fields used by the composer. */
export function audioFields(audio: z.infer<typeof instagramAudioSchema> | null | undefined) {
  if (audio === undefined) return {};
  if (audio === null) return { instagramAudioId: null, instagramAudioTitle: null, instagramAudioArtist: null };
  return {
    instagramAudioId: audio.id,
    instagramAudioTitle: audio.title ?? null,
    instagramAudioArtist: audio.artist ?? null,
    ...(audio.audioVolume === undefined ? {} : { instagramAudioVolume: audio.audioVolume }),
    ...(audio.videoVolume === undefined ? {} : { instagramVideoVolume: audio.videoVolume }),
  };
}

export const toIso = (value: string) => new Date(value).toISOString();
