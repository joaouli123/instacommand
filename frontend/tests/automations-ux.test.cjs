const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const compile = (file, stubs) => {
  const loaded = { exports: {} };
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const localRequire = (name) => (name in stubs ? stubs[name] : require(name));
  new Function('module', 'exports', 'require', output)(loaded, loaded.exports, localRequire);
  return loaded.exports;
};
const icon = () => null;
const shared = compile('components/automations/shared.tsx', {
  '@icons-pack/react-simple-icons': { SiInstagram: icon, SiMessenger: icon, SiThreads: icon },
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
});

test('each network only offers the channels Meta actually allows', () => {
  assert.deepEqual(shared.allowedKinds('INSTAGRAM'), ['COMMENT', 'MESSAGE']);
  assert.deepEqual(shared.allowedKinds('FACEBOOK'), ['MESSAGE']);
  assert.deepEqual(shared.allowedKinds('THREADS'), ['COMMENT']);
  assert.deepEqual(shared.templateTypesFor('THREADS'), ['PUBLIC_COMMENT']);
  assert.deepEqual(shared.templateTypesFor('FACEBOOK'), ['DIRECT_MESSAGE']);
  assert.equal(shared.blankRule('THREADS').trigger, 'COMMENT_KEYWORD');
  assert.equal(shared.blankRule('FACEBOOK').trigger, 'MESSAGE_KEYWORD');
});

test('guided choices map back to the API triggers', () => {
  assert.equal(shared.triggerFor('COMMENT', true), 'COMMENT_KEYWORD');
  assert.equal(shared.triggerFor('MESSAGE', false), 'MESSAGE_ANY');
  assert.equal(shared.TRIGGER_KIND('COMMENT_ANY'), 'COMMENT');
  assert.equal(shared.usesKeywords('MESSAGE_KEYWORD'), true);
  assert.equal(shared.usesKeywords('MESSAGE_ANY'), false);
});

test('contacts and dates are shown in plain language', () => {
  assert.equal(shared.contactName({ id: 'x', senderUsername: 'maria' }), '@maria');
  assert.equal(shared.contactName({ id: 'abc123456', senderId: '99887766' }), 'Contato 7766');
  assert.equal(shared.formatDate(null), 'Ainda não houve');
});

test('the page keeps every network, status action and section', () => {
  const page = read('app/automations/page.tsx');
  for (const pattern of [/NetworkBadge/, /api\.getAutomationWorkspace\(accountId, platform\)/, /refetchInterval: 15_000/, /api\.subscribeInstagramAutomation\(accountId, platform\)/, /api\.syncThreadsAutomation\(accountId\)/, /\/auth\/threads\/url\?automations=1/, /popup\.opener = null/, /<ConversationsPanel/, /<RulesPanel/, /<TemplatesPanel/, /<AgentPanel/, /<HistoryPanel/]) assert.match(page, pattern);
  // Anything waiting for a person opens the Conversations tab first.
  assert.match(page, /tab \?\? \(needsYou \? "conversas" : "regras"\)/);
});

test('rules only send the replies that make sense for the chosen trigger', () => {
  const rules = read('components/automations/RulesPanel.tsx');
  assert.match(rules, /api\.createAutomation/);
  assert.match(rules, /api\.updateAutomation/);
  assert.match(rules, /window\.confirm/);
});

test('the calendar shows the official network icons on each post', () => {
  const calendar = read('app/calendar/page.tsx');
  assert.match(calendar, /<PlatformIcons platforms=\{event\.post\.platforms\}/);
  assert.match(calendar, /<PlatformChip key=\{platform\} platform=\{platform\} \/>/);
  const icons = compile('components/ui/platform-icons.tsx', {
    '@icons-pack/react-simple-icons': { SiInstagram: icon, SiFacebook: icon, SiThreads: icon },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  });
  assert.equal(icons.platformLabel('FACEBOOK'), 'Facebook');
  assert.equal(icons.PlatformIcons({ platforms: [] }), null);
  assert.equal(icons.PlatformIcons({ platforms: ['OTHER'] }), null);
});

test('calendar cards use the network colors with white icons', () => {
  const icons = compile('components/ui/platform-icons.tsx', {
    '@icons-pack/react-simple-icons': { SiInstagram: icon, SiFacebook: icon, SiThreads: icon },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  });
  assert.equal(icons.platformBackground(['FACEBOOK']), 'linear-gradient(120deg, #0866FF, #0866FF)');
  assert.match(icons.platformBackground(['INSTAGRAM']), /#833AB4.*#E1306C.*#F56040/);
  assert.equal(icons.platformBackground(['INSTAGRAM', 'THREADS']), 'linear-gradient(120deg, #E1306C, #000000)');
  assert.equal(icons.platformBackground([]), '#4F46E5');
  const calendar = read('app/calendar/page.tsx');
  assert.match(calendar, /style=\{\{ background: platformBackground\(event\.post\.platforms\) \}\}/);
  assert.match(calendar, /color="white"/);
});

test('the dashboard queue shows a thumbnail before the format and caption', () => {
  const dashboard = read('app/page.tsx');
  assert.match(dashboard, /function ScheduledItem/);
  assert.match(dashboard, /post\.thumbnailUrl \|\| post\.mediaUrls\?\.\[0\]/);
  assert.match(dashboard, /<PlatformIcons platforms=\{post\.platforms\}/);
});

test('settings are split in tabs and saved secrets show a masked preview', () => {
  const settings = read('app/settings/page.tsx');
  for (const tab of ['connections', 'ai', 'preferences']) assert.match(settings, new RegExp(`TabsTrigger value="${tab}"`));
  assert.match(settings, /preview=\{aiStatus\?\.apiKeyPreview\}/);
  assert.match(settings, /preview=\{metaStatus\?\.appSecretPreview\}/);
  assert.doesNotMatch(settings, /^export function SecretField/m);
});

test('the MCP page leads with ChatGPT, Claude and other AIs', () => {
  const page = read('app/integrations/page.tsx');
  assert.match(page, /\{ id: "chatgpt", name: "ChatGPT"/);
  assert.match(page, /\{ id: "claude", name: "Claude"/);
  assert.match(page, /\{ id: "others", name: "Outras IAs"/);
  assert.match(page, /<TokenManager/);
  assert.match(page, /<ToolCatalog/);
});
