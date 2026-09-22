import { env } from '../../config/env';
import { graphGet, graphGetAll } from '../../utils/instagram-api';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { AppError } from '../../utils/errors';

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

  // In SaaS mode the platform-owned app must be used consistently for every
  // workspace. Never combine an app ID from one source with another app's secret.
  const platformCredentialsConfigured = Boolean(env.FB_APP_ID || env.FB_APP_SECRET);
  return platformCredentialsConfigured
    ? { appId: env.FB_APP_ID || '', appSecret: env.FB_APP_SECRET || '', clientToken: '' }
    : {
        appId: user?.metaAppId || '',
        appSecret: user?.metaAppSecret ? decrypt(user.metaAppSecret) : '',
        clientToken: user?.metaClientToken ? decrypt(user.metaClientToken) : '',
      };
};

export type AiCredentials = {
  apiKey: string;
  model: string;
  source: 'workspace' | 'server' | 'openai-compatible' | 'none';
};

export const getAiCredentials = async (userId?: string): Promise<AiCredentials> => {
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { geminiApiKey: true, geminiModel: true },
      })
    : null;
  const workspaceKey = user?.geminiApiKey ? decrypt(user.geminiApiKey) : '';
  const serverKey = env.GEMINI_API_KEY || '';
  return {
    apiKey: workspaceKey || serverKey,
    model: user?.geminiModel?.trim() || env.GEMINI_MODEL,
    source: workspaceKey ? 'workspace' : serverKey ? 'server' : env.AI_API_KEY ? 'openai-compatible' : 'none',
  };
};

export const getAiCredentialStatus = async (userId: string) => {
  const credentials = await getAiCredentials(userId);
  return {
    apiKeyConfigured: Boolean(credentials.apiKey),
    model: credentials.model,
    source: credentials.source,
  };
};

export const saveAiCredentials = async (userId: string, values: { apiKey?: string; model?: string }) => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { geminiApiKey: true, geminiModel: true },
  });
  const model = values.model?.trim() || current?.geminiModel || env.GEMINI_MODEL;
  await prisma.user.update({
    where: { id: userId },
    data: {
      geminiModel: model,
      ...(values.apiKey?.trim()
        ? { geminiApiKey: encrypt(values.apiKey.trim()) }
        : current?.geminiApiKey
          ? {}
          : { geminiApiKey: null }),
    },
  });
  return getAiCredentialStatus(userId);
};

const getThreadsCredentials = async (userId?: string): Promise<MetaCredentials> => {
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { threadsAppId: true, threadsAppSecret: true },
      })
    : null;
  // Threads can be a distinct Meta app (as it is in this deployment). Never
  // silently send users to the Facebook app or mix credential sources.
  const platformCredentialsConfigured = Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);
  return platformCredentialsConfigured
    ? {
        appId: process.env.THREADS_APP_ID || '',
        appSecret: process.env.THREADS_APP_SECRET || '',
        clientToken: '',
      }
    : {
        appId: user?.threadsAppId || '',
        appSecret: user?.threadsAppSecret ? decrypt(user.threadsAppSecret) : '',
        clientToken: '',
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

export const getThreadsCredentialStatus = async (userId: string) => {
  const credentials = await getThreadsCredentials(userId);
  const platformConfigured = Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);
  const platformPartiallyConfigured = Boolean(process.env.THREADS_APP_ID) !== Boolean(process.env.THREADS_APP_SECRET);
  return {
    appId: credentials.appId,
    appIdConfigured: Boolean(credentials.appId),
    appSecretConfigured: Boolean(credentials.appSecret),
    platformConfigured,
    platformPartiallyConfigured,
    credentialSource: platformConfigured ? 'platform' : credentials.appId && credentials.appSecret ? 'workspace' : 'missing',
  };
};

export const saveThreadsCredentials = async (userId: string, values: { appId: string; appSecret?: string }) => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { threadsAppSecret: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      threadsAppId: values.appId.trim(),
      ...(values.appSecret?.trim()
        ? { threadsAppSecret: encrypt(values.appSecret.trim()) }
        : current?.threadsAppSecret
          ? {}
          : { threadsAppSecret: null }),
    },
  });

  return getThreadsCredentialStatus(userId);
};

export const getOAuthUrl = async (userId: string, state?: string) => {
  const credentials = await getMetaCredentials(userId);
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error('Meta App não configurado. Defina META_APP_ID e META_APP_SECRET no ambiente.');
  }

  const params = new URLSearchParams({
    client_id: credentials.appId,
    redirect_uri: env.FB_REDIRECT_URI,
    response_type: 'code',
    ...(env.FB_LOGIN_CONFIG_ID
      ? {
          // Login for Business configurations own the permissions and asset
          // selection. Sending scope alongside config_id can make Meta render
          // an empty dialog or reject the request before the callback.
          config_id: env.FB_LOGIN_CONFIG_ID,
          override_default_response_type: 'true',
        }
      : { scope: env.FB_OAUTH_SCOPES }),
    ...(state ? { state } : {}),
  });

  return `https://${env.FB_OAUTH_HOST}/${env.META_GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
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

  // Meta paginates this endpoint. Follow every page so a customer can connect
  // all eligible Instagram profiles in one authorization flow.
  const pages = await graphGetAll<{ id: string; name: string; access_token?: string }>(
    '/me/accounts',
    userToken,
    { fields: 'id,name,access_token', limit: 100 },
    20,
  );

  const connectedAccounts: any[] = [];
  let ownershipConflicts = 0;

  // Business Login can return the Instagram asset directly from the
  // selected Business Portfolio without exposing the Page -> Instagram edge
  // through /me/accounts. Discover both shapes so the account is not lost
  // after Meta confirms the connection.
  const businessInstagramAccounts: Array<{
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    biography?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  }> = [];

  try {
    const businesses = await graphGetAll<{ id: string; name?: string }>(
      '/me/businesses',
      userToken,
      { fields: 'id,name', limit: 100 },
      20,
    );

    const businessIds = new Set(businesses.map((business) => business.id));
    const granularInstagramIds = new Set<string>();

    // Login for Business can scope the selected portfolio in the token's
    // granular permissions without returning it from /me/businesses. The
    // app token is used only to inspect the user token; it is never stored.
    try {
      const appAccessToken = `${credentials.appId}|${credentials.appSecret}`;
      const debugToken = await graphGet('/debug_token', appAccessToken, {
        input_token: userToken,
      });
      for (const scope of debugToken.data?.granular_scopes || []) {
        const targetIds = (scope.target_ids || []).map((targetId: unknown) => String(targetId));
        if (scope.scope === 'business_management') {
          targetIds.forEach((targetId: string) => businessIds.add(targetId));
        }
        if (['instagram_basic', 'instagram_content_publish'].includes(scope.scope)) {
          targetIds.forEach((targetId: string) => granularInstagramIds.add(targetId));
        }
      }
    } catch (error) {
      console.warn('Meta token scope discovery skipped:', error instanceof Error ? error.message : 'unknown error');
    }

    console.info('Meta granular asset targets:', {
      businessIds: [...businessIds],
      instagramIds: [...granularInstagramIds],
    });

    for (const instagramId of granularInstagramIds) {
      try {
        const profile = await graphGet(`/${instagramId}`, userToken, {
          fields: 'id,username,name,profile_picture_url,biography,followers_count,follows_count,media_count',
        });
        businessInstagramAccounts.push(profile);
      } catch (error) {
        console.warn('Meta granular Instagram discovery skipped:', {
          instagramId,
          message: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }

    for (const businessId of businessIds) {
      try {
        const ownedInstagramAccounts = await graphGetAll<typeof businessInstagramAccounts[number]>(
          `/${businessId}/owned_instagram_accounts`,
          userToken,
          {
            fields: 'id,username,name,profile_picture_url,biography,followers_count,follows_count,media_count',
            limit: 100,
          },
          20,
        );
        businessInstagramAccounts.push(...ownedInstagramAccounts);
      } catch (error) {
        // Some portfolios do not grant this edge. The Page-based discovery
        // above remains valid and should continue for the other portfolios.
        console.warn('Meta portfolio Instagram discovery skipped:', {
          businessId,
          message: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }
  } catch (error) {
    console.warn('Meta portfolio discovery skipped:', error instanceof Error ? error.message : 'unknown error');
  }

  console.info('Meta OAuth assets discovered:', {
    pages: pages.length,
    portfolioInstagramAccounts: businessInstagramAccounts.length,
  });

  const saveInstagramAccount = async (
    igId: string,
    profileData: any,
    page: { id: string; name?: string } | null,
    accessToken: string,
  ) => {
    const encryptedToken = encrypt(accessToken);

    const existingAccount = await prisma.instagramAccount.findUnique({
      where: { igUserId: igId },
      select: { userId: true, isActive: true, selectionPending: true },
    });
    if (existingAccount && existingAccount.userId !== userId) {
      // One account owned by another customer must not block the rest of
      // the accounts returned by the same Meta authorization.
      ownershipConflicts += 1;
      return;
    }

    const selectionPending = existingAccount ? existingAccount.selectionPending || !existingAccount.isActive : true;

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
        pageId: page?.id || '',
        pageName: page?.name || null,
        pageAccessToken: encryptedToken,
        isActive: existingAccount?.isActive ?? false,
        selectionPending,
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
        pageId: page?.id || '',
        pageName: page?.name || null,
        pageAccessToken: encryptedToken,
        userId,
        isActive: false,
        selectionPending: true,
      },
    });
    connectedAccounts.push(account);
  };

  for (const page of pages) {
    const pageToken = page.access_token || userToken;
    
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

      await saveInstagramAccount(igId, profileData, page, pageToken);
    }
  }

  const connectedInstagramIds = new Set(connectedAccounts.map((account: any) => account.igUserId));
  for (const portfolioAccount of businessInstagramAccounts) {
    if (connectedInstagramIds.has(portfolioAccount.id)) continue;

    const profileData = portfolioAccount.username
      ? portfolioAccount
      : await graphGet(`/${portfolioAccount.id}`, userToken, {
          fields: 'username,name,profile_picture_url,biography,followers_count,follows_count,media_count',
        });

    // Portfolio access proves access to the Instagram asset, not a Facebook
    // Page relationship. Preserve discovery without guessing a publishing
    // destination. Empty pageId is the existing schema's unlinked state.
    await saveInstagramAccount(portfolioAccount.id, profileData, null, userToken);
    connectedInstagramIds.add(portfolioAccount.id);
  }

  if (!connectedAccounts.length && ownershipConflicts > 0) {
    // Never transfer an existing customer's data implicitly during OAuth.
    // Distinguish an ownership conflict from a missing professional profile.
    throw new Error('META_ACCOUNT_WORKSPACE_CONFLICT');
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

export const getPendingConnectedAccounts = async (userId: string) => {
  return prisma.instagramAccount.findMany({
    where: { userId, selectionPending: true },
    orderBy: { connectedAt: 'asc' },
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
    },
  });
};

export const selectConnectedAccounts = async (userId: string, accountIds: string[]) => {
  const pending = await prisma.instagramAccount.findMany({
    where: { userId, selectionPending: true },
    select: { id: true },
  });
  const pendingIds = new Set(pending.map((account) => account.id));
  const selectedIds = [...new Set(accountIds)].filter((id) => pendingIds.has(id));

  await prisma.$transaction([
    prisma.instagramAccount.updateMany({
      where: { userId, selectionPending: true, id: { in: selectedIds } },
      data: { isActive: true, selectionPending: false },
    }),
    prisma.instagramAccount.updateMany({
      where: { userId, selectionPending: true, id: { notIn: selectedIds } },
      data: { isActive: false, selectionPending: false },
    }),
  ]);

  return getConnectedAccounts(userId);
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

export const getThreadsOAuthUrl = async (userId: string, state?: string) => {
  const credentials = await getThreadsCredentials(userId);
  if (!credentials.appId || !credentials.appSecret) {
    throw new AppError('THREADS_OAUTH_NOT_CONFIGURED', 503);
  }

  const params = new URLSearchParams({
    client_id: credentials.appId,
    redirect_uri: env.THREADS_REDIRECT_URI,
    scope: 'threads_basic,threads_content_publish',
    response_type: 'code',
    ...(state ? { state } : {}),
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

  const existingAccount = await prisma.threadsAccount.findUnique({
    where: { threadsUserId: profile.id },
    select: { userId: true },
  });
  if (existingAccount && existingAccount.userId !== userId) {
    throw new Error('Esta conta do Threads já está conectada a outro usuário.');
  }

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
