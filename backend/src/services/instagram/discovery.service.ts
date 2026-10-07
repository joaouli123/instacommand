import { PrismaClient } from '@prisma/client';
import { graphGet } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';
import { AppError, ConflictError, InstagramApiError, NotFoundError, ValidationError } from '../../utils/errors';
import { formatBreakdown, postingFrequency } from './content-ranking';

const prisma = new PrismaClient();

export const getCompetitorProfile = async (igUserId: string, competitorUsername: string, token: string) => {
  const fields = 'business_discovery.username(' + competitorUsername + '){username,website,name,ig_id,id,profile_picture_url,biography,follows_count,followers_count,media_count}';
  const response = await graphGet(`/${igUserId}`, token, { fields });
  return response.business_discovery;
};

export const getCompetitorRecentPosts = async (igUserId: string, competitorUsername: string, token: string, limit = 25) => {
  const fields = `business_discovery.username(${competitorUsername}){media.limit(${limit}){id,caption,media_url,permalink,timestamp,media_type,comments_count,like_count}}`;
  const response = await graphGet(`/${igUserId}`, token, { fields });
  return response.business_discovery?.media?.data || [];
};

/** Accepts "@user", "user", " User ", "instagram.com/user/" or a full profile URL. */
export const normalizeUsername = (value: string) => {
  let text = String(value ?? '').trim();
  const url = text.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagr(?:am\.com|\.am)\/([^/?#\s]+)/i);
  if (url) text = url[1];
  return text.replace(/\s+/g, '').replace(/^@+/, '').replace(/\/+$/, '').toLowerCase();
};

/**
 * Translate a business_discovery failure into a clear Portuguese error. Never
 * returns a 401 (the frontend signs the user out on 401).
 */
export const competitorLookupError = (error: unknown, username: string): AppError => {
  if (!(error instanceof InstagramApiError)) {
    return error instanceof AppError && error.statusCode !== 401 ? error : new AppError('Não foi possível consultar a Meta agora. Tente novamente em instantes.', 502);
  }
  const code = error.metaCode;
  const sub = error.metaSubcode;
  if (code === 190) return new AppError('A autorização da Meta expirou ou foi revogada. Reconecte a conta em Contas conectadas.', 400);
  if (code === 10 || code === 200 || (code !== undefined && code >= 200 && code < 300)) {
    return new AppError('Permissão faltando para consultar concorrentes (instagram_basic, instagram_manage_insights e pages_read_engagement). Reconecte a conta e aceite todas as permissões.', 400);
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) return new AppError('Limite de consultas da Meta atingido. Aguarde alguns minutos e tente de novo.', 429);
  if (code === 110 || sub === 2207013 || code === 100) {
    return new AppError(`Não encontramos @${username} como conta profissional. Confira o @ ou peça para o perfil ser Business/Creator: o Instagram só libera dados de contas profissionais públicas.`, 404);
  }
  return new AppError(`A Meta recusou a consulta de @${username}${code !== undefined ? ` (código ${code})` : ''}. Tente novamente mais tarde.`, 502);
};

export const calculateCompetitorMetrics = (posts: any[], followersCount: number | null | undefined) => {
  const values = (key: 'like_count' | 'comments_count') => posts
    .map((post) => post?.[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const likes = values('like_count');
  const comments = values('comments_count');
  const average = (items: number[]) => items.length ? Math.round(items.reduce((sum, value) => sum + value, 0) / items.length) : null;
  const avgLikes = average(likes);
  const avgComments = average(comments);
  const comparablePosts = posts.filter((post) =>
    typeof post?.like_count === 'number' && Number.isFinite(post.like_count) && post.like_count >= 0 &&
    typeof post?.comments_count === 'number' && Number.isFinite(post.comments_count) && post.comments_count >= 0);
  const engagementRate = typeof followersCount === 'number' && Number.isFinite(followersCount) && followersCount > 0 && comparablePosts.length
    ? (comparablePosts.reduce((sum, post) => sum + post.like_count + post.comments_count, 0) / comparablePosts.length / followersCount) * 100
    : null;
  return {
    avgLikes,
    avgComments,
    engagementRate,
    metricCoverage: {
      posts: posts.length,
      likes: likes.length,
      comments: comments.length,
      engagement: comparablePosts.length,
    },
  };
};

export const normalizeCompetitorInsight = (insight: any) => {
  const posts = Array.isArray(insight?.recentPostsData) ? insight.recentPostsData : [];
  // Recompute from source observations so legacy default zeros are never
  // presented as verified data when the raw API response omitted counters.
  const metrics = calculateCompetitorMetrics(posts, insight?.followers);
  return { ...insight, ...metrics, postsPerWeek: postingFrequency(posts), formats: formatBreakdown(posts) };
};

export const addCompetitor = async (accountId: string, userId: string, igUsername: string) => {
  const username = normalizeUsername(igUsername);
  const account = await prisma.instagramAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) throw new NotFoundError('Conta não encontrada.');

  if (!/^[a-z0-9._]{1,30}$/.test(username)) {
    throw new ValidationError('Informe um @username válido do Instagram (letras, números, ponto e _; até 30 caracteres).');
  }

  const token = await getDecryptedToken(accountId);
  let profile: any;
  try { profile = await getCompetitorProfile(account.igUserId, username, token); }
  catch (error) { throw competitorLookupError(error, username); }

  if (!profile) throw new NotFoundError('Perfil não encontrado. Ele precisa ser uma conta profissional (Business ou Creator) pública.');

  const existing = await prisma.competitor.findUnique({
    where: { accountId_igUsername: { accountId, igUsername: profile.username } },
  });
  if (existing) throw new ConflictError('Este concorrente já está sendo monitorado.');
  if (profile.id && profile.id === account.igUserId) throw new ValidationError('Este é o seu próprio perfil. Adicione um concorrente.');

  const created = await prisma.competitor.create({
    data: {
      accountId,
      igUsername: profile.username,
      igName: profile.name,
      igProfilePicUrl: profile.profile_picture_url,
      igBio: profile.biography,
      igFollowersCount: profile.followers_count,
      igMediaCount: profile.media_count,
    },
  });
  // Collect the first snapshot right away so the card is not empty until the
  // daily job runs. A failure here must not undo the add.
  try { await collectCompetitorData(created.id, userId); } catch (error) {
    console.warn('Initial competitor collection failed:', error instanceof Error ? error.message : error);
  }
  return created;
};

export const removeCompetitor = async (competitorId: string, userId: string) => {
  const competitor = await prisma.competitor.findFirst({
    where: { id: competitorId, account: { userId } },
    select: { id: true },
  });
  if (!competitor) throw new NotFoundError('Concorrente não encontrado.');
  return prisma.competitor.delete({ where: { id: competitor.id } });
};

export const collectCompetitorData = async (competitorId: string, userId: string) => {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: { account: true },
  });
  if (!competitor || competitor.account.userId !== userId || !competitor.account.isActive) throw new NotFoundError('Concorrente não encontrado.');

  const token = await getDecryptedToken(competitor.account.id);
  let profile: any;
  try { profile = await getCompetitorProfile(competitor.account.igUserId, competitor.igUsername, token); }
  catch (error) { throw competitorLookupError(error, competitor.igUsername); }
  if (!profile) throw new NotFoundError('A Meta não retornou este perfil. Ele pode ter virado conta pessoal, privada ou mudado de @.');
  let recentPosts: any[];
  try { recentPosts = await getCompetitorRecentPosts(competitor.account.igUserId, competitor.igUsername, token); }
  catch (error) { throw competitorLookupError(error, competitor.igUsername); }

  const metrics = calculateCompetitorMetrics(recentPosts, profile.followers_count);

  await prisma.competitor.update({
    where: { id: competitorId },
    data: {
      igFollowersCount: profile.followers_count,
      igMediaCount: profile.media_count,
      igName: profile.name ?? competitor.igName,
      igProfilePicUrl: profile.profile_picture_url ?? competitor.igProfilePicUrl,
      igBio: profile.biography ?? competitor.igBio,
    },
  });

  await prisma.competitorInsight.create({
    data: {
      competitorId,
      followers: profile.followers_count,
      mediaCount: profile.media_count,
      avgLikes: metrics.avgLikes,
      avgComments: metrics.avgComments,
      engagementRate: metrics.engagementRate,
      recentPostsData: recentPosts,
    },
  });
};
