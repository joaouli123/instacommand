import type { InstagramAutomationEvent } from './automation.service';

const parseTimestamp = (value: unknown) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
};

export const parseInstagramWebhookEvents = (payload: any): InstagramAutomationEvent[] => {
  const events: InstagramAutomationEvent[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    const accountIgId = String(entry.id || '');
    if (!accountIgId) continue;
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== 'comments' || !value?.id || typeof value.text !== 'string') continue;
      if (String(value.from?.id || '') === accountIgId) continue;
      events.push({
        accountIgId, eventKey: `${accountIgId}:comment:${String(value.id)}`, type: 'COMMENT_ANY',
        senderId: value.from?.id ? String(value.from.id) : undefined,
        senderUsername: value.from?.username ? String(value.from.username) : undefined,
        text: value.text, mediaId: value.media?.id ? String(value.media.id) : undefined,
        commentId: String(value.id), timestamp: parseTimestamp(value.timestamp),
      });
    }
    for (const item of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const message = item?.message;
      const messageText = typeof message?.text === 'string' ? message.text : Array.isArray(message?.attachments) ? '[Mensagem com mídia]' : undefined;
      if (!item?.sender?.id || !message?.mid || messageText === undefined || message.is_echo) continue;
      events.push({
        accountIgId, eventKey: `${accountIgId}:message:${String(message.mid)}`, type: 'MESSAGE_ANY',
        senderId: String(item.sender.id), text: messageText,
        sourceMessageId: String(message.mid), timestamp: parseTimestamp(item.timestamp),
      });
    }
  }
  return events;
};
