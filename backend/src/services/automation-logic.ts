export type AutomationTrigger = 'COMMENT_ANY' | 'COMMENT_KEYWORD' | 'MESSAGE_ANY' | 'MESSAGE_KEYWORD';
export type AutomationRuleMatch = { trigger: AutomationTrigger; keywords: string[] };

export const hasKeywordMatch = (rule: AutomationRuleMatch, text: string) => {
  if (rule.trigger.endsWith('_ANY')) return true;
  const normalized = text.toLocaleLowerCase('pt-BR');
  return rule.keywords.some((keyword) => keyword.trim() && normalized.includes(keyword.trim().toLocaleLowerCase('pt-BR')));
};

export const matchesEvent = (trigger: AutomationTrigger, eventType: AutomationTrigger) =>
  trigger.startsWith('COMMENT_') === eventType.startsWith('COMMENT_');

export const conversationIntent = (text: string): 'STOPPED' | 'HUMAN' | null => {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[.!?]+$/g, '');
  if (/^(stop|parar|pare|cancelar mensagens|sair|nao me envie mais mensagens|nao quero mais mensagens|pare de responder)$/.test(normalized)) return 'STOPPED';
  if (/\b(atendente|atendimento humano|falar com (uma pessoa|alguem|um humano)|quero uma pessoa)\b/.test(normalized)) return 'HUMAN';
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
