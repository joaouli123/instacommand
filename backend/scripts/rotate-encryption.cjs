/* Maintenance CLI: no credential or plaintext is ever printed. Default is audit. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createSecretCipher } = require('../dist/utils/secret-cipher');
const targets = {
  user: ['metaAppSecret', 'metaClientToken', 'threadsAppSecret', 'geminiApiKey'],
  instagramAccount: ['pageAccessToken'], threadsAccount: ['accessToken'], xAccount: ['accessToken', 'refreshToken'],
};
const db = new PrismaClient();
const primary = process.env.ENCRYPTION_KEY;
if (!primary || primary.length < 32 || /^(change[-_ ]|0123456789abcdef|test[-_ ])/i.test(primary)) throw new Error('A safe primary key is required');
const cipher = createSecretCipher(primary, process.env.ENCRYPTION_KEY_PREVIOUS);
const mode = process.argv[2] || 'audit';
if (!['audit', 'apply'].includes(mode)) throw new Error('Use audit or apply');

async function inspect(client) {
  const snapshot = {}, counts = {};
  for (const [model, fields] of Object.entries(targets)) {
    snapshot[model] = await client[model].findMany({ select: { id: true, ...Object.fromEntries(fields.map(f => [f, true])) } });
    counts[model] = { rows: snapshot[model].length, secrets: 0, requiresRotation: 0 };
    for (const row of snapshot[model]) for (const field of fields) {
      if (!row[field]) continue;
      counts[model].secrets++;
      cipher.decrypt(row[field]); // fail before any write if an existing value cannot be read
      try { cipher.decryptCurrent(row[field]); } catch { counts[model].requiresRotation++; }
    }
  }
  return { snapshot, counts };
}

(async () => {
  if (mode === 'audit') { const { counts } = await inspect(db); console.log(JSON.stringify({ mode, counts })); return; }
  if (process.env.ROTATION_MAINTENANCE_CONFIRMED !== 'true') throw new Error('Pause and drain integration queues first');
  const backup = process.env.ROTATION_BACKUP_PATH;
  if (!backup || !path.isAbsolute(backup)) throw new Error('An absolute, private backup path is required');
  const parent = fs.statSync(path.dirname(backup));
  if (!parent.isDirectory() || (parent.mode & 0o077)) throw new Error('Backup directory must be private (0700)');
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('LOCK TABLE "User", "InstagramAccount", "ThreadsAccount", "XAccount" IN SHARE ROW EXCLUSIVE MODE');
    const { snapshot, counts } = await inspect(tx);
    const encoded = JSON.stringify({ version: 1, snapshot, createdAt: new Date().toISOString() });
    const sealed = cipher.encrypt(encoded);
    const fd = fs.openSync(backup, 'wx', 0o600);
    try { fs.writeFileSync(fd, sealed); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    assert.equal(cipher.decryptCurrent(fs.readFileSync(backup, 'utf8')), encoded);
    for (const [model, fields] of Object.entries(targets)) for (const row of snapshot[model]) {
      const data = {};
      for (const field of fields) {
        if (!row[field]) continue;
        try { cipher.decryptCurrent(row[field]); continue; } catch {}
        const plain = cipher.decrypt(row[field]);
        data[field] = cipher.encrypt(plain);
        assert.equal(cipher.decryptCurrent(data[field]), plain);
      }
      if (Object.keys(data).length) await tx[model].update({ where: { id: row.id }, data });
    }
    const final = await inspect(tx);
    for (const count of Object.values(final.counts)) assert.equal(count.requiresRotation, 0);
    return { mode, before: counts, after: final.counts, sealedBackupVerified: true };
  }, { maxWait: 15_000, timeout: 120_000, isolationLevel: 'Serializable' });
  console.log(JSON.stringify(result));
})().catch(() => { console.error('Rotation stopped safely; inspect counts and protected backups before proceeding.'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
