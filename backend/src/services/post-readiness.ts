import { ValidationError } from '../utils/errors';

export const SUPPORTED_PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'THREADS', 'X'];
/** Networks that accept a post with text only, no media. */
export const TEXT_PLATFORMS = ['THREADS', 'X'];
export const X_TEXT_LIMIT = 280;
export const X_MAX_MEDIA = 4;

/** Character limit of the strictest selected text network. */
export const textLimitFor = (platforms: string[]) => platforms.includes('X') ? X_TEXT_LIMIT : 500;
const textLength = (value?: string | null) => [...(value || '')].length;

export function assertPostReady(post: { mediaType: string; mediaUrls: string[]; caption?: string | null; platforms?: string[] }) {
  const platforms = post.platforms?.length ? post.platforms : ['INSTAGRAM'];
  if (platforms.some(p => !SUPPORTED_PLATFORMS.includes(p))) throw new ValidationError('Rede de publicação inválida.');
  if (!Array.isArray(post.mediaUrls)) throw new ValidationError('Mídias inválidas.');
  if (platforms.includes('X') && textLength(post.caption) > X_TEXT_LIMIT) throw new ValidationError(`O texto passa de ${X_TEXT_LIMIT} caracteres, o limite do X. Encurte a legenda ou desmarque o X.`);
  const textOnlyNetworks = platforms.every(p => TEXT_PLATFORMS.includes(p));
  if (post.mediaType === 'TEXT') {
    if (!textOnlyNetworks) throw new ValidationError('Post de texto sem mídia só está disponível no Threads e no X.');
    if (post.mediaUrls.length) throw new ValidationError('Post de texto não pode conter arquivos de mídia.');
    if (!post.caption?.trim()) throw new ValidationError('Escreva o texto da publicação.');
    if (textLength(post.caption) > textLimitFor(platforms)) throw new ValidationError(`O texto deve ter até ${textLimitFor(platforms)} caracteres.`);
    return;
  }
  if (textOnlyNetworks && !post.mediaUrls.length) {
    if (!post.caption?.trim()) throw new ValidationError('Escreva o texto da publicação.');
    return;
  }
  if (!post.mediaUrls.length) throw new ValidationError('Este rascunho ainda não tem mídia. Abra o compositor e adicione as imagens ou o vídeo antes de publicar ou agendar.');
  if (post.mediaType === 'CAROUSEL' && (post.mediaUrls.length < 2 || post.mediaUrls.length > 10)) throw new ValidationError('O carrossel precisa de 2 a 10 mídias.');
  if (post.mediaType === 'CAROUSEL' && platforms.includes('X') && post.mediaUrls.length > X_MAX_MEDIA) throw new ValidationError(`O X aceita até ${X_MAX_MEDIA} imagens por post. Use até ${X_MAX_MEDIA} ou desmarque o X.`);
  if (post.mediaType !== 'CAROUSEL' && post.mediaUrls.length !== 1) throw new ValidationError('Este formato usa uma única mídia.');
  if (post.mediaType === 'STORY' && platforms.some(p => p !== 'INSTAGRAM')) throw new ValidationError('Stories só estão disponíveis no Instagram.');
  if (!['IMAGE', 'CAROUSEL', 'REEL', 'STORY'].includes(post.mediaType)) throw new ValidationError('Formato inválido.');
}
