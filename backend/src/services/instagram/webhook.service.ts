import { env } from '../../config/env';

export const verifyWebhook = (mode: string, token: string, challenge: string) => {
  if (mode === 'subscribe' && token === env.JWT_SECRET) {
    return challenge;
  }
  throw new Error('Verification failed');
};

export const handleWebhookEvent = async (body: any) => {
  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      // Handle different types of webhooks (comments, mentions, etc.)
      console.log('Received webhook entry:', entry);
    }
  }
};
