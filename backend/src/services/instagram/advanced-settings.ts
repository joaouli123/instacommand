import { ValidationError } from '../../utils/errors';

export type InstagramUserTag = {
  username: string;
  x: number;
  y: number;
  mediaIndex: number;
};

export type InstagramAdvancedSettings = {
  altTexts: string[];
  collaborators: string[];
  firstComment: string;
  disableComments: boolean;
  userTags: InstagramUserTag[];
  /** Facebook Page ID with a location, sent as `location_id` (IMAGE, CAROUSEL, REEL). */
  locationId: string | null;
  /** Display-only name of the chosen location. */
  locationName: string | null;
  /** Reels only: `share_to_feed` (Instagram default is true). */
  shareToFeed: boolean;
  /** Reels only: `cover_url`, a public image URL used as the cover. */
  coverUrl: string | null;
  /** Reels only: `thumb_offset`, frame in milliseconds used as cover when no cover_url. */
  thumbOffset: number | null;
  /** Reels only: `trial_params.graduation_strategy` (trial reel shown to non-followers first). */
  trialGraduation: InstagramTrialGraduation | null;
};

export type InstagramTrialGraduation = 'MANUAL' | 'SS_PERFORMANCE';
export const TRIAL_GRADUATION_STRATEGIES: InstagramTrialGraduation[] = ['MANUAL', 'SS_PERFORMANCE'];
export const LOCATION_MEDIA_TYPES = ['IMAGE', 'CAROUSEL', 'REEL'];

/** Accepts a numeric ID or a facebook.com page/place URL and returns the numeric ID. */
export const parseLocationId = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (/^\d{5,25}$/.test(text)) return text;
  const match = text.match(/facebook\.com\/(?:[^?#]*?[-/])?(\d{5,25})(?:[/?#]|$)/i)
    || text.match(/[?&](?:id|place_id|page_id)=(\d{5,25})/i);
  return match ? match[1] : null;
};

/** True when any Instagram-only advanced option is set. */
export const hasInstagramAdvancedOptions = (settings: InstagramAdvancedSettings) => Boolean(
  settings.firstComment || settings.disableComments || settings.collaborators.length || settings.userTags.length
  || settings.altTexts.some(Boolean) || settings.locationId || settings.shareToFeed === false
  || settings.coverUrl || settings.thumbOffset !== null || settings.trialGraduation,
);

export const emptyInstagramAdvancedSettings = (): InstagramAdvancedSettings => ({
  altTexts: [],
  collaborators: [],
  firstComment: '',
  disableComments: false,
  userTags: [],
  locationId: null,
  locationName: null,
  shareToFeed: true,
  coverUrl: null,
  thumbOffset: null,
  trialGraduation: null,
});

const normalizeUsername = (value: unknown) => typeof value === 'string'
  ? value.trim().replace(/^@+/, '').toLowerCase()
  : '';

const isUsername = (value: string) => /^[a-z0-9._]{1,30}$/i.test(value);

export const validateInstagramAdvancedSettings = (
  input: unknown,
  mediaType: string,
  mediaCount: number,
): InstagramAdvancedSettings => {
  if (input === undefined || input === null) return emptyInstagramAdvancedSettings();
  if (typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('As configurações avançadas estão inválidas.');

  const raw = input as Record<string, unknown>;
  const defaults = emptyInstagramAdvancedSettings();
  const altTexts = raw.altTexts === undefined ? defaults.altTexts : raw.altTexts;
  const collaborators = raw.collaborators === undefined ? defaults.collaborators : raw.collaborators;
  const firstComment = raw.firstComment === undefined ? defaults.firstComment : raw.firstComment;
  const disableComments = raw.disableComments === undefined ? defaults.disableComments : raw.disableComments;
  const userTags = raw.userTags === undefined ? defaults.userTags : raw.userTags;

  if (!Array.isArray(altTexts) || altTexts.length > mediaCount || altTexts.some((text) => typeof text !== 'string' || text.length > 1000)) {
    throw new ValidationError('O texto alternativo pode ter até 1.000 caracteres por imagem.');
  }
  if (!Array.isArray(collaborators) || collaborators.length > 3) {
    throw new ValidationError('Escolha no máximo 3 colaboradores.');
  }
  const normalizedCollaborators = collaborators.map(normalizeUsername);
  if (normalizedCollaborators.some((username) => !isUsername(username))
    || new Set(normalizedCollaborators).size !== normalizedCollaborators.length) {
    throw new ValidationError('Confira os @usuários dos colaboradores.');
  }
  if (!['IMAGE', 'CAROUSEL', 'REEL'].includes(mediaType) && normalizedCollaborators.length > 0) {
    throw new ValidationError('Colaboradores estão disponíveis para fotos, carrosséis e Reels do Instagram.');
  }
  if (typeof firstComment !== 'string' || firstComment.length > 2200) {
    throw new ValidationError('O primeiro comentário deve ter até 2.200 caracteres.');
  }
  if ((firstComment.trim() || disableComments === true)
    && !['IMAGE', 'CAROUSEL', 'REEL'].includes(mediaType)) {
    throw new ValidationError('Primeiro comentário e controle de comentários estão disponíveis em posts e Reels, não em Stories.');
  }
  if (typeof disableComments !== 'boolean') throw new ValidationError('A opção de desativar comentários está inválida.');
  if (!Array.isArray(userTags) || userTags.length > 20) throw new ValidationError('Marque até 20 pessoas por publicação.');
  if (userTags.length && !['IMAGE', 'CAROUSEL'].includes(mediaType)) {
    throw new ValidationError('A marcação de pessoas está disponível em fotos do feed e carrosséis.');
  }

  const normalizedUserTags = userTags.map((tag): InstagramUserTag | null => {
    if (!tag || typeof tag !== 'object' || Array.isArray(tag)) return null;
    const value = tag as Record<string, unknown>;
    const username = normalizeUsername(value.username);
    const mediaIndex = value.mediaIndex;
    const x = value.x;
    const y = value.y;
    if (!isUsername(username) || !Number.isInteger(mediaIndex) || Number(mediaIndex) < 0 || Number(mediaIndex) >= mediaCount
      || typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1
      || typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 1) return null;
    return { username, x, y, mediaIndex: Number(mediaIndex) };
  });
  if (normalizedUserTags.some((tag) => tag === null)) throw new ValidationError('Revise o @usuário e a posição das pessoas marcadas.');
  if (normalizedUserTags.some((tag) => mediaType === 'IMAGE' && tag?.mediaIndex !== 0)) {
    throw new ValidationError('A foto única só pode receber marcações na própria imagem.');
  }

  let locationId: string | null = null;
  if (raw.locationId !== undefined && raw.locationId !== null && raw.locationId !== '') {
    locationId = parseLocationId(raw.locationId);
    if (!locationId) throw new ValidationError('Localização inválida. Escolha um local da busca ou cole o ID/link da Página do Facebook do local.');
  }
  if (locationId && !LOCATION_MEDIA_TYPES.includes(mediaType)) {
    throw new ValidationError('A localização está disponível para fotos, carrosséis e Reels do Instagram, não em Stories.');
  }
  const locationName = locationId && typeof raw.locationName === 'string' ? raw.locationName.trim().slice(0, 200) || null : null;

  const shareToFeed = raw.shareToFeed === undefined || raw.shareToFeed === null ? true : raw.shareToFeed;
  if (typeof shareToFeed !== 'boolean') throw new ValidationError('A opção de mostrar o Reel no feed está inválida.');

  let coverUrl: string | null = null;
  if (raw.coverUrl !== undefined && raw.coverUrl !== null && raw.coverUrl !== '') {
    if (typeof raw.coverUrl !== 'string' || raw.coverUrl.length > 2000 || !/^https?:\/\//i.test(raw.coverUrl.trim())) {
      throw new ValidationError('A capa do Reel precisa ser o link público de uma imagem (http/https).');
    }
    coverUrl = raw.coverUrl.trim();
  }

  let thumbOffset: number | null = null;
  if (raw.thumbOffset !== undefined && raw.thumbOffset !== null && raw.thumbOffset !== '') {
    const value = Number(raw.thumbOffset);
    if (!Number.isInteger(value) || value < 0 || value > 15 * 60 * 1000) {
      throw new ValidationError('O quadro da capa deve ser um tempo em milissegundos dentro do vídeo.');
    }
    thumbOffset = value;
  }

  let trialGraduation: InstagramTrialGraduation | null = null;
  if (raw.trialGraduation !== undefined && raw.trialGraduation !== null && raw.trialGraduation !== '') {
    const value = String(raw.trialGraduation).toUpperCase();
    if (!TRIAL_GRADUATION_STRATEGIES.includes(value as InstagramTrialGraduation)) {
      throw new ValidationError('Reel de teste: escolha MANUAL ou SS_PERFORMANCE (automático por desempenho).');
    }
    trialGraduation = value as InstagramTrialGraduation;
  }

  if (mediaType !== 'REEL' && (shareToFeed === false || coverUrl || thumbOffset !== null || trialGraduation)) {
    throw new ValidationError('Capa, quadro da capa, "mostrar no feed" e Reel de teste só valem para Reels do Instagram.');
  }
  if (coverUrl && thumbOffset !== null) {
    throw new ValidationError('Escolha uma imagem de capa ou um quadro do vídeo, não os dois.');
  }

  return {
    altTexts: altTexts as string[],
    collaborators: normalizedCollaborators,
    firstComment: firstComment.trim(),
    disableComments: disableComments as boolean,
    userTags: normalizedUserTags as InstagramUserTag[],
    locationId,
    locationName,
    shareToFeed,
    coverUrl,
    thumbOffset,
    trialGraduation,
  };
};
