const { test } = require('node:test');
const assert = require('node:assert/strict');

const ROTA = '11111111-1111-4111-8111-111111111111';
const UXMOVE = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_COMPANY = '33333333-3333-4333-8333-333333333333';
let companies = [];
let threads = [];
let youtube = [];
const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = {
    findFirst: async ({ where }) => companies.find((row) => matches(row, where)) || null,
    findMany: async ({ where }) => companies.filter((row) => matches(row, where)),
  };
  threadsAccount = {
    findFirst: async ({ where }) => threads.find((row) => matches(row, where)) || null,
    findMany: async ({ where }) => threads.filter((row) => matches(row, where)),
    update: async ({ where, data }) => Object.assign(threads.find((row) => row.id === where.id), data),
  };
  xAccount = { findFirst: async () => null, update: async () => null };
  youTubeAccount = {
    findFirst: async ({ where }) => youtube.find((row) => matches(row, where)) || null,
    update: async ({ where, data }) => Object.assign(youtube.find((row) => row.id === where.id), data),
  };
} } };

const links = require('../dist/services/workspace-links');

const reset = () => {
  companies = [
    { id: ROTA, userId: 'u1', isActive: true, igUsername: 'rottaurbana' },
    { id: UXMOVE, userId: 'u1', isActive: true, igUsername: 'ux.move' },
    { id: OTHER_USER_COMPANY, userId: 'u2', isActive: true, igUsername: 'someone' },
  ];
  threads = [
    { id: 't-ux', userId: 'u1', isActive: true, username: 'UX.Move', workspaceAccountId: null },
    { id: 't-free', userId: 'u1', isActive: true, username: 'outro_perfil', workspaceAccountId: null },
  ];
  youtube = [{ id: 'yt-1', userId: 'u1', isActive: true, workspaceAccountId: null }];
};

test('a post never goes to a Threads, X or YouTube profile of another company, or of none', () => {
  assert.doesNotThrow(() => links.assertSameWorkspace(UXMOVE, [{ network: 'X', account: { workspaceAccountId: UXMOVE } }]));
  assert.throws(() => links.assertSameWorkspace(UXMOVE, [{ network: 'X', account: { workspaceAccountId: ROTA } }]), /pertence a outra empresa/);
  assert.throws(() => links.assertSameWorkspace(UXMOVE, [{ network: 'YOUTUBE', account: { workspaceAccountId: null } }]), /ainda não está vinculada/);
  assert.doesNotThrow(() => links.assertSameWorkspace(UXMOVE, [{ network: 'THREADS', account: null }]));
});

test('a profile can only be linked to a company of the same user', async () => {
  reset();
  assert.equal(await links.ownedWorkspaceId('u1', UXMOVE), UXMOVE);
  assert.equal(await links.ownedWorkspaceId('u1', OTHER_USER_COMPANY), null);
  assert.equal(await links.ownedWorkspaceId('u1', 'not-an-id'), null);
  assert.deepEqual(await links.linkNetworkAccount('YOUTUBE', 'yt-1', 'u1', UXMOVE), { id: 'yt-1', workspaceAccountId: UXMOVE });
  await assert.rejects(() => links.linkNetworkAccount('YOUTUBE', 'yt-1', 'u1', OTHER_USER_COMPANY), /Empresa inválida/);
  await assert.rejects(() => links.linkNetworkAccount('YOUTUBE', 'yt-1', 'u2', UXMOVE), /não encontrada/);
  assert.deepEqual(await links.linkNetworkAccount('YOUTUBE', 'yt-1', 'u1', null), { id: 'yt-1', workspaceAccountId: null });
});

test('connecting from inside a company links the new profile to it, and only to an owned company', async () => {
  reset();
  await links.linkAfterConnect('YOUTUBE', 'yt-1', 'u1', OTHER_USER_COMPANY);
  assert.equal(youtube[0].workspaceAccountId, null);
  await links.linkAfterConnect('YOUTUBE', 'yt-1', 'u1', ROTA);
  assert.equal(youtube[0].workspaceAccountId, ROTA);
});

test('a Threads profile with the same username as one Instagram company is linked to it; others wait for the user', async () => {
  reset();
  await links.autoLinkThreadsAccounts('u1');
  assert.equal(threads[0].workspaceAccountId, UXMOVE);
  assert.equal(threads[1].workspaceAccountId, null);
});
