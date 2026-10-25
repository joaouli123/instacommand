export type AutomationTrigger = 'COMMENT_ANY' | 'COMMENT_KEYWORD' | 'MESSAGE_ANY' | 'MESSAGE_KEYWORD';
export type AutomationRuleMatch = { trigger: AutomationTrigger; keywords: string[] };

export const hasKeywordMatch = (rule: AutomationRuleMatch, text: string) => {
  if (rule.trigger.endsWith('_ANY')) return true;
  const normalized = text.toLocaleLowerCase('pt-BR');
  return rule.keywords.some((keyword) => keyword.trim() && normalized.includes(keyword.trim().toLocaleLowerCase('pt-BR')));
};

export const matchesEvent = (trigger: AutomationTrigger, eventType: AutomationTrigger) =>
  trigger.startsWith('COMMENT_') === eventType.startsWith('COMMENT_');

// Only return fixed, actionable messages. Provider errors can contain request
// URLs, credentials or input; never copy them into a conversation/history.
export const automationAiFailureReason = (error: unknown): string => {
  const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null;
  const message = error instanceof Error ? error.message : '';
  if (status === 400 && /model[\s\S]*(?:no longer available|not found|not supported|deprecated|retired)/i.test(message)) {
    return 'O modelo de IA configurado não está disponível para esta conta. Confira o modelo em Configurações > Inteligência artificial. Nenhuma resposta foi enviada.';
  }
  if (status === 429) return 'O provedor de IA atingiu o limite de uso. Confira a cota disponível. Nenhuma resposta foi enviada; revise manualmente.';
  if (status === 400 || status === 401 || status === 403 || status === 503) {
    return 'O provedor recusou a configuração da IA. Confira a chave e o modelo em Configurações > Inteligência artificial. Nenhuma resposta foi enviada.';
  }
  if (status === 504) return 'A IA demorou demais para responder. Nenhuma resposta foi enviada; revise manualmente.';
  return 'A IA não gerou uma resposta segura. Revise manualmente.';
};

export const conversationIntent = (text: string): 'STOPPED' | 'HUMAN' | null => {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[.!?]+$/g, '');
  if (/^(stop|parar|pare|cancelar mensagens|sair|nao me envie mais mensagens|nao quero mais mensagens|pare de responder)$/.test(normalized)) return 'STOPPED';
  if (/\b(atendente|atendimento humano|falar com (uma pessoa|alguem|um humano)|quero uma pessoa|talk to (a human|a person|someone)|human agent|real person)\b/.test(normalized)) return 'HUMAN';
  return null;
};

export const validMessageWindow = (timestamp: number | undefined, now = Date.now()) =>
  typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp <= now + 60_000 && now - timestamp < 24 * 3600_000;

export function buildConversationHistory(events: Array<{ eventText: string | null; responseText: string | null; publicReplySent: boolean; privateReplySent: boolean; eventAt: Date }>, maxChars = 12_000) {
  const turns: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  let size = 0;
  for (const event of [...events].sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime())) {
    const pair: Array<{ role: 'user' | 'assistant'; text: string }> = [];
    if (event.eventText) pair.push({ role: 'user', text: event.eventText.slice(0, 2000) });
    if ((event.publicReplySent || event.privateReplySent) && event.responseText) pair.push({ role: 'assistant', text: event.responseText.slice(0, 1000) });
    const length = pair.reduce((sum, turn) => sum + turn.text.length, 0);
    if (size + length > maxChars) break;
    size += length;
    turns.unshift(...pair);
  }
  return turns;
}
