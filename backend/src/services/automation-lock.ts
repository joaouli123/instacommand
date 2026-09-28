import { createHash, randomUUID } from 'crypto';
import { ConflictError } from '../utils/errors';

export const conversationKey = (platform: string, accountId: string, senderId: string, root: string) =>
  createHash('sha256').update(JSON.stringify([platform, accountId, senderId, root])).digest('hex');

// Serializes worker replies, manual sends, resumes and memory resets across replicas.
// Pausing is immediate and is rechecked by the sender before contacting Meta.
// The lease is renewed while AI runs. A lost lease fails closed before delivery.
export async function withConversationLock<T>(key: string, action: (assertLease: () => Promise<void>) => Promise<T>): Promise<T> {
  const { redisConnection } = await import('../config/redis.js');
  const lockKey = `automation-lock:${key}`;
  const token = randomUUID();
  if (await redisConnection.set(lockKey, token, 'PX', 120_000, 'NX') !== 'OK') throw new ConflictError('Esta conversa está sendo atualizada. Tente novamente em alguns segundos.');
  let lost = false;
  const timer = setInterval(() => {
    void redisConnection.eval('if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("pexpire",KEYS[1],ARGV[2]) else return 0 end', 1, lockKey, token, '120000')
      .then(result => { if (result !== 1) lost = true; }).catch(() => { lost = true; });
  }, 30_000);
  timer.unref();
  try {
    return await action(async () => {
      if (lost || await redisConnection.get(lockKey) !== token) throw new ConflictError('Envio interrompido: a conversa foi atualizada em outro atendimento.');
    });
  } finally {
    clearInterval(timer);
    await redisConnection.eval('if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end', 1, lockKey, token).catch(() => undefined);
  }
}
