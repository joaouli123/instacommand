import { ValidationError } from '../utils/errors';

// TikTok post options exactly as TikTok's Direct Post guidelines require them: privacy picked
// by the user (no default), interactions off unless allowed, commercial content disclosure and
// the Music Usage Confirmation consent.

export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
export const TIKTOK_PRIVACY: TikTokPrivacy[] = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];
/** TikTok counts the caption in UTF-16 units. */
export const TIKTOK_CAPTION_LIMIT = 2200;

export type TikTokSettings = {
  /** Required before publishing; never preselected. */
  privacyLevel: TikTokPrivacy | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** Commercial content disclosure toggle and its two options. */
  commercialContent: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
  /** Realistic AI-generated content label. */
  aiGenerated: boolean;
  /** The user agreed to TikTok's Music Usage Confirmation (and Branded Content Policy when branded). */
  consent: boolean;
};

const bool = (value: unknown, name: string) => {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') throw new ValidationError(`Opção do TikTok inválida: ${name}.`);
  return value;
};

/**
 * Normalizes the TikTok options of a post. Drafts may be incomplete; with `requireComplete`
 * (scheduling, publishing) privacy, disclosure and consent must be settled.
 */
export function validateTikTokSettings(raw: unknown, options: { requireComplete?: boolean } = {}): TikTokSettings | null {
  if (raw === undefined || raw === null) {
    if (options.requireComplete) throw new ValidationError('Escolha quem pode ver o vídeo no TikTok.');
    return null;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Configurações do TikTok inválidas.');
  const value = raw as Record<string, unknown>;
  const privacyLevel = value.privacyLevel === undefined || value.privacyLevel === null || value.privacyLevel === '' ? null : value.privacyLevel;
  if (privacyLevel !== null && !TIKTOK_PRIVACY.includes(privacyLevel as TikTokPrivacy)) throw new ValidationError('Privacidade do TikTok inválida.');
  const settings: TikTokSettings = {
    privacyLevel: privacyLevel as TikTokPrivacy | null,
    allowComment: bool(value.allowComment, 'comentários'), allowDuet: bool(value.allowDuet, 'Dueto'), allowStitch: bool(value.allowStitch, 'Costura'),
    commercialContent: bool(value.commercialContent, 'divulgação comercial'), yourBrand: bool(value.yourBrand, 'sua marca'), brandedContent: bool(value.brandedContent, 'conteúdo de marca'),
    aiGenerated: bool(value.aiGenerated, 'conteúdo gerado por IA'), consent: bool(value.consent, 'consentimento'),
  };
  if (!settings.commercialContent) { settings.yourBrand = false; settings.brandedContent = false; }
  if (settings.brandedContent && settings.privacyLevel === 'SELF_ONLY') throw new ValidationError('Conteúdo de marca não pode ser publicado como "Só eu" no TikTok. Escolha outra privacidade.');
  if (options.requireComplete) {
    if (!settings.privacyLevel) throw new ValidationError('Escolha quem pode ver o vídeo no TikTok.');
    if (settings.commercialContent && !settings.yourBrand && !settings.brandedContent) throw new ValidationError('Na divulgação comercial do TikTok, marque "Sua marca", "Conteúdo de marca" ou os dois.');
    if (!settings.consent) throw new ValidationError('Confirme a Declaração de Uso de Música do TikTok antes de publicar.');
  }
  return settings;
}

/** The label TikTok shows on the post for the chosen disclosure. */
export const tiktokDisclosureLabel = (settings: Pick<TikTokSettings, 'commercialContent' | 'yourBrand' | 'brandedContent'>) =>
  !settings.commercialContent ? null : settings.brandedContent ? 'Parceria paga' : settings.yourBrand ? 'Conteúdo promocional' : null;
