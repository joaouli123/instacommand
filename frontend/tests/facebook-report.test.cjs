const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/facebook-report.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { getObservedInteractions, rankFacebookPosts } = context.exports;
const post = (id, metrics, createdAt = '2026-09-01T12:00:00.000Z') => ({ id, text: id, createdAt, permalink: null, ...metrics });

test('Facebook observed interactions preserve missing counters instead of treating them as zero', () => {
  assert.deepEqual({ ...getObservedInteractions(post('all-missing', { reactions: null, comments: null, shares: null })) }, { value: null, availableMetrics: 0, complete: false });
  assert.deepEqual({ ...getObservedInteractions(post('real-zero', { reactions: 0, comments: 0, shares: 0 })) }, { value: 0, availableMetrics: 3, complete: true });
  assert.deepEqual({ ...getObservedInteractions(post('partial', { reactions: 4, comments: null, shares: 2 })) }, { value: 6, availableMetrics: 2, complete: false });
});

test('Facebook highlights sort known totals, keep ties stable by date and omit wholly unavailable posts', () => {
  const ranked = rankFacebookPosts([
    post('low', { reactions: 1, comments: 1, shares: 0 }),
    post('unknown', { reactions: null, comments: null, shares: null }),
    post('new-tie', { reactions: 5, comments: 0, shares: 0 }, '2026-09-03T12:00:00.000Z'),
    post('old-tie', { reactions: 4, comments: 1, shares: 0 }, '2026-09-02T12:00:00.000Z'),
  ]);
  assert.deepEqual(ranked.map(item => item.post.id), ['new-tie', 'old-tie', 'low']);
  assert.equal(ranked[0].interactions.value, 5);
  assert.equal(ranked[0].interactions.complete, true);
});
