const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/active-account-store.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup(stored = '') {
  const values = new Map([['instacommand_active_account', stored]]);
  const win = new EventTarget();
  win.localStorage = { getItem: key => values.get(key), setItem: (key, val) => values.set(key, val) };
  const context = { exports: {}, window: win, Event };
  vm.runInNewContext(code, context);
  return { store: context.exports, win, values };
}
test('every subscriber reads the same persisted selection on mount', () => {
  const { store } = setup('lowfy');
  assert.equal(store.getSelectedAccountId(), 'lowfy');
  assert.equal(store.getSelectedAccountId(), 'lowfy');
  assert.equal(store.getServerAccountId(), '');
});
test('changing selection notifies Header and page exactly once', () => {
  const { store } = setup('lowfy');
  const observations = [];
  const unsubscribe = store.subscribeToAccount(() => observations.push(store.getSelectedAccountId()));
  store.subscribeToAccount(() => observations.push(store.getSelectedAccountId()));
  store.selectAccount('joao');
  store.selectAccount('joao');
  assert.deepEqual(observations, ['joao', 'joao']);
  unsubscribe();
  store.selectAccount('lowfy');
  assert.deepEqual(observations, ['joao', 'joao', 'lowfy']);
});
test('cross-tab storage changes notify only for account selection or storage clear', () => {
  const { store, win, values } = setup('lowfy');
  let notifications = 0;
  store.subscribeToAccount(() => notifications++);
  const emit = key => { const event = new Event('storage'); event.key = key; win.dispatchEvent(event); };
  emit('unrelated');
  assert.equal(notifications, 0);
  values.set('instacommand_active_account', 'joao');
  emit('instacommand_active_account');
  assert.equal(store.getSelectedAccountId(), 'joao');
  emit(null);
  assert.equal(notifications, 2);
});
test('blocked storage keeps a shared in-memory selection', () => {
  const { store, win } = setup();
  win.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  store.selectAccount('joao');
  assert.equal(store.getSelectedAccountId(), 'joao');
});
