const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

test('Competitors and Trends pick a network; YouTube works and the others explain why they are not available', () => {
  for (const [file, kind, component] of [['app/competitors/page.tsx', 'competitors', 'YouTubeCompetitors'], ['app/trends/page.tsx', 'trends', 'YouTubeTrends']]) {
    const page = read(file);
    assert.match(page, new RegExp(`<ResearchNetworkTabs kind="${kind}"`), file);
    assert.match(page, new RegExp(`network === "YOUTUBE" \\? <${component} />`), file);
    assert.match(page, new RegExp(`<UnavailableNetwork kind="${kind}" network=\\{network\\} />`), file);
  }
  const tabs = read('components/research/ResearchNetworkTabs.tsx');
  for (const reason of ['Page Public Content Access', 'threads_keyword_search', 'plano Basic']) assert.match(tabs, new RegExp(reason));
});

test('YouTube research always uses the company chosen at the top', () => {
  assert.match(read('components/research/YouTubeCompetitors.tsx'), /\/youtube-research\/\$\{encodeURIComponent\(accountId\)\}\/competitors/);
  assert.match(read('components/research/YouTubeTrends.tsx'), /\/youtube-research\/\$\{encodeURIComponent\(accountId\)\}\/trends/);
});
