const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

test('Community has a YouTube tab that reads, replies and hides comments of the company channel', () => {
  const page = read('app/community/page.tsx');
  assert.match(page, /<ResearchNetworkTabs kind="community"/);
  assert.match(page, /api\.getComments\(accountId, network\)/);
  assert.match(page, /api\.replyComment\(\{ accountId, mediaId: comment\.mediaId, commentId: comment\.id, message, network \}\)/);
  assert.match(page, /api\.deleteComment\(\{ accountId, mediaId: comment\.mediaId, commentId: comment\.id, network \}\)/);
  assert.match(page, /const hidesComments = \(network\?: CommunityNetwork\) => network === "youtube" \|\| network === "facebook" \|\| network === "threads"/);
  assert.match(page, /hidesComments\(network\) \? t\("Ocultar"\) : t\("Excluir"\)/);
  assert.match(read('lib/api.ts'), /&network=\$\{network\}/);
});

test('Community Facebook and Threads tabs are live, not "em breve"', () => {
  const tabs = read('components/research/ResearchNetworkTabs.tsx');
  const community = tabs.slice(tabs.indexOf('community: {'), tabs.indexOf('trends: {'));
  assert.doesNotMatch(community, /FACEBOOK:|THREADS:/);
  assert.match(read('app/community/page.tsx'), /if \(network !== "X"\)/);
  assert.match(read('lib/api.ts'), /'instagram' \| 'youtube' \| 'facebook' \| 'threads'/);
});

test('Automations offer YouTube with the company channels and a manual check', () => {
  const page = read('app/automations/page.tsx');
  assert.match(page, /const PLATFORMS: Platform\[\] = \["INSTAGRAM", "FACEBOOK", "THREADS", "X", "YOUTUBE"\]/);
  assert.match(page, /ofCompany\(youtubeQuery\.data\?\.accounts, activeAccount\?\.id \|\| ""\)/);
  assert.match(page, /api\.syncYouTubeAutomation\(accountId\)/);
  const shared = read('components/automations/shared.tsx');
  assert.match(shared, /export const isPublicReplyPlatform = \(platform: Platform\): boolean => platform === "THREADS" \|\| platform === "X" \|\| platform === "YOUTUBE"/);
  assert.match(shared, /YOUTUBE: \{ label: "YouTube", channel: "Respostas a comentários"/);
  assert.match(read('components/automations/RulesPanel.tsx'), /  YOUTUBE: \[/);
});
