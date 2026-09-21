const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const savedFetch = global.fetch;
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {} } };
const { generateAiContent } = require('../dist/services/ai.service');
const credentials = { apiKey: 'test-key', model: 'test-model', source: 'server' };
after(() => { global.fetch = savedFetch; });
test('daily request supplies profile context and validates the provider response', async () => {
  const result = { summary: 'Plano', timingNote: 'Horários sugeridos.', posts: Array.from({ length: 3 }, () => ({ topic: 'Tema', format: 'IMAGE', caption: 'Legenda', cta: 'Comente', hashtags: [], suggestedTime: '09:00', creativeBrief: 'Foto', storyIdea: 'Enquete', reason: 'Contexto' })) };
  let request;
  global.fetch = async (_url, init) => { request = JSON.parse(init.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }) }; };
  const output = await generateAiContent({ mode: 'daily', context: { igUsername: 'test-profile' } }, credentials);
  assert.equal(output.posts.length, 3);
  assert.match(request.contents[0].parts[0].text, /test-profile/);
  assert.match(request.contents[0].parts[0].text, /exatamente 3/i);
});
test('malformed daily output produces a usable error, never a success payload', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"posts":[]}' }] } }] }) });
  await assert.rejects(generateAiContent({ mode: 'daily' }, credentials), /resposta incompleta/);
});
test('rate limiting preserves the explicit retry-later error', async () => {
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(generateAiContent({ mode: 'daily' }, credentials), error => error.statusCode === 429);
});
