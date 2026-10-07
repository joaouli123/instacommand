export type CommentIntent = 'question' | 'complaint' | 'praise' | 'other';

export type InsightComment = {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
  answered: boolean;
  firstReplyAt?: string | null;
  intent: CommentIntent;
};

const normalizeText = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const COMPLAINT_WORDS = ['nao funciona', 'nao chegou', 'demora', 'demorou', 'pessimo', 'horrivel', 'ruim', 'golpe', 'reclama', 'problema', 'decepcion', 'absurdo', 'nunca mais', 'cade meu', 'sem resposta', 'ninguem responde', 'reembolso', 'estorno', 'defeito', 'quebrado', 'errado', 'lixo'];
const PRAISE_WORDS = ['amei', 'amo', 'adorei', 'lindo', 'linda', 'perfeit', 'maravilh', 'incrivel', 'top', 'parabens', 'sensacional', 'excelente', 'obrigad', 'show', 'demais', 'arrasou', 'otimo', 'otima', 'muito bom', 'muito boa', 'love', 'amazing'];
const QUESTION_WORDS = ['quanto', 'qual ', 'quais', 'como ', 'onde', 'quando', 'tem ', 'vende', 'preco', 'valor', 'link', 'frete', 'entrega', 'disponivel', 'tamanho', 'pode ', 'consegue', 'informac', 'duvida'];
const PRAISE_EMOJI = /[❤\u{1F60D}\u{1F970}\u{1F44F}\u{1F525}\u{1F64C}\u{1F496}\u{1F49C}\u{1F499}\u{1F49A}\u{1F9E1}\u{1F60A}\u{1F929}]/u;

/** Cheap keyword heuristic. Complaints win over questions, questions over praise. */
export const classifyIntent = (text: string): CommentIntent => {
  const value = normalizeText(text || '');
  if (!value.trim()) return 'other';
  if (COMPLAINT_WORDS.some(word => value.includes(word))) return 'complaint';
  if (value.includes('?') || QUESTION_WORDS.some(word => value.startsWith(word.trim()) || value.includes(` ${word}`))) return 'question';
  if (PRAISE_WORDS.some(word => value.includes(word)) || PRAISE_EMOJI.test(text)) return 'praise';
  return 'other';
};

/** Finds the first reply written by the account itself. */
export const findOwnerReply = (replies: Array<{ username?: string; timestamp?: string }> | undefined, ownerUsername?: string | null) => {
  if (!ownerUsername || !Array.isArray(replies)) return null;
  const owner = ownerUsername.toLowerCase().replace(/^@/, '');
  const own = replies
    .filter(reply => String(reply?.username || '').toLowerCase() === owner)
    .sort((left, right) => new Date(left.timestamp || 0).getTime() - new Date(right.timestamp || 0).getTime());
  return own[0] || null;
};

export const summarizeComments = (comments: InsightComment[], topLimit = 8) => {
  const total = comments.length;
  const answered = comments.filter(comment => comment.answered).length;
  const delays: number[] = [];
  for (const comment of comments) {
    if (!comment.answered || !comment.firstReplyAt || !comment.timestamp) continue;
    const delay = new Date(comment.firstReplyAt).getTime() - new Date(comment.timestamp).getTime();
    if (Number.isFinite(delay) && delay >= 0) delays.push(delay / 60000);
  }
  const intents: Record<CommentIntent, number> = { question: 0, complaint: 0, praise: 0, other: 0 };
  const commenters = new Map<string, { username: string; comments: number; unanswered: number; lastAt: string | null }>();
  for (const comment of comments) {
    intents[comment.intent] += 1;
    const username = comment.username || 'usuário';
    const entry = commenters.get(username) || { username, comments: 0, unanswered: 0, lastAt: null };
    entry.comments += 1;
    if (!comment.answered) entry.unanswered += 1;
    if (comment.timestamp && (!entry.lastAt || comment.timestamp > entry.lastAt)) entry.lastAt = comment.timestamp;
    commenters.set(username, entry);
  }
  const topCommenters = [...commenters.values()]
    .sort((left, right) => right.comments - left.comments || String(right.lastAt || '').localeCompare(String(left.lastAt || '')))
    .slice(0, topLimit);
  return {
    total,
    answered,
    unanswered: total - answered,
    responseRate: total ? Math.round((answered / total) * 1000) / 10 : null,
    avgResponseMinutes: delays.length ? Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length) : null,
    intents,
    topCommenters,
  };
};
