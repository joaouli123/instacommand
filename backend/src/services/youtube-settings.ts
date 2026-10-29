import { ValidationError } from '../utils/errors';

export type YouTubePrivacy = 'public' | 'unlisted' | 'private';
export const YOUTUBE_PRIVACY: YouTubePrivacy[] = ['public', 'unlisted', 'private'];
/** Regular video (watch page) or Short (vertical or square, up to 3 minutes). */
export type YouTubeFormat = 'video' | 'short';
export const YOUTUBE_FORMATS: YouTubeFormat[] = ['video', 'short'];
export type YouTubeLicense = 'youtube' | 'creativeCommon';
/** YouTube categories that fit brand content. 22 (People & Blogs) is YouTube's own default. */
export const YOUTUBE_CATEGORIES = ['1', '2', '10', '15', '17', '19', '20', '22', '23', '24', '25', '26', '27', '28'];
/** Languages offered for the title/description and for the spoken audio (BCP-47, as YouTube expects). */
export const YOUTUBE_LANGUAGES = ['pt-BR', 'pt-PT', 'en', 'es', 'es-419', 'fr', 'de', 'it', 'ja'];
export const YOUTUBE_TITLE_LIMIT = 100;
export const YOUTUBE_DESCRIPTION_LIMIT = 5000;
/** YouTube counts tags with spaces as quoted and joins them with commas; the total cannot pass 500. */
export const YOUTUBE_TAGS_LIMIT = 500;

export type YouTubeSettings = {
  format: YouTubeFormat;
  title: string;
  privacyStatus: YouTubePrivacy;
  /** Required audience declaration (COPPA). null until the user chooses. */
  madeForKids: boolean | null;
  /** Realistic altered or synthetic content disclosure. */
  alteredContent: boolean;
  categoryId: string;
  /** Optional custom thumbnail: a public JPG/PNG up to 2 MB. */
  thumbnailUrl: string | null;
  tags: string[];
  /** Language of the title and description. */
  defaultLanguage: string | null;
  /** Language spoken in the video. */
  defaultAudioLanguage: string | null;
  license: YouTubeLicense;
  /** Other sites may embed the video. */
  embeddable: boolean;
  /** The like count stays visible on the watch page. */
  publicStatsViewable: boolean;
  /** Subscribers get the new-video notification. */
  notifySubscribers: boolean;
  /** Day the video was recorded, YYYY-MM-DD. */
  recordingDate: string | null;
};

export const youtubeTagsLength = (tags: string[]) => tags.reduce((total, tag) => total + tag.length + (/\s/.test(tag) ? 2 : 0), 0) + Math.max(0, tags.length - 1);

const optionalBoolean = (value: unknown, fallback: boolean, message: string) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new ValidationError(message);
  return value;
};

const optionalLanguage = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !YOUTUBE_LANGUAGES.includes(value)) throw new ValidationError('Idioma do YouTube inválido.');
  return value;
};

function readTags(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('As tags do YouTube precisam ser uma lista.');
  const tags: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') throw new ValidationError('Tag do YouTube inválida.');
    const tag = raw.replace(/\s+/g, ' ').replace(/^#/, '').trim();
    if (!tag) continue;
    if (/[<>,]/.test(tag)) throw new ValidationError('As tags do YouTube não podem conter <, > ou vírgula.');
    if (!tags.some((item) => item.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  if (youtubeTagsLength(tags) > YOUTUBE_TAGS_LIMIT) throw new ValidationError(`As tags do YouTube somam mais de ${YOUTUBE_TAGS_LIMIT} caracteres. Remova algumas.`);
  return tags;
}

function readRecordingDate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError('Data de gravação do YouTube inválida.');
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ValidationError('Data de gravação do YouTube inválida.');
  // One day of slack covers time zones ahead of UTC.
  if (date.getTime() > Date.now() + 86_400_000) throw new ValidationError('A data de gravação do YouTube não pode estar no futuro.');
  return value;
}

/**
 * Normalizes the YouTube options of a post. Drafts may be incomplete; with
 * `requireComplete` (scheduling, publishing) the title and audience are mandatory.
 */
export function validateYouTubeSettings(raw: unknown, options: { requireComplete?: boolean } = {}): YouTubeSettings | null {
  if (raw === undefined || raw === null) {
    if (options.requireComplete) throw new ValidationError('Preencha o título do vídeo para o YouTube.');
    return null;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Configurações do YouTube inválidas.');
  const value = raw as Record<string, unknown>;
  const format = value.format === undefined || value.format === null ? 'video' : value.format;
  if (!YOUTUBE_FORMATS.includes(format as YouTubeFormat)) throw new ValidationError('Formato do YouTube inválido: use vídeo ou Short.');
  const title = typeof value.title === 'string' ? value.title.replace(/\s+/g, ' ').trim() : '';
  if ([...title].length > YOUTUBE_TITLE_LIMIT) throw new ValidationError(`O título do YouTube pode ter até ${YOUTUBE_TITLE_LIMIT} caracteres.`);
  if (/[<>]/.test(title)) throw new ValidationError('O título do YouTube não pode conter < ou >.');
  const privacyStatus = value.privacyStatus === undefined ? 'public' : value.privacyStatus;
  if (!YOUTUBE_PRIVACY.includes(privacyStatus as YouTubePrivacy)) throw new ValidationError('Visibilidade do YouTube inválida.');
  if (value.madeForKids !== undefined && value.madeForKids !== null && typeof value.madeForKids !== 'boolean') throw new ValidationError('Indique se o vídeo é feito para crianças.');
  const categoryId = value.categoryId === undefined || value.categoryId === '' ? '22' : String(value.categoryId);
  if (!YOUTUBE_CATEGORIES.includes(categoryId)) throw new ValidationError('Categoria do YouTube inválida.');
  const thumbnailUrl = typeof value.thumbnailUrl === 'string' && value.thumbnailUrl.trim() ? value.thumbnailUrl.trim() : null;
  if (thumbnailUrl && !/^https?:\/\//.test(thumbnailUrl)) throw new ValidationError('A miniatura do YouTube precisa ser uma imagem enviada ao UX Code Social.');
  const license = value.license === undefined || value.license === null ? 'youtube' : value.license;
  if (license !== 'youtube' && license !== 'creativeCommon') throw new ValidationError('Licença do YouTube inválida.');
  const settings: YouTubeSettings = {
    format: format as YouTubeFormat,
    title,
    privacyStatus: privacyStatus as YouTubePrivacy,
    madeForKids: typeof value.madeForKids === 'boolean' ? value.madeForKids : null,
    alteredContent: value.alteredContent === true,
    categoryId,
    thumbnailUrl,
    tags: readTags(value.tags),
    defaultLanguage: optionalLanguage(value.defaultLanguage),
    defaultAudioLanguage: optionalLanguage(value.defaultAudioLanguage),
    license,
    embeddable: optionalBoolean(value.embeddable, true, 'Opção de incorporação do YouTube inválida.'),
    publicStatsViewable: optionalBoolean(value.publicStatsViewable, true, 'Opção de curtidas visíveis do YouTube inválida.'),
    notifySubscribers: optionalBoolean(value.notifySubscribers, true, 'Opção de notificar inscritos do YouTube inválida.'),
    recordingDate: readRecordingDate(value.recordingDate),
  };
  if (options.requireComplete) {
    if (!settings.title) throw new ValidationError('Preencha o título do vídeo para o YouTube.');
    if (settings.madeForKids === null) throw new ValidationError('Indique se o vídeo do YouTube é feito para crianças.');
  }
  return settings;
}
