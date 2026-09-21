const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { validateAiOutput } = require('../dist/services/ai-output');
const caption = () => ({ hook: 'Olá', caption: 'Conteúdo. Comente!', cta: 'Comente!', hashtags: ['#exemplo'] });
const plan = () => ({ summary: 'Horários editoriais sugeridos.', plan: Array.from({ length: 7 }, (_, i) => ({ day: `Dia ${i + 1}`, format: 'IMAGE', topic: 'Tema', hook: 'Ideia', cta: 'Comente', suggestedTime: '09:00' })) });
const audit = () => ({ score: 40, summary: 'Amostra limitada', strengths: [], opportunities: ['Clareza'], actions: ['Revise a bio'], bioSuggestion: 'Descrição sugerida' });
const reply = () => ({ response: 'Obrigado!', alternatives: ['Agradeço!', 'Bom saber!', 'Que bom!'] });

test('all textual modes accept complete output and strip unsupported fields', () => {
  for (const [mode, fixture] of Object.entries({ caption, plan, audit, reply })) {
    assert.deepEqual(validateAiOutput(mode, { ...fixture(), unexpected: 'discard' }), fixture());
    assert.throws(() => validateAiOutput(mode, {}));
    assert.throws(() => validateAiOutput(mode, null));
  }
  assert.throws(() => validateAiOutput('unknown', {}), /não suportado/);
});
test('caption rejects oversized text and excessive hashtags rather than silently truncating', () => {
  assert.throws(() => validateAiOutput('caption', { ...caption(), caption: 'x'.repeat(2201) }));
  assert.throws(() => validateAiOutput('caption', { ...caption(), hashtags: Array(9).fill('#tag') }));
  assert.throws(() => validateAiOutput('caption', { ...caption(), caption: '   ' }));
});
test('weekly plan requires seven distinct days, supported formats and valid clock times', () => {
  for (const change of [p => p.plan.pop(), p => p.plan[1].day = 'dia 1', p => p.plan[0].format = 'UNKNOWN', p => p.plan[0].suggestedTime = '25:99']) {
    const value = plan(); change(value); assert.throws(() => validateAiOutput('plan', value));
  }
});
test('audit rejects invalid score, string lists and missing actionable steps', () => {
  for (const score of [-1, 101, NaN, Infinity, '40']) assert.throws(() => validateAiOutput('audit', { ...audit(), score }));
  assert.throws(() => validateAiOutput('audit', { ...audit(), actions: [] }));
  assert.throws(() => validateAiOutput('audit', { ...audit(), strengths: 'invalid' }));
});
test('replies require three distinct bounded alternatives', () => {
  assert.throws(() => validateAiOutput('reply', { ...reply(), alternatives: ['Olá', 'olá', 'Teste'] }));
  assert.throws(() => validateAiOutput('reply', { ...reply(), alternatives: ['Só uma'] }));
  assert.throws(() => validateAiOutput('reply', { ...reply(), response: 'x'.repeat(1001) }));
});

const savedFetch = global.fetch;
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {} } };
const { generateAiContent } = require('../dist/services/ai.service');
after(() => { global.fetch = savedFetch; });
test('provider malformed JSON objects fail with actionable 502 for each text mode', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) }; };
  for (const mode of ['caption', 'plan', 'audit', 'reply']) {
    await assert.rejects(generateAiContent({ mode }, { apiKey: 'fixture', model: 'fixture', source: 'server' }), error => error.statusCode === 502 && /resposta incompleta/.test(error.message));
  }
  assert.equal(calls, 4, 'invalid output must not trigger hidden paid retries');
});
