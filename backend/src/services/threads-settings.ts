import { ValidationError } from '../utils/errors';

/** Who can reply to a Threads post (reply_control). Threads only accepts it when the post is created. */
export const THREADS_REPLY_CONTROLS = ['everyone', 'accounts_you_follow', 'mentioned_only', 'parent_post_author_only', 'followers_only'] as const;
export type ThreadsReplyControl = typeof THREADS_REPLY_CONTROLS[number];
export type ThreadsSettings = { replyControl: ThreadsReplyControl };

/** null means "no choice": Threads keeps its default (everyone). */
export function validateThreadsSettings(value: unknown): ThreadsSettings | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Opções do Threads inválidas.');
  const replyControl = (value as { replyControl?: unknown }).replyControl;
  if (replyControl === undefined || replyControl === null || replyControl === '') return null;
  if (!THREADS_REPLY_CONTROLS.includes(replyControl as ThreadsReplyControl)) throw new ValidationError('Escolha quem pode responder no Threads.');
  return { replyControl: replyControl as ThreadsReplyControl };
}

/** The reply_control parameter to send, or nothing when the post keeps the default. */
export function threadsReplyControlParam(settings: unknown): { reply_control?: ThreadsReplyControl } {
  const replyControl = (settings as { replyControl?: unknown } | null)?.replyControl;
  return THREADS_REPLY_CONTROLS.includes(replyControl as ThreadsReplyControl) && replyControl !== 'everyone'
    ? { reply_control: replyControl as ThreadsReplyControl } : {};
}
