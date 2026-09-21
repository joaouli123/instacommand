import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  href?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
};

export const createNotification = async (input: NotificationInput) => {
  const data = {
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    href: input.href,
    dedupeKey: input.dedupeKey,
    metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
  };

  if (input.dedupeKey) {
    return prisma.notification.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: data,
    });
  }

  return prisma.notification.create({ data });
};

export const listNotifications = async (userId: string) => {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return { items, unreadCount };
};

export const markNotificationRead = async (id: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
};

export const markAllNotificationsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
};

export const notifyPublishFailure = async (userId: string, postId: string, message: string) => {
  const preferences = await prisma.userPreference.findUnique({ where: { userId } });
  if (preferences && !preferences.publishFailureAlerts) return;

  await createNotification({
    userId,
    type: 'PUBLISH_FAILURE',
    title: 'Falha na publicação',
    message: message.slice(0, 300),
    href: '/calendar',
    dedupeKey: `${userId}:publish-failure:${postId}`,
    metadata: { postId },
  });
};

export const maybeNotifyEngagement = async (params: {
  userId: string;
  accountId: string;
  accountUsername: string;
  postId: string;
  interactions: number;
}) => {
  const preferences = await prisma.userPreference.findUnique({ where: { userId: params.userId } });
  if (preferences && !preferences.engagementAlerts) return;

  const recent = await prisma.postInsight.findMany({
    where: { post: { accountId: params.accountId, id: { not: params.postId } } },
    orderBy: { collectedAt: 'desc' },
    take: 10,
    select: { likes: true, comments: true, saves: true },
  });
  if (recent.length < 3) return;

  const average = recent.reduce((total, item) => total + item.likes + item.comments + item.saves, 0) / recent.length;
  if (params.interactions < 10 || params.interactions <= average * 1.5) return;

  const dayKey = new Date().toISOString().slice(0, 10);
  await createNotification({
    userId: params.userId,
    type: 'ENGAGEMENT',
    title: 'Publicação acima da sua média',
    message: `@${params.accountUsername} registrou ${params.interactions.toLocaleString('pt-BR')} interações, acima da média recente de ${Math.round(average).toLocaleString('pt-BR')}.`,
    href: '/analytics',
    dedupeKey: `${params.userId}:engagement:${params.postId}:${dayKey}`,
    metadata: { postId: params.postId, accountId: params.accountId, interactions: params.interactions, average },
  });
};

export const createWeeklyReportNotification = async (userId: string) => {
  const preferences = await prisma.userPreference.findUnique({ where: { userId } });
  if (preferences && !preferences.weeklyReport) return;

  const now = new Date();
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(now);
  if (weekday !== 'Mon') return;

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const [posts, accounts] = await Promise.all([
    prisma.publishedPost.count({ where: { account: { userId }, publishedAt: { gte: weekStart } } }),
    prisma.instagramAccount.count({ where: { userId, isActive: true } }),
  ]);

  const weekKey = `${now.getUTCFullYear()}-${Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))}`;
  await createNotification({
    userId,
    type: 'WEEKLY_REPORT',
    title: 'Seu resumo semanal está pronto',
    message: `${posts} publicação(ões) foram registradas nos últimos 7 dias em ${accounts} conta(s) ativa(s).`,
    href: '/analytics',
    dedupeKey: `${userId}:weekly-report:${weekKey}`,
    metadata: { posts, accounts },
  });
};
