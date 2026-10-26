const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, randomBytes, createCipheriv, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { verifyMetaSignedRequest } = require('../dist/utils/meta-signed-request');
const { browserOriginGuard, safeRequestPath } = require('../dist/middleware/browser-origin');
const { rateLimit } = require('../dist/middleware/rateLimit');
const secret = 'unit-test-secret-not-a-production-credential';
const sign = (payload, key = secret) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${createHmac('sha256', key).update(encoded).digest('base64url')}.${encoded}`;
};

test('Meta deletion callbacks accept only authenticated, recent provider payloads', () => {
  const now = Date.now();
  const payload = { algorithm: 'HMAC-SHA256', issued_at: Math.floor(now / 1000), user_id: '1784001234567' };
  assert.equal(verifyMetaSignedRequest(sign(payload), secret, now), payload.user_id);
  for (const value of [undefined, '', '1784001234567', sign(payload, 'wrong-secret'), sign({ ...payload, algorithm: 'none' }), sign({ ...payload, issued_at: payload.issued_at - 86401 }), sign({ ...payload, issued_at: payload.issued_at + 300 }), sign({ ...payload, user_id: {} }), sign({ ...payload, user_id: '' }), sign({ ...payload, issued_at: undefined })]) {
    assert.equal(verifyMetaSignedRequest(value, secret, now), null);
  }
  assert.equal(verifyMetaSignedRequest(sign(payload), '', now), null);
});

test('cross-origin POST is blocked before execution, not merely hidden by CORS', () => {
  const guard = browserOriginGuard(new Set(['https://app.example.test']));
  const run = (method, headers) => {
    let result = 'blocked';
    const res = { status(code) { assert.equal(code, 403); return this; }, json() {} };
    guard({ method, get: (name) => headers[name] }, res, () => { result = 'allowed'; });
    return result;
  };
  assert.equal(run('POST', { origin: 'https://evil.example' }), 'blocked');
  assert.equal(run('DELETE', { origin: 'null' }), 'blocked');
  assert.equal(run('POST', { 'sec-fetch-site': 'cross-site' }), 'blocked');
  assert.equal(run('POST', { origin: 'https://app.example.test' }), 'allowed');
  assert.equal(run('POST', {}), 'allowed'); // CLI / signed provider callback
  assert.equal(run('GET', { origin: 'https://evil.example' }), 'allowed'); // CORS still controls reads
});

test('login limiter cannot be evaded with forged forwarding headers, cookies or bearers', () => {
  const limiter = rateLimit({ name: `security-${Date.now()}`, max: 2, byAddressOnly: true });
  const errors = [], headers = {};
  for (let i = 0; i < 3; i++) {
    limiter({ ip: '198.51.100.3', socket: {}, get: (name) => ({ authorization: `Bearer fake-${i}`, cookie: `instacommand_token=fake-${i}`, 'x-forwarded-for': `192.0.2.${i}` })[name] }, { setHeader: (k, v) => { headers[k] = v; } }, (error) => errors.push(error));
  }
  assert.equal(errors[0], undefined); assert.equal(errors[1], undefined);
  assert.equal(errors[2].statusCode, 429);
  assert.ok(Number(headers['Retry-After']) > 0);
});

test('access-log paths do not expose OAuth credentials or public share secrets', () => {
  assert.equal(safeRequestPath('/api/auth/facebook/callback?code=private&state=secret'), '/api/auth/facebook/callback');
  assert.equal(safeRequestPath('/api/public/share/shr_secret/posts/a/comments'), '/api/public/share/[redacted]/posts/a/comments');
});

test('production rejects default secrets, wildcard credentialed CORS and insecure cookies', () => {
  const base = { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'postgresql://test:test@localhost/test', JWT_SECRET: 'secure-unit-only-jwt-value-with-more-than32chars', ENCRYPTION_KEY: 'secure-unit-only-encryption-value-with-more-than32chars', FRONTEND_URL: 'https://app.example.test', BACKEND_URL: 'https://api.example.test', COOKIE_SECURE: 'true', CORS_ORIGINS: 'https://app.example.test' };
  const invoke = (overrides) => spawnSync(process.execPath, ['-e', "require('./dist/config/env')"], { cwd: require('node:path').join(__dirname, '..'), env: { ...base, ...overrides }, encoding: 'utf8' });
  assert.equal(invoke({}).status, 0);
  for (const values of [{ JWT_SECRET: '' }, { JWT_SECRET: 'change-this-development-secret-32-chars' }, { ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef' }, { CORS_ORIGINS: '*' }, { COOKIE_SECURE: 'false' }]) assert.notEqual(invoke(values).status, 0);
});

test('new secrets use authenticated encryption; old connections remain readable', () => {
  const key = 'unit-only-encryption-key-at-least32characters';
  require.cache[require.resolve('../dist/config/env')] = { exports: { env: { ENCRYPTION_KEY: key } } };
  require.cache[require.resolve('../dist/lib/prisma')] = { exports: { getPrisma: () => ({}) } };
  const { encryptSecret, decryptSecret } = require('../dist/services/instagram/auth.service');
  const encrypted = encryptSecret('test-access-token');
  assert.ok(encrypted.startsWith('gcm:'));
  assert.equal(decryptSecret(encrypted), 'test-access-token');
  const parts = encrypted.split(':'); parts[2] = '00'.repeat(16);
  assert.throws(() => decryptSecret(parts.join(':')));
  const iv = randomBytes(16), legacyCipher = createCipheriv('aes-256-cbc', createHash('sha256').update(key).digest(), iv);
  const legacy = `${iv.toString('hex')}:${legacyCipher.update('legacy-token', 'utf8', 'hex')}${legacyCipher.final('hex')}`;
  assert.equal(decryptSecret(legacy), 'legacy-token');
});

test('invalid, oversized and compressed JSON never echo or log the submitted body', () => {
  const { errorHandler } = require('../dist/middleware/errorHandler');
  for (const [type, code] of [['entity.parse.failed', 400], ['entity.too.large', 413], ['encoding.unsupported', 415]]) {
    const error = Object.assign(new Error('fixture-password-must-not-appear'), { type, body: 'fixture-password-must-not-appear' });
    let response;
    const res = { status(status) { assert.equal(status, code); return this; }, json(value) { response = value; } };
    errorHandler(error, { method: 'POST', originalUrl: '/api/auth/login' }, res, () => assert.fail('unhandled parser error'));
    assert.ok(response);
    assert.doesNotMatch(JSON.stringify(response), /fixture-password/);
  }
});
