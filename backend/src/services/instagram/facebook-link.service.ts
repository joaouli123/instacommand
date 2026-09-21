import { graphGet } from '../../utils/instagram-api';

// Validate legacy records too: older OAuth code guessed Page mappings by name.
// A failed lookup must not permit a write to a potentially unrelated Page.
export async function verifyFacebookPageLink(pageId: string, igUserId: string, token: string) {
  if (!pageId || !igUserId) {
    throw new Error('Não há uma Página do Facebook confirmada para este Instagram. Reconecte a conta e selecione a Página vinculada.');
  }
  const page = await graphGet(`/${pageId}`, token, { fields: 'id,name,instagram_business_account' });
  if (String(page.id || '') !== pageId || String(page.instagram_business_account?.id || '') !== igUserId) {
    throw new Error('A Página do Facebook não está vinculada a este Instagram na Meta. Reconecte a conta antes de publicar no Facebook.');
  }
  return { id: pageId, name: typeof page.name === 'string' ? page.name : null };
}
