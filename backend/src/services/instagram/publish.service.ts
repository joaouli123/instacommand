import { PrismaClient } from '@prisma/client';
import { graphPost, graphGet, graphDelete as apiDelete } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';

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
  } else if (mediaType === 'CAROUSEL') {
    const childrenContainers = [];
    for (const url of mediaUrls) {
      const childParams = url.endsWith('.mp4') ? { media_type: 'VIDEO', video_url: url } : { image_url: url };
      const child = await graphPost(`/${igUserId}/media`, token, childParams);
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

export const publishPost = async (scheduledPostId: string) => {
  const post = await prisma.scheduledPost.findUnique({
    where: { id: scheduledPostId },
    include: { account: true },
  });

  if (!post) throw new Error('Post not found');

  try {
    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: { status: 'PROCESSING' },
    });

    const token = await getDecryptedToken(post.accountId);
    const containerId = await createMediaContainer(
      post.account.igUserId,
      token,
      post.mediaType,
      post.mediaUrls,
      post.caption || undefined
    );

    const isReady = await checkContainerStatus(containerId, token);
    if (!isReady) throw new Error('Media container processing failed');

    const igMediaId = await publishContainer(post.account.igUserId, containerId, token);
    
    const mediaDetails = await graphGet(`/${igMediaId}`, token, { fields: 'permalink,media_url' });

    const published = await prisma.publishedPost.create({
      data: {
        accountId: post.accountId,
        igMediaId,
        igMediaUrl: mediaDetails.media_url,
        igPermalink: mediaDetails.permalink,
        mediaType: post.mediaType,
        caption: post.caption,
      },
    });

    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: { status: 'PUBLISHED', publishedPostId: published.id },
    });

    return published;
  } catch (error: any) {
    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: { status: 'FAILED', errorMessage: error.message },
    });
    throw error;
  }
};

export const deletePost = async (igMediaId: string, accountId: string) => {
  const token = await getDecryptedToken(accountId);
  return apiDelete(`/${igMediaId}`, token);
};
