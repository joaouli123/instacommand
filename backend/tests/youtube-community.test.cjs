const { test } = require('node:test');
const assert = require('node:assert/strict');

const env = {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!',
  GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret', YOUTUBE_REDIRECT_URI: 'https://api.example.test/api/auth/youtube/callback',
  GEMINI_MODEL: 'gemini', FRONTEND_URL: 'https://app.example.test', MEDIA_PUBLIC_URL: 'https://api.example.test/uploads', BACKEND_URL: 'https://api.example.test',
};
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
let companies = [], channels = [];
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findFirst: async ({ where }) => companies.find((row) => row.id === where.id && row.userId === where.userId) || null };
  youTubeAccount = {
    findFirst: async ({ where }) => channels.find((row) => row.workspaceAccountId === where.workspaceAccountId && row.userId === where.userId) || null,
    findUnique: async ({ where }) => channels.find((row) => row.id === where.id) || null,
  };
} } };

const community = require('../dist/services/youtube-community.service');
const CHANNEL = 'UCowner';
const thread = (id, author, at, replies = []) => ({ id, snippet: { videoId: 'vid1', totalReplyCount: replies.length, topLevelComment: { id, snippet: { textOriginal: 'Quanto custa o app?', authorDisplayName: 'Ana', authorChannelId: { value: author }, publishedAt: at, likeCount: 2 } } }, replies: { comments: replies } });

test('a YouTube thread becomes a Community comment; answered only when the channel itself replied', () => {
  const videos = new Map([['vid1', { title: 'Lançamento', thumbnail: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg', publishedAt: '2026-10-01T00:00:00Z', likes: 10, comments: 3 }]]);
  const fan = community.threadToComment(thread('c1', 'UCfan', '2026-10-20T10:00:00Z', [{ snippet: { authorChannelId: { value: 'UCother' }, publishedAt: '2026-10-20T11:00:00Z' } }]), CHANNEL, videos);
  assert.equal(fan.answered, false);
  assert.equal(fan.intent, 'question');
  assert.equal(fan.mediaCaption, 'Lançamento');
  assert.equal(fan.permalink, 'https://www.youtube.com/watch?v=vid1&lc=c1');
  const answered = community.threadToComment(thread('c2', 'UCfan', '2026-10-20T10:00:00Z', [{ snippet: { authorChannelId: { value: CHANNEL }, publishedAt: '2026-10-20T12:00:00Z' } }]), CHANNEL, videos);
  assert.equal(answered.answered, true);
  assert.equal(answered.firstReplyAt, '2026-10-20T12:00:00Z');
});

test('automations only see new comments by other people, after the rule was enabled', () => {
  const since = Date.parse('2026-10-20T00:00:00Z');
  const events = community.youtubeCommentEvents([
    thread('new', 'UCfan', '2026-10-21T10:00:00Z'),
    thread('old', 'UCfan', '2026-10-19T10:00:00Z'),
    thread('own', CHANNEL, '2026-10-21T11:00:00Z'),
  ], CHANNEL, since);
  assert.deepEqual(events.map((event) => event.commentId), ['new']);
  assert.equal(events[0].platform, 'YOUTUBE');
  assert.equal(events[0].eventKey, `youtube:${CHANNEL}:comment:new`);
  assert.equal(events[0].type, 'COMMENT_ANY');
  assert.equal(events[0].senderId, 'UCfan');
});

test('Community on YouTube uses only the selected company channel, and replying needs the comment permission', async () => {
  companies = [{ id: 'co', userId: 'u1' }];
  channels = [{ id: 'yt', userId: 'u1', workspaceAccountId: 'other-company', scopes: '' }];
  await assert.rejects(() => community.listYouTubeComments('u1', 'co'), /não tem canal do YouTube/);
  await assert.rejects(() => community.listYouTubeComments('u2', 'co'), /Empresa não encontrada/);
  channels = [{ id: 'yt', userId: 'u1', workspaceAccountId: 'co', scopes: 'https://www.googleapis.com/auth/youtube.readonly' }];
  await assert.rejects(() => community.replyToCompanyYouTubeComment('u1', 'co', 'UgzComment123', 'Oi!'), /Reconecte o canal do YouTube/);
  await assert.rejects(() => community.hideCompanyYouTubeComment('u1', 'co', 'bad id!'), /inválido/);
});
