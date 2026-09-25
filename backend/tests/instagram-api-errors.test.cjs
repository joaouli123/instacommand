const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { graphPost } = require('../dist/utils/instagram-api');
const { InstagramApiError } = require('../dist/utils/errors');
const { errorHandler } = require('../dist/middleware/errorHandler');
const originalFetch = global.fetch;
const originalWarn = console.warn;
const warnings = [];

after(() => {
  global.fetch = originalFetch;
  console.warn = originalWarn;
});

test('Graph API errors preserve safe Meta diagnostics without logging or returning access tokens', async () => {
  const accessToken = 'sensitive-access-token-must-not-leak';
  console.warn = (...values) => warnings.push(values);
  global.fetch = async (_input, options) => {
    assert.match(String(options.body), new RegExp(accessToken));
    return {
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'Permission denied',
          type: 'OAuthException',
          code: 200,
          error_subcode: 123456,
          fbtrace_id: 'A-safe-support-reference',
        },
      }),
    };
  };

  let captured;
  await assert.rejects(
    graphPost('/17841400000000000/subscribed_apps', accessToken, { subscribed_fields: 'comments,messages' }),
    (error) => {
      captured = error;
      assert.ok(error instanceof InstagramApiError);
      assert.equal(error.metaCode, 200);
      assert.equal(error.metaSubcode, 123456);
      assert.equal(error.metaType, 'OAuthException');
      assert.equal(error.fbtraceId, 'A-safe-support-reference');
      assert.doesNotMatch(error.message, new RegExp(accessToken));
      return true;
    },
  );

  const log = JSON.stringify(warnings);
  assert.match(log, /\/:id\/subscribed_apps/);
  assert.match(log, /A-safe-support-reference/);
  assert.doesNotMatch(log, new RegExp(accessToken));

  let responseBody;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { responseBody = body; return this; },
  };
  errorHandler(captured, {}, res, () => {});
  assert.match(responseBody.message, /código Meta 200\/123456/);
  assert.match(responseBody.message, /A-safe-support-reference/);
  assert.doesNotMatch(responseBody.message, new RegExp(accessToken));
});

test('subscription diagnostics retain Meta reason while redacting credentials and numeric IDs', async () => {
  const secretFromProvider = 'EAAbcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN';
  const longOpaqueValue = 'A'.repeat(64);
  console.warn = (...values) => warnings.push(values);
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        message: `(#3) Application does not have the capability for 17841400000000000; access_token=${secretFromProvider} proof=${longOpaqueValue}`,
        type: 'OAuthException',
        code: 3,
      },
    }),
  });

  await assert.rejects(
    graphPost('/17841400000000000/subscribed_apps', 'another-sensitive-access-token', { subscribed_fields: 'comments,messages' }),
    (error) => error instanceof InstagramApiError && error.metaCode === 3,
  );

  const log = JSON.stringify(warnings);
  assert.match(log, /Application does not have the capability/);
  assert.doesNotMatch(log, /17841400000000000/);
  assert.doesNotMatch(log, new RegExp(secretFromProvider));
  assert.doesNotMatch(log, new RegExp(longOpaqueValue));
  assert.doesNotMatch(log, /another-sensitive-access-token/);
});
