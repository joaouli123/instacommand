import { ValidationError } from '../utils/errors';

export type YouTubePrivacy = 'public' | 'unlisted' | 'private';
export const YOUTUBE_PRIVACY: YouTubePrivacy[] = ['public', 'unlisted', 'private'];
/** YouTube categories that fit brand content. 22 (People & Blogs) is YouTube's own default. */
export const YOUTUBE_CATEGORIES = ['1', '2', '10', '15', '17', '19', '20', '22', '23', '24', '25', '26', '27', '28'];
export const YOUTUBE_TITLE_LIMIT = 100;
export const YOUTUBE_DESCRIPTION_LIMIT = 5000;

export type YouTubeSettings = {
  title: string;
  privacyStatus: YouTubePrivacy;
  /** Required audience declaration (COPPA). null until the user chooses. */
  madeForKids: boolean | null;
  /** Realistic altered or synthetic content disclosure. */
  alteredContent: boolean;
  categoryId: string;
  /** Optional custom thumbnail: a public JPG/PNG up to 2 MB. */
  thumbnailUrl: string | null;
};

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
  const settings: YouTubeSettings = {
    title,
    privacyStatus: privacyStatus as YouTubePrivacy,
    madeForKids: typeof value.madeForKids === 'boolean' ? value.madeForKids : null,
    alteredContent: value.alteredContent === true,
    categoryId,
    thumbnailUrl,
  };
  if (options.requireComplete) {
    if (!settings.title) throw new ValidationError('Preencha o título do vídeo para o YouTube.');
    if (settings.madeForKids === null) throw new ValidationError('Indique se o vídeo do YouTube é feito para crianças.');
  }
  return settings;
}
