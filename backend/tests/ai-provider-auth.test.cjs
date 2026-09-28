const { test, after } = require('node:test');
const assert = require('node:assert/strict');
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {} } };
const { generateAiContent } = require('../dist/services/ai.service');
const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; });

test('standard and authorization Gemini keys travel in the auth header, never the URL or prompt', async () => {
  for (const apiKey of ['AIza-fixture-standard-key', 'AQ.fixture-authorization-key']) {
    const output = { response: 'Resposta fictícia.', shouldEscalate: false, reason: '' };
    let request;
    global.fetch = async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }) };
    };
    assert.deepEqual(await generateAiContent({ mode: 'automation-reply', comment: 'Teste fictício' }, {
      apiKey, model: 'fixture-model', source: 'server',
    }), output);
    assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/fixture-model:generateContent');
    assert.equal(new Headers(request.init.headers).get('x-goog-api-key'), apiKey);
    assert.equal(request.init.body.includes(apiKey), false);
  }
});
