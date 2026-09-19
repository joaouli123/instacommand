import { env } from '../../config/env';
import { graphGet } from '../../utils/instagram-api';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const algorithm = 'aes-256-cbc';
const key = crypto.createHash('sha256').update(env.ENCRYPTION_KEY).digest();

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export const getOAuthUrl = () => {
  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
  ].join(',');

  return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${env.FB_APP_ID}&redirect_uri=${env.FB_REDIRECT_URI}&scope=${scopes}&response_type=code`;
};

export const handleOAuthCallback = async (code: string, userId: string) => {
  // Exchange code for short-lived token
  const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${env.FB_APP_ID}&redirect_uri=${env.FB_REDIRECT_URI}&client_secret=${env.FB_APP_SECRET}&code=${code}`;
  const tokenResponse = await fetch(tokenUrl).then((res) => res.json());

  if (tokenResponse.error) {
    throw new Error(tokenResponse.error.message);
  }

  // Get long-lived token
  const longLivedUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.FB_APP_ID}&client_secret=${env.FB_APP_SECRET}&fb_exchange_token=${tokenResponse.access_token}`;
  const longLivedResponse = await fetch(longLivedUrl).then((res) => res.json());
  const userToken = longLivedResponse.access_token;

  // Get user's pages
  const pagesData = await graphGet('/me/accounts', userToken);

  const connectedAccounts = [];

  for (const page of pagesData.data) {
    const pageToken = page.access_token;
    
    // Get linked Instagram Business Account
    const igData = await graphGet(`/${page.id}`, pageToken, {
      fields: 'instagram_business_account',
    });

    if (igData.instagram_business_account) {
      const igId = igData.instagram_business_account.id;
      
      // Get IG account details
      const profileData = await graphGet(`/${igId}`, pageToken, {
        fields: 'username,name,profile_picture_url,biography,followers_count,follows_count,media_count',
      });

      const encryptedToken = encrypt(pageToken);

      const account = await prisma.instagramAccount.upsert({
        where: { igUserId: igId },
        update: {
          igUsername: profileData.username,
          igName: profileData.name,
          igProfilePicUrl: profileData.profile_picture_url,
          igBio: profileData.biography,
          igFollowersCount: profileData.followers_count,
          igFollowsCount: profileData.follows_count,
          igMediaCount: profileData.media_count,
          pageId: page.id,
          pageAccessToken: encryptedToken,
          isActive: true,
          userId,
        },
        create: {
          igUserId: igId,
          igUsername: profileData.username,
          igName: profileData.name,
          igProfilePicUrl: profileData.profile_picture_url,
          igBio: profileData.biography,
          igFollowersCount: profileData.followers_count,
          igFollowsCount: profileData.follows_count,
          igMediaCount: profileData.media_count,
          pageId: page.id,
          pageAccessToken: encryptedToken,
          userId,
        },
      });
      connectedAccounts.push(account);
    }
  }

  return connectedAccounts;
};

export const getConnectedAccounts = async (userId: string) => {
  return prisma.instagramAccount.findMany({
    where: { userId, isActive: true },
  });
};

export const disconnectAccount = async (accountId: string, userId: string) => {
  return prisma.instagramAccount.update({
    where: { id: accountId, userId },
    data: { isActive: false },
  });
};

export const getDecryptedToken = async (accountId: string) => {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) throw new Error('Account not found');
  return decrypt(account.pageAccessToken);
};
