import { PrismaClient } from '@prisma/client';
import { graphPost, graphGet, graphDelete as apiDelete } from '../../utils/instagram-api';
import { getDecryptedToken, getDecryptedThreadsToken } from './auth.service';
import { notifyPublishFailure } from '../notifications.service';
import { ConflictError } from '../../utils/errors';
import { verifyFacebookPageLink } from './facebook-link.service';
import { assertPostReady } from '../post-readiness';
import { normalizeMediaUrl } from '../../utils/public-media';

const prisma = new PrismaClient();

export const createMediaContainer = async (
  igUserId: string,
  token: string,
  mediaType: string,
  mediaUrls: string[],
  caption?: string
) => {
  let params: any = { caption };

  if (mediaType === 'IMAGE') {
    params.image_url = mediaUrls[0];
  } else if (mediaType === 'REEL') {
    params.media_type = 'REELS';
    params.video_url = mediaUrls[0];
  } else if (mediaType === 'STORY') {
    params.media_type = 'STORIES';
    if (mediaUrls[0]?.match(/\.(mp4|mov)(\?|$)/i)) params.video_url = mediaUrls[0];
    else params.image_url = mediaUrls[0];
  } else if (mediaType === 'CAROUSEL') {
    const childrenContainers = [];
    for (const url of mediaUrls) {
      const childParams = url.match(/\.(mp4|mov)(\?|$)/i)
        ? { media_type: 'VIDEO', video_url: url, is_carousel_item: true }
        : { image_url: url, is_carousel_item: true };
      const child = await graphPost(`/${igUserId}/media`, token, childParams);
      const childReady = await checkContainerStatus(child.id, token);
      if (!childReady) throw new Error('Uma das mídias do carrossel não foi processada pelo Instagram.');
      childrenContainers.push(child.id);
    }
    params.media_type = 'CAROUSEL';
    params.children = childrenContainers.join(',');
  }

  const response = await graphPost(`/${igUserId}/media`, token, params);
  return response.id;
};

export const checkContainerStatus = async (containerId: string, token: string): Promise<boolean> => {
  const maxRetries = 10;
  let retries = 0;

  while (retries < maxRetries) {
    const response = await graphGet(`/${containerId}`, token, { fields: 'status_code' });
    if (response.status_code === 'FINISHED') return true;
    if (response.status_code === 'ERROR') return false;
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    retries++;
  }
  return false;
};

export const publishContainer = async (igUserId: string, containerId: string, token: string) => {
  const response = await graphPost(`/${igUserId}/media_publish`, token, { creation_id: containerId });
  return response.id; // Returns igMediaId
};

const threadsPost = async (path: string, token: string, params: Record<string, unknown>) => {
  const url = new URL(`https://graph.threads.net${path}`);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, access_token: token })) {
    if (value !== undefined && value !== null) body.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Threads API error ${response.status}`);
  return data;
};

const threadsGet = async (path: string, token: string, params: Record<string, string> = {}) => {
  const url = new URL(`https://graph.threads.net${path}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Threads API error ${response.status}`);
  return data;
};

const waitForThreadsContainer = async (containerId: string, token: string) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await threadsGet(`/${containerId}`, token, { fields: 'status,error_message' });
    if (['FINISHED', 'PUBLISHED'].includes(status.status)) return;
    if (status.status === 'ERROR') throw new Error(status.error_message || 'Threads não conseguiu processar a mídia');
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  throw new Error('Threads demorou mais que o esperado para processar a mídia');
};

export const publishFacebookPost = async (post: any, token: string) => {
  const pageId = post.account.pageId;
  if (!pageId) throw new Error('A conta conectada não possui uma Página do Facebook vinculada.');
  await verifyFacebookPageLink(pageId, post.account.igUserId, token);

  const caption = post.caption || '';
  if (post.mediaType === 'REEL') {
    const response = await graphPost(`/${pageId}/videos`, token, {
      file_url: post.mediaUrls[0],
      description: caption,
    });
    return response.id || response.post_id;
  }

  if (post.mediaType === 'CAROUSEL') {
    const uploaded = [];
    for (const url of post.mediaUrls) {
      const photo = await graphPost(`/${pageId}/photos`, token, { url, published: false });
      uploaded.push(photo.id);
    }
    const attachedMedia: Record<string, string> = {};
    uploaded.forEach((id, index) => {
      attachedMedia[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
    });
    const response = await graphPost(`/${pageId}/feed`, token, { message: caption, ...attachedMedia });
    return response.id || response.post_id;
  }

  if (post.mediaType === 'STORY') {
    throw new Error('Stories do Facebook ainda não são publicados pela API usada neste workspace.');
  }

  const response = await graphPost(`/${pageId}/photos`, token, { url: post.mediaUrls[0], message: caption });
  return response.id || response.post_id;
};

export const publishThreadsPost = async (post: any, token: string) => {
  const caption = post.caption || '';
  if (!post.mediaUrls?.length) {
    const response = await threadsPost('/me/threads', token, {
      media_type: 'TEXT',
      text: caption,
      auto_publish_text: true,
    });
    return response.id;
  }

  let containerId: string;
  if (post.mediaType === 'CAROUSEL') {
    const children = [];
    for (const url of post.mediaUrls) {
      const child = await threadsPost('/me/threads', token, {
        media_type: url.match(/\.(mp4|mov)(\?|$)/i) ? 'VIDEO' : 'IMAGE',
        ...(url.match(/\.(mp4|mov)(\?|$)/i) ? { video_url: url } : { image_url: url }),
        is_carousel_item: true,
      });
      children.push(child.id);
    }
    const parent = await threadsPost('/me/threads', token, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      text: caption,
    });
    containerId = parent.id;
  } else {
    const isVideo = post.mediaType === 'REEL' || post.mediaUrls[0].match(/\.(mp4|mov)(\?|$)/i);
    const response = await threadsPost('/me/threads', token, {
      media_type: isVideo ? 'VIDEO' : 'IMAGE',
      ...(isVideo ? { video_url: post.mediaUrls[0] } : { image_url: post.mediaUrls[0] }),
      text: caption,
    });
    containerId = response.id;
  }

  await waitForThreadsContainer(containerId, token);
  const published = await threadsPost('/me/threads_publish', token, { creation_id: containerId });
  return published.id;
};

export const publishPost = async (scheduledPostId: string, trigger?: { scheduledFor?: string }) => {
  const post = await prisma.scheduledPost.findUnique({
    where: { id: scheduledPostId },
    include: { account: true, threadsAccount: true },
  });

  if (!post) throw new Error('Post not found');
  post.mediaUrls = post.mediaUrls.map(normalizeMediaUrl);
  // Queue deliveries are not permission to publish a draft, canceled item,
  // or a newer schedule. Legacy jobs have no date, but must still be due.
  if (trigger && (post.status !== 'SCHEDULED' || post.scheduledFor > new Date()
    || (trigger.scheduledFor !== undefined && post.scheduledFor.toISOString() !== trigger.scheduledFor))) {
    return null;
  }
  if (post.status === 'PUBLISHED') {
    if (post.publishedPostId) {
      const existing = await prisma.publishedPost.findUnique({ where: { id: post.publishedPostId } });
      if (existing) return existing;
    }
    throw new ConflictError('Esta publicação já foi concluída e não pode ser enviada novamente.');
  }
  if (post.status === 'PROCESSING') {
    throw new ConflictError('Esta publicação já está sendo processada. Aguarde o resultado antes de tentar novamente.');
  }
  assertPostReady(post);

  // Compare-and-set before any network write. The loser must not enter the
  // failure handler and reset the winner's PROCESSING status.
  const claimed = await prisma.scheduledPost.updateMany({
    where: { id: post.id, status: post.status, updatedAt: post.updatedAt },
    data: { status: 'PROCESSING', errorMessage: null },
  });
  if (claimed.count !== 1) {
    if (trigger) return null;
    throw new ConflictError('Esta publicação mudou ou já está sendo enviada. Atualize a tela antes de tentar novamente.');
  }

  try {
    const platforms = post.platforms?.length ? post.platforms : ['INSTAGRAM'];
    const results: Record<string, unknown> = {};
    const errors: string[] = [];

    if (platforms.includes('INSTAGRAM')) {
      try {
        const token = await getDecryptedToken(post.accountId);
        const containerId = await createMediaContainer(post.account.igUserId, token, post.mediaType, post.mediaUrls, post.caption || undefined);
        const isReady = await checkContainerStatus(containerId, token);
        if (!isReady) throw new Error('A mídia não foi processada pelo Instagram.');
        const igMediaId = await publishContainer(post.account.igUserId, containerId, token);
        // Enrichment must not turn a successful remote publication into a
        // retryable failure (which would send the same content again).
        const mediaDetails = await graphGet(`/${igMediaId}`, token, { fields: 'permalink,media_url' }).catch(() => ({}));
        results.INSTAGRAM = { id: igMediaId, permalink: mediaDetails.permalink, mediaUrl: mediaDetails.media_url };
      } catch (error) {
        errors.push(`Instagram: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
      }
    }

    if (platforms.includes('FACEBOOK')) {
      try {
        const token = await getDecryptedToken(post.accountId);
        const facebookPostId = await publishFacebookPost(post, token);
        results.FACEBOOK = { id: facebookPostId };
      } catch (error) {
        errors.push(`Facebook: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
      }
    }

    if (platforms.includes('THREADS')) {
      try {
        if (!post.threadsAccount) throw new Error('Conecte uma conta do Threads antes de publicar.');
        const token = await getDecryptedThreadsToken(post.threadsAccount.id);
        const threadsPostId = await publishThreadsPost(post, token);
        results.THREADS = { id: threadsPostId };
      } catch (error) {
        errors.push(`Threads: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
      }
    }

    const successfulPlatforms = Object.keys(results);
    if (!successfulPlatforms.length) throw new Error(errors.join(' | ') || 'Nenhuma plataforma publicou o conteúdo.');

    const instagramResult = results.INSTAGRAM as { id?: string; permalink?: string; mediaUrl?: string } | undefined;
    const facebookResult = results.FACEBOOK as { id?: string } | undefined;
    const threadsResult = results.THREADS as { id?: string } | undefined;
    const published = await prisma.publishedPost.create({
      data: {
        accountId: post.accountId,
        igMediaId: instagramResult?.id,
        facebookPostId: facebookResult?.id,
        threadsPostId: threadsResult?.id,
        publishResults: JSON.parse(JSON.stringify(results)),
        igMediaUrl: instagramResult?.mediaUrl,
        igPermalink: instagramResult?.permalink,
        mediaType: post.mediaType,
        caption: post.caption,
      },
    });

    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: {
        status: errors.length ? 'PUBLISHED' : 'PUBLISHED',
        publishedPostId: published.id,
        errorMessage: errors.length ? errors.join(' | ') : null,
      },
    });

    if (errors.length) {
      await notifyPublishFailure(post.userId, scheduledPostId, errors.join(' | ')).catch((notificationError) => {
        console.error('Could not create publish notification:', notificationError);
      });
    }

    return published;
  } catch (error: any) {
    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: { status: 'FAILED', errorMessage: error.message },
    });
    await notifyPublishFailure(post.userId, scheduledPostId, error.message || 'A publicação não foi concluída.').catch((notificationError) => {
      console.error('Could not create publish notification:', notificationError);
    });
    throw error;
  }
};

export const deleteFacebookPost = async (facebookPostId: string, accountId: string) => {
  const token = await getDecryptedToken(accountId);
  return apiDelete(`/${facebookPostId}`, token);
};

export const deleteThreadsPost = async (threadsPostId: string, threadsAccountId: string) => {
  const token = await getDecryptedThreadsToken(threadsAccountId);
  const url = new URL(`https://graph.threads.net/${threadsPostId}`);
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error || data?.success === false) {
    throw new Error(data?.error?.message || `Threads API error ${response.status}`);
  }
  return data;
};
