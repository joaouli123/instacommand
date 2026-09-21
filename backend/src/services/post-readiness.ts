import { ValidationError } from '../utils/errors';

export function assertPostReady(post: { mediaType: string; mediaUrls: string[]; caption?: string | null; platforms?: string[] }) {
  const platforms = post.platforms?.length ? post.platforms : ['INSTAGRAM'];
  if (platforms.some(p => !['INSTAGRAM', 'FACEBOOK', 'THREADS'].includes(p))) throw new ValidationError('Rede de publicação inválida.');
  if (!Array.isArray(post.mediaUrls)) throw new ValidationError('Mídias inválidas.');
  const textOnly = platforms.length === 1 && platforms[0] === 'THREADS' && !post.mediaUrls.length;
  if (textOnly) {
    if (!post.caption?.trim()) throw new ValidationError('Escreva o texto da publicação.');
    return;
  }
  if (!post.mediaUrls.length) throw new ValidationError('Este rascunho ainda não tem mídia. Abra o compositor e adicione as imagens ou o vídeo antes de publicar ou agendar.');
  if (post.mediaType === 'CAROUSEL' && (post.mediaUrls.length < 2 || post.mediaUrls.length > 10)) throw new ValidationError('O carrossel precisa de 2 a 10 mídias.');
  if (post.mediaType !== 'CAROUSEL' && post.mediaUrls.length !== 1) throw new ValidationError('Este formato usa uma única mídia.');
  if (post.mediaType === 'STORY' && platforms.some(p => p !== 'INSTAGRAM')) throw new ValidationError('Stories só estão disponíveis no Instagram.');
  if (!['IMAGE', 'CAROUSEL', 'REEL', 'STORY'].includes(post.mediaType)) throw new ValidationError('Formato inválido.');
}
