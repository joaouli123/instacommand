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

type MetaCredentials = {
  appId: string;
  appSecret: string;
  clientToken: string;
};

const getMetaCredentials = async (userId?: string): Promise<MetaCredentials> => {
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { metaAppId: true, metaAppSecret: true, metaClientToken: true },
      })
    : null;

  return {
    appId: user?.metaAppId || env.FB_APP_ID,
    appSecret: user?.metaAppSecret ? decrypt(user.metaAppSecret) : env.FB_APP_SECRET,
    clientToken: user?.metaClientToken ? decrypt(user.metaClientToken) : '',
  };
};

const getThreadsCredentials = async (userId?: string): Promise<MetaCredentials> => {
  // Threads apps can use the same Meta app credentials when the Threads use
  // case is enabled. The optional dedicated environment variables allow a
  // separate Threads app without changing the settings screen contract.
  const credentials = await getMetaCredentials(userId);
  return {
    appId: process.env.THREADS_APP_ID || credentials.appId,
    appSecret: process.env.THREADS_APP_SECRET || credentials.appSecret,
    clientToken: credentials.clientToken,
  };
};

const threadsApiRequest = async (path: string, options: RequestInit = {}) => {
  const response = await fetch(`https://graph.threads.net${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Threads API request failed with status ${response.status}`);
  }
  return data;
};

export const getMetaCredentialStatus = async (userId: string) => {
  const credentials = await getMetaCredentials(userId);
  return {
    appId: credentials.appId,
    appIdConfigured: Boolean(credentials.appId),
    appSecretConfigured: Boolean(credentials.appSecret),
    clientTokenConfigured: Boolean(credentials.clientToken),
  };
};

export const saveMetaCredentials = async (userId: string, values: { appId: string; appSecret?: string; clientToken?: string }) => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { metaAppSecret: true, metaClientToken: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      metaAppId: values.appId.trim(),
      ...(values.appSecret?.trim()
        ? { metaAppSecret: encrypt(values.appSecret.trim()) }
        : current?.metaAppSecret
          ? {}
          : { metaAppSecret: null }),
      ...(values.clientToken?.trim()
        ? { metaClientToken: encrypt(values.clientToken.trim()) }
        : current?.metaClientToken
          ? {}
          : { metaClientToken: null }),
    },
  });

  return getMetaCredentialStatus(userId);
};

export const getOAuthUrl = async (userId?: string) => {
  const credentials = await getMetaCredentials(userId);
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error('Meta App não configurado. Defina META_APP_ID e META_APP_SECRET no ambiente.');
  }

  const scopes = [
    'business_management',
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ].join(',');

  const params = new URLSearchParams({
    client_id: credentials.appId,
    redirect_uri: env.FB_REDIRECT_URI,
    scope: scopes,
    response_type: 'code',
  });

  if (env.FB_LOGIN_CONFIG_ID) {
    params.set('config_id', env.FB_LOGIN_CONFIG_ID);
  }

  return `https://www.facebook.com/${env.META_GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
};

export const handleOAuthCallback = async (code: string, userId: string) => {
  const credentials = await getMetaCredentials(userId);

  // Exchange code for short-lived token
  const tokenParams = new URLSearchParams({
    client_id: credentials.appId,
    redirect_uri: env.FB_REDIRECT_URI,
    client_secret: credentials.appSecret,
    code,
  });
  const tokenUrl = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token?${tokenParams.toString()}`;
  const tokenResponse = await fetch(tokenUrl).then((res) => res.json());

  if (tokenResponse.error) {
    throw new Error(tokenResponse.error.message);
  }

  // Get long-lived token
  const longLivedParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: credentials.appId,
    client_secret: credentials.appSecret,
    fb_exchange_token: tokenResponse.access_token,
  });
  const longLivedUrl = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token?${longLivedParams.toString()}`;
  const longLivedResponse = await fetch(longLivedUrl).then((res) => res.json());
  const userToken = longLivedResponse.access_token || tokenResponse.access_token;

  // Get user's pages
  const pagesData = await graphGet('/me/accounts', userToken, { fields: 'id,name,access_token' });

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
          pageName: page.name,
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
          pageName: page.name,
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
    select: {
      id: true,
      igUserId: true,
      igUsername: true,
      igName: true,
      igProfilePicUrl: true,
      igBio: true,
      igFollowersCount: true,
      igFollowsCount: true,
      igMediaCount: true,
      pageId: true,
      pageName: true,
      isActive: true,
      connectedAt: true,
      lastSyncAt: true,
    },
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

export const getThreadsOAuthUrl = async (userId: string) => {
  const credentials = await getThreadsCredentials(userId);
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error('Configure as credenciais da Meta antes de conectar o Threads.');
  }

  const params = new URLSearchParams({
    client_id: credentials.appId,
    redirect_uri: env.THREADS_REDIRECT_URI,
    scope: 'threads_basic,threads_content_publish',
    response_type: 'code',
  });

  return `https://threads.net/oauth/authorize?${params.toString()}`;
};

export const handleThreadsOAuthCallback = async (code: string, userId: string) => {
  const credentials = await getThreadsCredentials(userId);
  const redirectUri = env.THREADS_REDIRECT_URI;

  const shortToken = await threadsApiRequest('/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.appId,
      client_secret: credentials.appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  let accessToken = shortToken.access_token as string;
  let expiresIn: number | undefined;

  try {
    const longToken = await threadsApiRequest(`/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(credentials.appSecret)}&access_token=${encodeURIComponent(accessToken)}`);
    accessToken = longToken.access_token || accessToken;
    expiresIn = Number(longToken.expires_in) || undefined;
  } catch {
    // A short-lived token is still useful for development/test apps.
  }

  const profile = await threadsApiRequest(`/me?fields=id,username,name,threads_profile_picture_url&access_token=${encodeURIComponent(accessToken)}`);
  const encryptedToken = encrypt(accessToken);
  const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  return prisma.threadsAccount.upsert({
    where: { threadsUserId: profile.id },
    update: {
      username: profile.username,
      name: profile.name,
      profilePicUrl: profile.threads_profile_picture_url,
      accessToken: encryptedToken,
      tokenExpiresAt,
      isActive: true,
      lastSyncAt: new Date(),
      userId,
    },
    create: {
      userId,
      threadsUserId: profile.id,
      username: profile.username,
      name: profile.name,
      profilePicUrl: profile.threads_profile_picture_url,
      accessToken: encryptedToken,
      tokenExpiresAt,
      isActive: true,
      lastSyncAt: new Date(),
    },
  });
};

export const getConnectedThreadsAccounts = async (userId: string) => {
  return prisma.threadsAccount.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      threadsUserId: true,
      username: true,
      name: true,
      profilePicUrl: true,
      isActive: true,
      connectedAt: true,
      lastSyncAt: true,
    },
  });
};

export const getDecryptedThreadsToken = async (accountId: string) => {
  const account = await prisma.threadsAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error('Conta do Threads não encontrada');
  return decrypt(account.accessToken);
};

export const disconnectThreadsAccount = async (accountId: string, userId: string) => {
  return prisma.threadsAccount.updateMany({
    where: { id: accountId, userId },
    data: { isActive: false },
  });
};
