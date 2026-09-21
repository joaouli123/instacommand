const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAiOutput } = require('../dist/services/ai-output');
const example = () => ({ summary: 'Plano editorial', timingNote: 'Sugestões editoriais; sem histórico suficiente.', posts: Array.from({ length: 3 }, (_, i) => ({
  topic: `Assunto ${i + 1}`, format: 'IMAGE', caption: 'Texto com chamada para ação.', cta: 'Conte sua experiência.', hashtags: ['conteudo'],
  suggestedTime: '09:00', creativeBrief: 'Produzir foto do produto.', storyIdea: 'Enquete complementar.', reason: 'Começar pelo contexto.',
})) });
test('daily plan accepts exactly three complete editable posts', () => {
  assert.equal(validateAiOutput('daily', example()).posts.length, 3);
});
test('rejects missing or extra posts instead of rendering a partial plan as success', () => {
  for (const length of [0, 1, 2, 4]) {
    const input = example(); input.posts = Array.from({ length }, () => example().posts[0]);
    assert.throws(() => validateAiOutput('daily', input));
  }
});
test('rejects invalid formats, time suggestions and oversized captions', () => {
  for (const [key, value] of [['format', 'FAKE'], ['suggestedTime', '28:72'], ['caption', 'x'.repeat(2201)]]) {
    const input = example(); input.posts[0][key] = value;
    assert.throws(() => validateAiOutput('daily', input));
  }
});
test('requires visual brief, story, CTA and timing caveat', () => {
  for (const key of ['creativeBrief', 'storyIdea', 'cta', 'reason']) {
    const input = example(); delete input.posts[0][key]; assert.throws(() => validateAiOutput('daily', input));
  }
  const input = example(); delete input.timingNote; assert.throws(() => validateAiOutput('daily', input));
});
test('strips unexpected instructions or executable fields from generated output', () => {
  const input = example(); input.publishNow = true; input.posts[0].toolCall = 'publish';
  const result = validateAiOutput('daily', input);
  assert.equal(result.publishNow, undefined); assert.equal(result.posts[0].toolCall, undefined);
});
