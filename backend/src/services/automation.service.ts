import { AutomationTemplateType, ConversationState, SocialAutomationTrigger } from '@prisma/client';
import { env } from '../config/env';
import { generateAiContent } from './ai.service';
import { getAiCredentials, getDecryptedToken } from './instagram/auth.service';
import { verifyFacebookPageLink } from './instagram/facebook-link.service';
import { graphPost } from '../utils/instagram-api';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { buildConversationHistory, conversationIntent, hasKeywordMatch, matchesEvent, validMessageWindow } from './automation-logic';
import { accountScope, automationDb as prisma, automationPermissions, ownedAutomationAccount, permissionCapabilities, sendAutomationResponse, ThreadsAutomationError, type Platform, isPublicReplyPlatform, replyLimit } from './automation-platform';
import { conversationKey, withConversationLock } from './automation-lock';

export type InstagramAutomationEvent = {
  accountIgId: string; platform?: Platform; eventKey: string; type: SocialAutomationTrigger;
  senderId?: string; senderUsername?: string; text?: string; mediaId?: string; commentId?: string;
  sourceMessageId?: string; timestamp?: number;
};
const permissionsCache = new Map<string, { expiresAt: number; grantedPermissions: string[]; permissionCheckError: string | null }>();
const agentKey = (accountId: string, platform: Platform) => platform === 'THREADS'
  ? { threadsAccountId_platform: { threadsAccountId: accountId, platform } }
  : platform === 'X'
    ? { xAccountId_platform: { xAccountId: accountId, platform } }
    : { accountId_platform: { accountId, platform } };
const diagnostic = (error: unknown) => error instanceof ValidationError || error instanceof NotFoundError || error instanceof ConflictError || error instanceof ThreadsAutomationError
  ? error.message.slice(0, 500) : 'Não foi possível concluir a operação com o provedor. Confira a conexão; não repetimos envios de resultado incerto.';

export const getAutomationStatus = async (userId: string, accountId: string, refreshPermissions = false, platform: Platform = 'INSTAGRAM') => {
  const account = await ownedAutomationAccount(userId, accountId, platform);
  const cacheKey = `${platform}:${userId}:${accountId}`;
  let result = permissionsCache.get(cacheKey);
  if (refreshPermissions || !result || result.expiresAt < Date.now()) {
    let grantedPermissions: string[] = [], permissionCheckError: string | null = null;
    try { grantedPermissions = await automationPermissions(account); }
    catch (error) { permissionCheckError = diagnostic(error); }
    result = { grantedPermissions, permissionCheckError, expiresAt: Date.now() + 60_000 };
    permissionsCache.set(cacheKey, result);
  }
  const scope = accountScope(accountId, platform);
  const [lastEvent, lastReply, threads] = await Promise.all([
    prisma.automationExecution.findFirst({ where: scope, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.automationExecution.findFirst({ where: { ...scope, OR: [{ publicReplySent: true }, { privateReplySent: true }] }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    platform === 'THREADS' ? prisma.threadsAccount.findUnique({ where: { id: accountId }, select: { automationSyncAt: true, automationSyncError: true } })
      : platform === 'X' ? prisma.xAccount.findUnique({ where: { id: accountId }, select: { automationSyncAt: true, automationSyncError: true } }) : null,
  ]);
  return { platform, webhookConfigured: isPublicReplyPlatform(platform) || Boolean(env.WEBHOOK_VERIFY_TOKEN && env.FB_APP_SECRET),
    callbackUrl: `${env.BACKEND_URL.replace(/\/$/, '')}/api/webhooks/${platform === 'FACEBOOK' ? 'facebook' : 'instagram'}`,
    grantedPermissions: result.grantedPermissions, permissionCheckError: result.permissionCheckError,
    ...permissionCapabilities(platform, result.grantedPermissions),
    activity: { lastEventProcessedAt: lastEvent?.createdAt ?? null, lastReplyAcceptedAt: lastReply?.updatedAt ?? null },
    collectionMode: isPublicReplyPlatform(platform) ? 'POLLING' : 'WEBHOOK',
    lastSyncAt: threads?.automationSyncAt ?? null, syncError: threads?.automationSyncError ?? null,
  };
};

export const getAutomationWorkspace = async (userId: string, accountId: string, platform: Platform = 'INSTAGRAM') => {
  await ownedAutomationAccount(userId, accountId, platform);
  const scope = accountScope(accountId, platform);
  const [automations, templates, agent, executions, conversations, status] = await Promise.all([
    prisma.socialAutomation.findMany({ where: { ...scope, userId }, orderBy: { createdAt: 'desc' } }),
    prisma.automationTemplate.findMany({ where: { ...scope, userId }, orderBy: { updatedAt: 'desc' } }),
    prisma.instagramAgentSettings.findUnique({ where: agentKey(accountId, platform) }),
    prisma.automationExecution.findMany({ where: scope, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.automationConversation.findMany({ where: { ...scope, userId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, senderId: true, senderUsername: true, kind: true, state: true, stateReason: true, lastInboundAt: true, updatedAt: true,
        executions: { orderBy: { createdAt: 'desc' }, take: 1, select: { eventText: true, responseText: true, status: true } } } }),
    getAutomationStatus(userId, accountId, false, platform),
  ]);
  return { automations, templates, agent, executions, conversations, status };
};

type RuleInput = { accountId: string; platform?: Platform; name: string; trigger: SocialAutomationTrigger; keywords: string[];
  replyMode: 'TEMPLATE' | 'AI'; publicCommentReply?: string | null; privateCommentReply?: string | null; directMessageReply?: string | null;
  continueConversation?: boolean; enabled?: boolean };
function validateRule(data: RuleInput) {
  const platform = data.platform || 'INSTAGRAM';
  if (data.trigger.endsWith('_KEYWORD') && !data.keywords.some(keyword => keyword.trim())) throw new ValidationError('Adicione ao menos uma palavra-chave.');
  if (isPublicReplyPlatform(platform) && (!data.trigger.startsWith('COMMENT_') || data.privateCommentReply || data.directMessageReply)) throw new ValidationError(`No ${platform === 'X' ? 'X' : 'Threads'}, use somente respostas públicas.`);
  if (platform === 'FACEBOOK' && !data.trigger.startsWith('MESSAGE_')) throw new ValidationError('No Facebook, use mensagens recebidas pelo Messenger da Página.');
  if (data.continueConversation && (data.replyMode !== 'AI' || !data.trigger.startsWith('MESSAGE_'))) throw new ValidationError('A continuidade é exclusiva de conversas privadas por IA.');
  const limit = replyLimit(platform);
  if ([data.publicCommentReply, data.privateCommentReply, data.directMessageReply].some(text => text && [...text].length > limit)) throw new ValidationError(`Use respostas com até ${limit} caracteres.`);
  if (data.replyMode === 'TEMPLATE' && !(data.trigger.startsWith('COMMENT_') ? data.publicCommentReply?.trim() || data.privateCommentReply?.trim() : data.directMessageReply?.trim())) throw new ValidationError('Escreva uma resposta para esta regra.');
}
export const createAutomation = async (userId: string, data: RuleInput) => {
  const platform = data.platform || 'INSTAGRAM';
  await ownedAutomationAccount(userId, data.accountId, platform);
  validateRule(data);
  const { accountId, ...values } = data;
  return prisma.socialAutomation.create({ data: { ...values, ...accountScope(accountId, platform), userId, enabled: false, enabledAt: null } });
};
export const updateAutomation = async (userId: string, id: string, data: RuleInput) => {
  const platform = data.platform || 'INSTAGRAM';
  await ownedAutomationAccount(userId, data.accountId, platform);
  const scope = accountScope(data.accountId, platform);
  const current = await prisma.socialAutomation.findFirst({ where: { id, ...scope, userId } });
  if (!current) throw new NotFoundError('Automação não encontrada.');
  validateRule(data);
  if (data.enabled) {
    const status = await getAutomationStatus(userId, data.accountId, true, platform);
    if (data.trigger.startsWith('COMMENT_') ? !status.canAutomateComments : !status.canAutomateMessages) throw new ValidationError('A Meta ainda não concedeu as permissões necessárias para este tipo de resposta.');
    if (data.replyMode === 'AI') {
      const agent = await prisma.instagramAgentSettings.findUnique({ where: agentKey(data.accountId, platform) });
      if (!agent?.enabled) throw new ValidationError('Configure e ative o agente antes desta regra.');
    }
  }
  return prisma.socialAutomation.update({ where: { id }, data: { name: data.name, trigger: data.trigger, keywords: data.keywords, replyMode: data.replyMode,
    publicCommentReply: data.publicCommentReply || null, privateCommentReply: data.privateCommentReply || null, directMessageReply: data.directMessageReply || null,
    continueConversation: data.continueConversation ?? current.continueConversation, enabled: data.enabled ?? false,
    enabledAt: data.enabled && !current.enabled ? new Date() : current.enabledAt } });
};
export const deleteAutomation = async (userId: string, accountId: string, id: string, platform: Platform = 'INSTAGRAM') => {
  await ownedAutomationAccount(userId, accountId, platform);
  const current = await prisma.socialAutomation.findFirst({ where: { id, userId, ...accountScope(accountId, platform) } });
  if (!current) throw new NotFoundError('Automação não encontrada.');
  await prisma.socialAutomation.delete({ where: { id } });
};
export const saveAutomationTemplate = async (userId: string, data: { accountId: string; platform?: Platform; name: string; type: AutomationTemplateType; content: string }) => {
  const platform = data.platform || 'INSTAGRAM';
  await ownedAutomationAccount(userId, data.accountId, platform);
  if (isPublicReplyPlatform(platform) && (data.type !== 'PUBLIC_COMMENT' || [...data.content].length > replyLimit(platform))) throw new ValidationError(`${platform === 'X' ? 'X' : 'Threads'}: somente resposta pública de até ${replyLimit(platform)} caracteres.`);
  if (platform === 'FACEBOOK' && data.type !== 'DIRECT_MESSAGE') throw new ValidationError('Facebook: use resposta para o Messenger.');
  return prisma.automationTemplate.create({ data: { name: data.name, type: data.type, content: data.content, userId, ...accountScope(data.accountId, platform) } });
};
export const deleteAutomationTemplate = async (userId: string, accountId: string, id: string, platform: Platform = 'INSTAGRAM') => {
  await ownedAutomationAccount(userId, accountId, platform);
  const current = await prisma.automationTemplate.findFirst({ where: { id, userId, ...accountScope(accountId, platform) } });
  if (!current) throw new NotFoundError('Modelo não encontrado.');
  await prisma.automationTemplate.delete({ where: { id } });
};
export const saveAgentSettings = async (userId: string, data: { accountId: string; platform?: Platform; enabled: boolean; autoSend: boolean; tone: string; instructions: string; knowledgeBase: string; fallback: string; memoryDays?: number; maxRepliesPerHour?: number }) => {
  const platform = data.platform || 'INSTAGRAM';
  await ownedAutomationAccount(userId, data.accountId, platform);
  if (data.autoSend && !data.enabled) throw new ValidationError('Ative o agente antes de habilitar o envio automático.');
  const { accountId, platform: ignored, ...values } = data;
  return prisma.instagramAgentSettings.upsert({ where: agentKey(accountId, platform), create: { ...values, userId, ...accountScope(accountId, platform) }, update: values });
};

export async function getAutomationConversation(userId: string, accountId: string, id: string, platform: Platform = 'INSTAGRAM') {
  await ownedAutomationAccount(userId, accountId, platform);
  const conversation = await prisma.automationConversation.findFirst({ where: { id, userId, ...accountScope(accountId, platform) },
    include: { executions: { orderBy: { createdAt: 'desc' }, take: 100 } } });
  if (!conversation) throw new NotFoundError('Conversa não encontrada.');
  return conversation;
}
export async function setConversationState(userId: string, accountId: string, id: string, state: ConversationState, platform: Platform = 'INSTAGRAM', consentConfirmed = false) {
  const conversation = await getAutomationConversation(userId, accountId, id, platform);
  // Pausing must not wait for a model request. The sender rechecks this state
  // immediately before contacting Meta; an already accepted send cannot be undone.
  if (state !== 'BOT') {
    const changed = await prisma.automationConversation.updateMany({ where: { id, ...(state !== 'STOPPED' && !consentConfirmed ? { state: { not: 'STOPPED' as const } } : {}) },
      data: { state, stateReason: 'Pausado pelo responsável da conta.', ...(state === 'STOPPED' ? { continuationRuleId: null } : {}) } });
    if (!changed.count) throw new ValidationError('A pessoa pediu para parar. Confirme a nova autorização dela antes de retomar.');
    return prisma.automationConversation.findUniqueOrThrow({ where: { id } });
  }
  return withConversationLock(conversation.scopeKey, async () => {
    const current = await prisma.automationConversation.findUniqueOrThrow({ where: { id } });
    if (current.state === 'STOPPED' && !consentConfirmed) throw new ValidationError('A pessoa pediu para parar. Confirme a nova autorização dela antes de retomar.');
    return prisma.automationConversation.update({ where: { id }, data: { state: 'BOT', stateReason: null } });
  });
}
export async function clearConversationMemory(userId: string, accountId: string, id: string, platform: Platform = 'INSTAGRAM') {
  const conversation = await getAutomationConversation(userId, accountId, id, platform);
  return withConversationLock(conversation.scopeKey, async () => prisma.automationConversation.update({ where: { id }, data: { memoryClearedAt: new Date(), continuationRuleId: null } }));
}

export const processInstagramAutomationEvent = async (event: InstagramAutomationEvent) => {
  const platform = event.platform || 'INSTAGRAM';
  const rawAccount = platform === 'THREADS'
    ? await prisma.threadsAccount.findUnique({ where: { threadsUserId: event.accountIgId } })
    : platform === 'X'
      ? await prisma.xAccount.findUnique({ where: { xUserId: event.accountIgId } })
    : platform === 'FACEBOOK'
      ? await prisma.instagramAccount.findFirst({ where: { pageId: event.accountIgId, isActive: true, selectionPending: false } })
      : await prisma.instagramAccount.findUnique({ where: { igUserId: event.accountIgId } });
  if (!rawAccount?.isActive || ('selectionPending' in rawAccount && rawAccount.selectionPending)) return;
  const account = await ownedAutomationAccount(rawAccount.userId, rawAccount.id, platform);
  const scope = accountScope(account.id, platform);
  const isComment = event.type.startsWith('COMMENT_');
  if (isPublicReplyPlatform(platform) && !isComment || platform === 'FACEBOOK' && isComment) return;
  if (!event.senderId || event.senderId === account.externalId) return;
  const key = conversationKey(platform, account.id, event.senderId, isComment ? `PUBLIC:${event.mediaId || event.commentId}` : 'DIRECT');

  await withConversationLock(key, async assertLease => {
    let execution;
    try {
      execution = await prisma.automationExecution.create({ data: { ...scope, eventKey: event.eventKey, eventType: event.type, senderId: event.senderId,
        senderUsername: event.senderUsername?.slice(0, 100), eventText: event.text?.slice(0, 2000), mediaId: event.mediaId, commentId: event.commentId,
        sourceMessageId: event.sourceMessageId, eventAt: event.timestamp && Number.isFinite(event.timestamp) ? new Date(event.timestamp) : new Date() } });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      // The per-conversation lease is already held. An incomplete duplicate is
      // a crashed/uncertain attempt, not permission to send the message again.
      const previous = await prisma.automationExecution.findUnique({ where: { eventKey: event.eventKey } });
      if (previous && ['RECEIVED', 'PROCESSING'].includes(previous.status)) {
        await prisma.automationExecution.update({ where: { id: previous.id }, data: { status: 'FAILED', error: 'Processamento interrompido. Confira a conversa na rede antes de reenviar; o envio não será repetido automaticamente.' } });
        if (previous.conversationId) await prisma.automationConversation.updateMany({ where: { id: previous.conversationId, state: 'BOT' }, data: { state: 'HUMAN', stateReason: 'Processamento interrompido; resultado de envio precisa de conferência.' } });
      }
      return;
    }
    const update = (data: Parameters<typeof prisma.automationExecution.update>[0]['data']) => prisma.automationExecution.update({ where: { id: execution.id }, data });
    if (!isComment && !validMessageWindow(event.timestamp)) { await update({ status: 'BLOCKED', error: 'Mensagem sem horário válido ou fora da janela de 24 horas.' }); return; }
    // Message webhooks carry only the sender id; resolve the name so the inbox shows who wrote.
    if (!isComment && !event.senderUsername && event.senderId && (platform === 'INSTAGRAM' || platform === 'FACEBOOK')) {
      try {
        const { graphGet } = require('../utils/instagram-api') as typeof import('../utils/instagram-api');
        const profile = await graphGet(`/${event.senderId}`, await getDecryptedToken(account.id), { fields: platform === 'INSTAGRAM' ? 'username,name' : 'name' });
        const name = profile?.username || profile?.name;
        if (typeof name === 'string' && name) { event = { ...event, senderUsername: name }; await update({ senderUsername: name }); }
      } catch { /* name is cosmetic; the message is processed either way */ }
    }
    let conversation = await prisma.automationConversation.upsert({ where: { scopeKey: key },
      create: { ...scope, userId: account.userId, scopeKey: key, senderId: event.senderId!, senderUsername: event.senderUsername,
        kind: isComment ? 'PUBLIC' : 'DIRECT', rootMediaId: isComment ? event.mediaId || event.commentId : null, lastInboundAt: execution.eventAt },
      update: { senderUsername: event.senderUsername } });
    await update({ conversationId: conversation.id });
    if (conversation.lastInboundAt > execution.eventAt) { await update({ status: 'SKIPPED', error: 'Evento atrasado: já existe uma mensagem mais recente nesta conversa.' }); return; }
    const previousInboundAt = conversation.lastInboundAt;
    conversation = await prisma.automationConversation.update({ where: { id: conversation.id }, data: { lastInboundAt: execution.eventAt } });
    const intent = conversationIntent(event.text || '');
    if (intent) {
      conversation = await prisma.automationConversation.update({ where: { id: conversation.id }, data: { state: intent, stateReason: 'Solicitado pela própria pessoa.', continuationRuleId: null } });
    }
    if (conversation.state !== 'BOT') { await update({ status: conversation.state === 'STOPPED' ? 'SKIPPED' : 'NEEDS_REVIEW', error: conversation.state === 'STOPPED' ? 'A pessoa pediu para parar. Não enviaremos novas respostas.' : 'Conversa reservada para atendimento humano.' }); return; }
    const [rules, agent] = await Promise.all([
      prisma.socialAutomation.findMany({ where: { ...scope, enabled: true }, orderBy: { createdAt: 'asc' } }),
      prisma.instagramAgentSettings.findUnique({ where: agentKey(account.id, platform) }),
    ]);
    const candidates = rules.filter(rule => matchesEvent(rule.trigger, event.type) && (!rule.enabledAt || execution.eventAt >= rule.enabledAt));
    const direct = candidates.filter(rule => hasKeywordMatch(rule, event.text || '')).sort((a, b) => Number(b.trigger.endsWith('_KEYWORD')) - Number(a.trigger.endsWith('_KEYWORD')));
    const continuation = !isComment && execution.eventAt.getTime() - previousInboundAt.getTime() < 24 * 3600_000 && candidates.find(rule => rule.id === conversation.continuationRuleId && rule.continueConversation && rule.replyMode === 'AI');
    const rule = direct.find(rule => rule.trigger.endsWith('_KEYWORD')) || continuation || direct[0];
    // A direct message no rule answers waits in the inbox for a person to reply from the app.
    if (!rule) { await update(isComment ? { status: 'SKIPPED', error: 'Nenhuma regra ativa correspondeu ao evento.' } : { status: 'NEEDS_REVIEW', error: 'Nenhuma regra respondeu: aguardando resposta manual.' }); return; }
    await update({ status: 'PROCESSING', automationId: rule.id });
    let scopes: string[];
    try { scopes = await automationPermissions(account); }
    catch (error) { await update({ status: 'BLOCKED', error: diagnostic(error) }); return; }
    const capabilities = permissionCapabilities(platform, scopes);
    if (isComment ? !capabilities.canAutomateComments : !capabilities.canAutomateMessages) { await update({ status: 'BLOCKED', error: 'A Meta ainda não concedeu a permissão necessária para responder.' }); return; }
    const handoff = async (reason: string, suggestion?: string) => {
      await prisma.automationConversation.updateMany({ where: { id: conversation.id, state: 'BOT' }, data: { state: 'HUMAN', stateReason: reason.slice(0, 500) } });
      const current = await prisma.automationConversation.findUniqueOrThrow({ where: { id: conversation.id } });
      await update({ status: current.state === 'STOPPED' ? 'SKIPPED' : 'NEEDS_REVIEW', responseText: suggestion || agent?.fallback || null, error: reason.slice(0, 1000) });
    };
    const count = await prisma.automationExecution.count({ where: { conversationId: conversation.id, createdAt: { gte: new Date(Date.now() - 3600_000) }, OR: [{ publicReplySent: true }, { privateReplySent: true }] } });
    if (count >= (agent?.maxRepliesPerHour ?? 10)) { await handoff('Limite de respostas nesta hora atingido. Atendimento humano necessário.'); return; }
    if (event.text === '[Mensagem com mídia]') { await handoff('A mensagem contém mídia. Uma pessoa precisa conferir o conteúdo.'); return; }
    let response = (isComment ? rule.publicCommentReply || rule.privateCommentReply : rule.directMessageReply)?.trim() || '';
    if (rule.replyMode === 'AI') {
      if (!agent?.enabled) { await update({ status: 'BLOCKED', error: 'O agente está desativado.' }); return; }
      const memorySince = new Date(Math.max(Date.now() - (agent.memoryDays ?? 7) * 86400_000, conversation.memoryClearedAt?.getTime() || 0));
      const previous = (agent.memoryDays ?? 7) > 0 ? await prisma.automationExecution.findMany({ where: { ...scope, conversationId: conversation.id,
        id: { not: execution.id }, eventAt: { gte: memorySince, lte: execution.eventAt },
        ...(isComment ? { publicReplySent: true } : {}) }, orderBy: { eventAt: 'desc' }, take: 20 }) : [];
      try {
        const generated = await generateAiContent({ mode: 'automation-reply', comment: event.text || '', context: {
          platform, conversationKind: conversation.kind, username: event.senderUsername || '', tone: agent.tone, instructions: agent.instructions,
          knowledgeBase: agent.knowledgeBase, history: buildConversationHistory(previous), maxReplyCharacters: replyLimit(platform),
        } }, await getAiCredentials(account.userId)) as { response: string; shouldEscalate: boolean; reason: string };
        response = generated.response;
        if (generated.shouldEscalate) { await handoff(`Revisão humana recomendada: ${generated.reason}`, agent.fallback); return; }
        if (!agent.autoSend) { await handoff('Resposta gerada. Envio automático desativado: revise antes de enviar.', response); return; }
        if ([...response].length > replyLimit(platform)) { await handoff('A resposta gerada ultrapassou o limite desta rede. Revise o texto.', response.slice(0, 1000)); return; }
      } catch { await handoff('A IA não gerou uma resposta segura. Revise manualmente.'); return; }
    }
    if (!response) { await update({ status: 'SKIPPED', error: 'Esta regra não tem uma resposta configurada.' }); return; }
    let publicReplySent = false, privateReplySent = false;
    try {
      await assertLease();
      const stillEnabled = await prisma.socialAutomation.findFirst({ where: { id: rule.id, ...scope, enabled: true } });
      if (!stillEnabled) { await update({ status: 'SKIPPED', error: 'A regra foi pausada antes do envio.' }); return; }
      const currentConversation = await prisma.automationConversation.findUniqueOrThrow({ where: { id: conversation.id } });
      if (currentConversation.state !== 'BOT') {
        await update({ status: currentConversation.state === 'STOPPED' ? 'SKIPPED' : 'NEEDS_REVIEW', responseText: response, error: 'A conversa foi pausada antes do envio.' }); return;
      }
      if (rule.replyMode === 'AI') {
        const currentAgent = await prisma.instagramAgentSettings.findUnique({ where: agentKey(account.id, platform) });
        if (!currentAgent?.enabled || !currentAgent.autoSend) { await handoff('O agente ou seu envio automático foi pausado antes do envio.', response); return; }
      }
      await ownedAutomationAccount(account.userId, account.id, platform);
      if (!isComment && !validMessageWindow(event.timestamp)) throw new ValidationError('A janela de resposta expirou durante o processamento.');
      let providerMessageId: string | undefined;
      if (isComment && event.commentId && (rule.replyMode === 'AI' || rule.publicCommentReply)) {
        providerMessageId = await sendAutomationResponse(account, { commentId: event.commentId }, response, async () => {
          await assertLease();
          await ownedAutomationAccount(account.userId, account.id, platform);
          const [currentRule, currentConversation, currentAgent] = await Promise.all([
            prisma.socialAutomation.findFirst({ where: { id: rule.id, ...scope, enabled: true } }),
            prisma.automationConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
            rule.replyMode === 'AI' ? prisma.instagramAgentSettings.findUnique({ where: agentKey(account.id, platform) }) : null,
          ]);
          if (!currentRule || currentConversation.state !== 'BOT' || (rule.replyMode === 'AI' && (!currentAgent?.enabled || !currentAgent.autoSend))) {
            throw new ValidationError('O atendimento foi pausado antes da publicação da resposta.');
          }
        }); publicReplySent = true;
        await update({ publicReplySent, responseText: response, providerMessageId });
      }
      if (isComment && event.commentId && rule.replyMode === 'TEMPLATE' && rule.privateCommentReply) {
        if (platform !== 'INSTAGRAM' || !capabilities.canAutomateMessages) throw new ValidationError('Permissão para resposta privada ao comentário não concedida.');
        if (!event.timestamp || Date.now() - event.timestamp > 7 * 86400_000) throw new ValidationError('Resposta privada ao comentário fora da janela permitida ou sem horário verificável.');
        await prisma.privateReplyClaim.create({ data: { accountId: account.id, commentId: event.commentId, status: 'SENDING' } });
        await assertLease();
        const result = await graphPost(`/${account.externalId}/messages`, await getDecryptedToken(account.id), { recipient: { comment_id: event.commentId }, message: { text: rule.privateCommentReply } });
        if (!result.message_id && !result.id) throw new ValidationError('A Meta não confirmou o envio privado. Confira a conversa antes de tentar novamente.');
        privateReplySent = true;
        await prisma.privateReplyClaim.update({ where: { accountId_commentId: { accountId: account.id, commentId: event.commentId } }, data: { status: 'SENT' } });
      }
      if (!isComment) { providerMessageId = await sendAutomationResponse(account, { senderId: event.senderId }, response); privateReplySent = true; }
      await update({ status: publicReplySent || privateReplySent ? 'SENT' : 'SKIPPED', responseText: response, publicReplySent, privateReplySent, providerMessageId });
      if (privateReplySent && !isComment && rule.replyMode === 'AI' && rule.continueConversation) {
        await prisma.automationConversation.update({ where: { id: conversation.id }, data: { continuationRuleId: rule.id } });
      }
    } catch (error) {
      await update({ status: 'FAILED', responseText: response, publicReplySent, privateReplySent, error: diagnostic(error) });
      await prisma.automationConversation.updateMany({ where: { id: conversation.id, state: 'BOT' }, data: { state: 'HUMAN', stateReason: 'Falha ou resultado de envio incerto. Confira a conversa antes de reenviar.' } });
    }
  });
};

export const sendReviewedAutomationReply = async (userId: string, accountId: string, executionId: string, message: string, platform: Platform = 'INSTAGRAM') => {
  const account = await ownedAutomationAccount(userId, accountId, platform);
  const scope = accountScope(accountId, platform);
  const execution = await prisma.automationExecution.findFirst({ where: { id: executionId, ...scope }, include: { conversation: true } });
  if (!execution) throw new NotFoundError('Evento de automação não encontrado.');
  const isComment = execution.eventType.startsWith('COMMENT_');
  const key = execution.conversation?.scopeKey || conversationKey(platform, accountId, execution.senderId || '', isComment ? `PUBLIC:${execution.mediaId || execution.commentId}` : 'DIRECT');
  return withConversationLock(key, async assertLease => {
    const text = message.trim();
    if (!text || [...text].length > replyLimit(platform)) throw new ValidationError('Confira o texto e o limite de caracteres da resposta.');
    if (execution.conversationId) {
      const conversation = await prisma.automationConversation.findUniqueOrThrow({ where: { id: execution.conversationId } });
      if (conversation.state === 'STOPPED') throw new ValidationError('A pessoa pediu para não receber respostas.');
      if (conversation.lastInboundAt > execution.eventAt) throw new ValidationError('Há uma mensagem mais recente. Revise a conversa atual antes de responder.');
    }
    if (!isComment && !validMessageWindow(execution.eventAt.getTime())) throw new ValidationError('A janela de resposta da Meta expirou.');
    const capabilities = permissionCapabilities(platform, await automationPermissions(account));
    if (isComment ? !capabilities.canAutomateComments : !capabilities.canAutomateMessages) throw new ValidationError('Permissão da Meta não concedida para esta resposta.');
    await assertLease();
    const claim = await prisma.automationExecution.updateMany({ where: { id: executionId, ...scope, status: 'NEEDS_REVIEW' }, data: { status: 'PROCESSING' } });
    if (claim.count !== 1) throw new ConflictError('Esta resposta já foi iniciada ou enviada. Atualize a conversa.');
    try {
      const providerMessageId = await sendAutomationResponse(account, isComment ? { commentId: execution.commentId } : { senderId: execution.senderId }, text, async () => {
        await assertLease();
        await ownedAutomationAccount(userId, accountId, platform);
        if (execution.conversationId) {
          const current = await prisma.automationConversation.findUniqueOrThrow({ where: { id: execution.conversationId } });
          if (current.state === 'STOPPED' || current.lastInboundAt > execution.eventAt) throw new ValidationError('A conversa mudou antes da publicação. Revise o atendimento.');
        }
      });
      await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'SENT', responseText: text, publicReplySent: isComment, privateReplySent: !isComment, providerMessageId, humanReply: true, error: null } });
    } catch (error) {
      await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'FAILED', error: diagnostic(error) } });
      throw new ValidationError(diagnostic(error));
    }
    return { sent: true };
  });
};

export const subscribeInstagramAccountToWebhooks = async (userId: string, accountId: string, platform: Platform = 'INSTAGRAM') => {
  const account = await ownedAutomationAccount(userId, accountId, platform);
  if (isPublicReplyPlatform(platform)) throw new ValidationError('Nesta rede as respostas públicas são consultadas periodicamente, sem configurar este webhook.');
  if (!env.WEBHOOK_VERIFY_TOKEN || !env.FB_APP_SECRET) throw new ValidationError('Configure o recebimento de eventos da Meta no servidor.');
  const status = await getAutomationStatus(userId, accountId, true, platform);
  if (!status.canAutomateComments && !status.canAutomateMessages) throw new ValidationError('A conta ainda não tem permissões para esta automação.');
  if (!status.grantedPermissions.includes('pages_manage_metadata')) throw new ValidationError('Reconecte a conta e permita receber eventos da Página vinculada.');
  const token = await getDecryptedToken(account.id);
  const page = await verifyFacebookPageLink(account.pageId!, account.igUserId!, token);
  const fields = ['feed'];
  if (status.canAutomateMessages && status.grantedPermissions.includes('pages_messaging')) fields.push('messages');
  return graphPost(`/${page.id}/subscribed_apps`, token, { subscribed_fields: fields.join(',') });
};
