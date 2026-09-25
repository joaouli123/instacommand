export type AutomationTrigger = 'COMMENT_ANY' | 'COMMENT_KEYWORD' | 'MESSAGE_ANY' | 'MESSAGE_KEYWORD';
export type AutomationRuleMatch = { trigger: AutomationTrigger; keywords: string[] };

export const hasKeywordMatch = (rule: AutomationRuleMatch, text: string) => {
  if (rule.trigger.endsWith('_ANY')) return true;
  const normalized = text.toLocaleLowerCase('pt-BR');
  return rule.keywords.some((keyword) => keyword.trim() && normalized.includes(keyword.trim().toLocaleLowerCase('pt-BR')));
};

export const matchesEvent = (trigger: AutomationTrigger, eventType: AutomationTrigger) =>
  trigger.startsWith('COMMENT_') === eventType.startsWith('COMMENT_');
