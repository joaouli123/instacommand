import { AutomationTemplateType, PrismaClient, SocialAutomationTrigger } from '@prisma/client';
import { env } from '../config/env';
import { generateAiContent } from './ai.service';
import { getAiCredentials, getDecryptedToken, getInstagramGrantedPermissions } from './instagram/auth.service';
import { verifyFacebookPageLink } from './instagram/facebook-link.service';
import { graphPost } from '../utils/instagram-api';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { hasKeywordMatch, matchesEvent } from './automation-logic';

const prisma = new PrismaClient();
const permissionCache = new Map<string, { expiresAt: number; grantedPermissions: string[]; permissionCheckError: string | null }>();

export type InstagramAutomationEvent = {
  accountIgId: string;
  eventKey: string;
  type: SocialAutomationTrigger;
  senderId?: string;
  senderUsername?: string;
  text?: string;
  mediaId?: string;
  commentId?: string;
  sourceMessageId?: string;
  timestamp?: number;
};

const COMMENT_PERMISSION_NAMES = ['instagram_manage_comments', 'instagram_business_manage_comments'];
const MESSAGE_PERMISSION_NAMES = ['instagram_manage_messages', 'instagram_business_manage_messages'];

export const getAutomationStatus = async (userId: string, accountId: string, refreshPermissions = false) => {
  const account = await prisma.instagramAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) throw new NotFoundError('Conta do Instagram não encontrada.');
  let permissionResult = permissionCache.get(accountId);
  if (refreshPermissions || !permissionResult || permissionResult.expiresAt < Date.now()) {
    let grantedPermissions: string[] = [];
    let permissionCheckError: string | null = null;
    try { grantedPermissions = await getInstagramGrantedPermissions(accountId); }
    catch (error) { permissionCheckError = error instanceof Error ? error.message : 'Não foi possível conferir as permissões.'; }
    permissionResult = { grantedPermissions, permissionCheckError, expiresAt: Date.now() + 60_000 };
    permissionCache.set(accountId, permissionResult);
  }
  const { grantedPermissions, permissionCheckError } = permissionResult;
  const configured = Boolean(env.WEBHOOK_VERIFY_TOKEN && env.FB_APP_SECRET);
  return {
    webhookConfigured: configured,
    callbackUrl: `${env.BACKEND_URL.replace(/\/$/, '')}/api/webhooks/instagram`,
    grantedPermissions,
    permissionCheckError,
    canAutomateComments: COMMENT_PERMISSION_NAMES.some((scope) => grantedPermissions.includes(scope)),
    canAutomateMessages: MESSAGE_PERMISSION_NAMES.some((scope) => grantedPermissions.includes(scope)),
  };
};

const assertOwnedAccount = async (userId: string, accountId: string) => {
  const account = await prisma.instagramAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) throw new NotFoundError('Conta do Instagram não encontrada.');
  return account;
};

export const getAutomationWorkspace = async (userId: string, accountId: string) => {
  await assertOwnedAccount(userId, accountId);
  const [automations, templates, agent, executions, status] = await Promise.all([
    prisma.socialAutomation.findMany({ where: { userId, accountId }, orderBy: { createdAt: 'desc' } }),
    prisma.automationTemplate.findMany({ where: { userId, accountId }, orderBy: { updatedAt: 'desc' } }),
    prisma.instagramAgentSettings.findUnique({ where: { accountId } }),
    prisma.automationExecution.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    getAutomationStatus(userId, accountId),
  ]);
  return { automations, templates, agent, executions, status };
};

export const createAutomation = async (userId: string, data: {
  accountId: string; name: string; trigger: SocialAutomationTrigger; keywords: string[];
  replyMode: 'TEMPLATE' | 'AI'; publicCommentReply?: string; privateCommentReply?: string; directMessageReply?: string;
}) => {
  await assertOwnedAccount(userId, data.accountId);
  if (data.trigger.endsWith('_KEYWORD') && !data.keywords.length) throw new ValidationError('Adicione ao menos uma palavra-chave para este gatilho.');
  return prisma.socialAutomation.create({ data: { ...data, userId } });
};

export const updateAutomation = async (userId: string, id: string, data: {
  accountId: string; name: string; trigger: SocialAutomationTrigger; keywords: string[]; replyMode: 'TEMPLATE' | 'AI';
  publicCommentReply?: string; privateCommentReply?: string; directMessageReply?: string; enabled: boolean;
}) => {
  await assertOwnedAccount(userId, data.accountId);
  const current = await prisma.socialAutomation.findFirst({ where: { id, userId, accountId: data.accountId } });
  if (!current) throw new NotFoundError('Automação não encontrada.');
  if (data.trigger.endsWith('_KEYWORD') && !data.keywords.length) throw new ValidationError('Adicione ao menos uma palavra-chave para este gatilho.');
  return prisma.socialAutomation.update({ where: { id }, data: {
    name: data.name, trigger: data.trigger, keywords: data.keywords, replyMode: data.replyMode,
    publicCommentReply: data.publicCommentReply || null, privateCommentReply: data.privateCommentReply || null,
    directMessageReply: data.directMessageReply || null, enabled: data.enabled,
  } });
};

export const deleteAutomation = async (userId: string, accountId: string, id: string) => {
  const current = await prisma.socialAutomation.findFirst({ where: { id, userId, accountId } });
  if (!current) throw new NotFoundError('Automação não encontrada.');
  await prisma.socialAutomation.delete({ where: { id } });
};

export const saveAutomationTemplate = async (userId: string, data: { accountId: string; name: string; type: AutomationTemplateType; content: string }) => {
  await assertOwnedAccount(userId, data.accountId);
  return prisma.automationTemplate.create({ data: { ...data, userId } });
};

export const deleteAutomationTemplate = async (userId: string, accountId: string, id: string) => {
  const current = await prisma.automationTemplate.findFirst({ where: { id, userId, accountId } });
  if (!current) throw new NotFoundError('Modelo não encontrado.');
  await prisma.automationTemplate.delete({ where: { id } });
};

export const saveAgentSettings = async (userId: string, data: {
  accountId: string; enabled: boolean; autoSend: boolean; tone: string; instructions: string; knowledgeBase: string; fallback: string;
}) => {
  await assertOwnedAccount(userId, data.accountId);
  if (data.autoSend && !data.enabled) throw new ValidationError('Ative o agente antes de habilitar o envio automático.');
  return prisma.instagramAgentSettings.upsert({ where: { accountId: data.accountId }, create: { ...data, userId }, update: {
    enabled: data.enabled, autoSend: data.autoSend, tone: data.tone, instructions: data.instructions,
    knowledgeBase: data.knowledgeBase, fallback: data.fallback,
  } });
};

const sendPublicCommentReply = async (accountId: string, commentId: string, text: string) => {
  const token = await getDecryptedToken(accountId);
  return graphPost(`/${commentId}/replies`, token, { message: text });
};

const sendPrivateCommentReply = async (accountId: string, igUserId: string, commentId: string, text: string) => {
  // Claim before sending: Meta only permits one private reply per comment.
  await prisma.privateReplyClaim.create({ data: { accountId, commentId, status: 'SENDING' } });
  try {
    const token = await getDecryptedToken(accountId);
    await graphPost(`/${igUserId}/messages`, token, { recipient: { comment_id: commentId }, message: { text } });
    await prisma.privateReplyClaim.update({ where: { accountId_commentId: { accountId, commentId } }, data: { status: 'SENT' } });
  } catch (error) {
    await prisma.privateReplyClaim.update({ where: { accountId_commentId: { accountId, commentId } }, data: { status: 'FAILED' } }).catch(() => undefined);
    throw error;
  }
};

const sendDirectMessage = async (accountId: string, igUserId: string, senderId: string, text: string) => {
  const token = await getDecryptedToken(accountId);
  return graphPost(`/${igUserId}/messages`, token, { recipient: { id: senderId }, message: { text }, messaging_type: 'RESPONSE' });
};

export const processInstagramAutomationEvent = async (event: InstagramAutomationEvent) => {
  const account = await prisma.instagramAccount.findUnique({ where: { igUserId: event.accountIgId } });
  if (!account || !account.isActive) return;

  let execution;
  try {
    execution = await prisma.automationExecution.create({ data: {
      accountId: account.id, eventKey: event.eventKey, eventType: event.type, senderId: event.senderId,
      senderUsername: event.senderUsername, eventText: event.text?.slice(0, 2000), mediaId: event.mediaId,
      commentId: event.commentId, sourceMessageId: event.sourceMessageId,
      eventAt: event.timestamp ? new Date(event.timestamp) : new Date(),
    } });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return; // Meta retries webhooks; eventKey makes delivery idempotent.
    throw error;
  }

  const [rules, agent] = await Promise.all([
    prisma.socialAutomation.findMany({ where: { accountId: account.id, enabled: true }, orderBy: { createdAt: 'asc' } }),
    prisma.instagramAgentSettings.findUnique({ where: { accountId: account.id } }),
  ]);
  const rule = rules
    .filter((candidate) => matchesEvent(candidate.trigger, event.type) && hasKeywordMatch(candidate, event.text || ''))
    .sort((left, right) => Number(right.trigger.endsWith('_KEYWORD')) - Number(left.trigger.endsWith('_KEYWORD')))[0];
  if (!rule) {
    await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', error: 'Nenhuma regra ativa correspondeu ao evento.' } });
    return;
  }

  await prisma.automationExecution.update({ where: { id: execution.id }, data: { automationId: rule.id, status: 'PROCESSING' } });
  const isComment = event.type.startsWith('COMMENT_');
  if (!isComment && event.timestamp && Date.now() - event.timestamp > 24 * 60 * 60 * 1000) {
    await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'BLOCKED', error: 'A janela permitida pela Meta para responder a esta mensagem expirou.' } });
    return;
  }
  const neededPermission = isComment ? COMMENT_PERMISSION_NAMES : MESSAGE_PERMISSION_NAMES;
  let granted: string[];
  try { granted = await getInstagramGrantedPermissions(account.id); }
  catch (error) {
    await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'BLOCKED', error: `Não foi possível validar a permissão Meta: ${String(error).slice(0, 800)}` } });
    return;
  }
  if (!neededPermission.some((scope) => granted.includes(scope))) {
    await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'BLOCKED', error: `A Meta ainda não concedeu a permissão necessária (${neededPermission.join(' ou ')}).` } });
    return;
  }

  let response = isComment
    ? rule.publicCommentReply?.trim() || rule.privateCommentReply?.trim() || ''
    : rule.directMessageReply?.trim() || '';
  if (rule.replyMode === 'AI') {
    if (!agent?.enabled) {
      await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'BLOCKED', error: 'Configure e ative o agente de IA antes de usar esta regra.' } });
      return;
    }
    try {
      const generated = await generateAiContent({ mode: 'automation-reply', comment: event.text || '', context: {
        username: event.senderUsername || '', tone: agent.tone, instructions: agent.instructions,
        knowledgeBase: agent.knowledgeBase, automation: 'Responder apenas a conversa iniciada pela pessoa; sem assumir compromissos.',
      } }, await getAiCredentials(account.userId)) as { response: string; shouldEscalate: boolean; reason: string };
      response = generated.response;
      if (generated.shouldEscalate || !agent.autoSend) {
        await prisma.automationExecution.update({ where: { id: execution.id }, data: {
          status: 'NEEDS_REVIEW', responseText: generated.shouldEscalate ? agent.fallback : response,
          error: generated.shouldEscalate ? `Revisão humana recomendada: ${generated.reason}` : 'Resposta gerada. Confirme antes de enviar (envio automático desativado).',
        } });
        return;
      }
    } catch (error) {
      await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'NEEDS_REVIEW', responseText: agent.fallback, error: `A IA não gerou uma resposta segura; revise manualmente. ${String(error).slice(0, 500)}` } });
      return;
    }
  }

  if (!response) {
    await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', error: 'A regra não tem uma resposta configurada para este tipo de evento.' } });
    return;
  }

  let publicReplySent = false;
  let privateReplySent = false;
  try {
    const publicCommentText = rule.replyMode === 'AI' ? response : rule.publicCommentReply?.trim() || '';
    if (isComment && event.commentId && publicCommentText) {
      await sendPublicCommentReply(account.id, event.commentId, publicCommentText);
      publicReplySent = true;
    }
    if (isComment && event.commentId && rule.replyMode === 'TEMPLATE' && rule.privateCommentReply?.trim()) {
      // Do not attempt a private reply unless its distinct messaging permission is granted.
      const messageScopes = await getInstagramGrantedPermissions(account.id);
      if (!MESSAGE_PERMISSION_NAMES.some((scope) => messageScopes.includes(scope))) throw new Error('A Meta não concedeu permissão para enviar resposta privada ao comentário.');
      await sendPrivateCommentReply(account.id, account.igUserId, event.commentId, rule.privateCommentReply.trim());
      privateReplySent = true;
    }
    if (!isComment && event.senderId) {
      await sendDirectMessage(account.id, account.igUserId, event.senderId, response);
      privateReplySent = true;
    }
    await prisma.automationExecution.update({ where: { id: execution.id }, data: {
      status: publicReplySent || privateReplySent ? 'SENT' : 'SKIPPED', responseText: response,
      publicReplySent, privateReplySent,
    } });
  } catch (error) {
    await prisma.automationExecution.update({ where: { id: execution.id }, data: {
      status: 'FAILED', responseText: response, publicReplySent, privateReplySent, error: String(error).slice(0, 1000),
    } });
  }
};

export const sendReviewedAutomationReply = async (userId: string, accountId: string, executionId: string, message: string) => {
  const execution = await prisma.automationExecution.findFirst({
    where: { id: executionId, accountId, account: { userId, isActive: true } }, include: { account: true },
  });
  if (!execution) throw new NotFoundError('Evento de automação não encontrado.');
  if (execution.status !== 'NEEDS_REVIEW') throw new ValidationError('Este evento não está aguardando revisão.');
  const text = message.trim();
  if (!text || text.length > 1000) throw new ValidationError('A resposta deve ter entre 1 e 1.000 caracteres.');
  const isComment = execution.eventType.startsWith('COMMENT_');
  if (isComment) {
    if (!execution.commentId) throw new ValidationError('Não foi possível identificar o comentário para responder.');
    const permissions = await getInstagramGrantedPermissions(accountId);
    if (!COMMENT_PERMISSION_NAMES.some((scope) => permissions.includes(scope))) throw new ValidationError('A Meta ainda não concedeu permissão para responder comentários.');
  } else {
    if (!execution.senderId) throw new ValidationError('Não foi possível identificar quem enviou a mensagem.');
    if (Date.now() - execution.eventAt.getTime() > 24 * 60 * 60 * 1000) throw new ValidationError('A janela de resposta da Meta para esta mensagem expirou.');
    const permissions = await getInstagramGrantedPermissions(accountId);
    if (!MESSAGE_PERMISSION_NAMES.some((scope) => permissions.includes(scope))) throw new ValidationError('A Meta ainda não concedeu permissão para responder mensagens.');
  }

  const claim = await prisma.automationExecution.updateMany({ where: { id: executionId, accountId, status: 'NEEDS_REVIEW' }, data: { status: 'PROCESSING' } });
  if (claim.count !== 1) throw new ConflictError('Esta resposta já foi iniciada ou enviada. Atualize o histórico antes de tentar novamente.');
  try {
    if (isComment) await sendPublicCommentReply(accountId, execution.commentId!, text);
    else await sendDirectMessage(accountId, execution.account.igUserId, execution.senderId!, text);
    await prisma.automationExecution.update({ where: { id: executionId }, data: {
      status: 'SENT', responseText: text, publicReplySent: isComment, privateReplySent: !isComment, error: null,
    } });
  } catch (error) {
    await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'FAILED', error: String(error).slice(0, 1000) } }).catch(() => undefined);
    throw error;
  }
  return { sent: true };
};

export const subscribeInstagramAccountToWebhooks = async (userId: string, accountId: string) => {
  const account = await assertOwnedAccount(userId, accountId);
  if (!env.WEBHOOK_VERIFY_TOKEN || !env.FB_APP_SECRET) throw new ValidationError('Configure o webhook e o segredo do app Meta no servidor antes de conectar as automações.');
  const status = await getAutomationStatus(userId, accountId, true);
  if (!status.canAutomateComments && !status.canAutomateMessages) throw new ValidationError('A conta ainda não tem permissões aprovadas para automação de comentários ou mensagens.');
  if (!status.grantedPermissions.includes('pages_manage_metadata')) throw new ValidationError('Reconecte a conta e permita receber eventos da Página vinculada para ativar as automações.');
  const token = await getDecryptedToken(account.id);
  // Facebook Login subscribes the linked Page; the IG-user edge belongs to Instagram Login.
  // https://developers.facebook.com/documentation/instagram-platform/webhooks/setup
  const page = await verifyFacebookPageLink(account.pageId, account.igUserId, token);
  const subscribedFields = [status.canAutomateComments && 'comments', status.canAutomateMessages && 'messages'].filter(Boolean).join(',');
  return graphPost(`/${page.id}/subscribed_apps`, token, { subscribed_fields: subscribedFields });
};
