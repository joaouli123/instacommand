import type { InstagramAutomationEvent } from './automation.service';

const parseTimestamp = (value: unknown) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
};

export const parseInstagramWebhookEvents = (payload: any): InstagramAutomationEvent[] => {
  const events: InstagramAutomationEvent[] = [];
  if (payload?.object && payload.object !== 'instagram') return events;
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
      if (!item?.sender?.id || String(item.sender.id) === accountIgId || !message?.mid || messageText === undefined || message.is_echo || message.is_deleted || message.is_unsupported) continue;
      if (item.recipient?.id && String(item.recipient.id) !== accountIgId) continue;
      events.push({
        accountIgId, eventKey: `${accountIgId}:message:${String(message.mid)}`, type: 'MESSAGE_ANY',
        senderId: String(item.sender.id), text: messageText,
        sourceMessageId: String(message.mid), timestamp: parseTimestamp(item.timestamp),
      });
    }
  }
  return events;
};

export const parseFacebookWebhookEvents = (payload: any): InstagramAutomationEvent[] => {
  if (payload?.object !== 'page') return [];
  const events: InstagramAutomationEvent[] = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    const pageId = String(entry.id || '');
    if (!pageId) continue;
    for (const item of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const message = item?.message;
      if (!message?.mid || message.is_echo || message.is_deleted || message.is_unsupported || !item.sender?.id || String(item.sender.id) === pageId || String(item.recipient?.id) !== pageId) continue;
      const text = typeof message.text === 'string' ? message.text : Array.isArray(message.attachments) ? '[Mensagem com mídia]' : undefined;
      if (text === undefined) continue;
      events.push({ platform: 'FACEBOOK', accountIgId: pageId, eventKey: `facebook:${pageId}:message:${String(message.mid)}`,
        type: 'MESSAGE_ANY', senderId: String(item.sender.id), sourceMessageId: String(message.mid), text, timestamp: parseTimestamp(item.timestamp) });
    }
  }
  return events;
};
