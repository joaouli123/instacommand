const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { normalizePost, rankPosts, postingFrequency, formatBreakdown, postFormat, parseRankSort, parseRankFormat, parsePeriodDays, TtlCache } = require('../dist/services/instagram/content-ranking');

const now = new Date('2026-10-07T12:00:00Z');
const hoursAgo = (h) => new Date(now.getTime() - h * 3600000).toISOString();
const src = (followers) => ({ type: 'competitor', label: 'x', followers });

test('engagement rate uses followers and keeps unknown counters null', () => {
  const p = normalizePost({ id: '1', like_count: 90, comments_count: 10, timestamp: hoursAgo(10) }, src(1000), now);
  assert.equal(p.interactions, 100);
  assert.equal(p.engagementRate, 10);
  assert.equal(p.velocity, 10);
  const u = normalizePost({ id: '2' }, src(1000), now);
  assert.equal(u.likes, null);
  assert.equal(u.interactions, null);
  assert.equal(u.engagementRate, null);
  assert.equal(normalizePost({ caption: 'no id' }, src(1), now), null);
});

test('hashtag media without followers falls back to interactions for ranking', () => {
  const a = normalizePost({ id: 'a', like_count: 5, comments_count: 0 }, { type: 'hashtag_top', label: 't' }, now);
  assert.equal(a.engagementRate, null);
  const b = normalizePost({ id: 'b', like_count: 50, comments_count: 1 }, { type: 'hashtag_top', label: 't' }, now);
  assert.deepEqual(rankPosts([a, b]).map((p) => p.id), ['b', 'a']);
});

test('rankPosts sorts, filters by format/period, dedupes and puts unknowns last', () => {
  const posts = [
    normalizePost({ id: 'r', media_type: 'VIDEO', like_count: 10, comments_count: 50, timestamp: hoursAgo(5) }, src(100), now),
    normalizePost({ id: 'c', media_type: 'CAROUSEL_ALBUM', like_count: 300, comments_count: 1, timestamp: hoursAgo(24 * 20) }, src(100), now),
    normalizePost({ id: 'n', media_type: 'IMAGE', timestamp: hoursAgo(1) }, src(100), now),
    normalizePost({ id: 'r', media_type: 'VIDEO', like_count: 999, comments_count: 0 }, src(100), now),
  ];
  assert.deepEqual(rankPosts(posts, { sort: 'likes', now }).map((p) => p.id), ['c', 'r', 'n']);
  assert.deepEqual(rankPosts(posts, { sort: 'comments', now }).map((p) => p.id), ['r', 'c', 'n']);
  assert.deepEqual(rankPosts(posts, { format: 'REELS', now }).map((p) => p.id), ['r']);
  assert.deepEqual(rankPosts(posts, { periodDays: 7, sort: 'likes', now }).map((p) => p.id), ['r', 'n']);
  assert.deepEqual(rankPosts(posts, { sort: 'recent', now }).map((p) => p.id), ['n', 'r', 'c']);
  assert.equal(rankPosts(posts, { limit: 1, now }).length, 1);
});

test('formats and posting frequency', () => {
  assert.equal(postFormat({ media_type: 'VIDEO' }), 'REELS');
  assert.equal(postFormat({ media_type: 'IMAGE', media_product_type: 'REELS' }), 'REELS');
  assert.equal(postFormat({ media_type: 'CAROUSEL_ALBUM' }), 'CAROUSEL');
  assert.equal(postFormat({}), 'IMAGE');
  const posts = Array.from({ length: 14 }, (_, i) => ({ timestamp: hoursAgo(24 * i + 1), media_type: i % 2 ? 'VIDEO' : 'IMAGE', like_count: i % 2 ? 100 : 10 }));
  assert.equal(postingFrequency(posts, now), 7.5);
  assert.equal(postingFrequency([], now), null);
  assert.equal(postingFrequency([{ timestamp: hoursAgo(1) }], now), 1);
  const breakdown = formatBreakdown(posts);
  assert.equal(breakdown[0].format, 'REELS');
  assert.equal(breakdown[0].avgInteractions, 100);
  assert.equal(breakdown[0].share, 50);
  assert.equal(formatBreakdown([{ media_type: 'IMAGE' }])[0].avgInteractions, null);
});

test('query parsers reject unexpected values', () => {
  assert.equal(parseRankSort('likes'), 'likes');
  assert.equal(parseRankSort('drop table'), 'engagement');
  assert.equal(parseRankFormat('reels'), 'REELS');
  assert.equal(parseRankFormat('x'), 'ALL');
  assert.equal(parsePeriodDays('7'), 7);
  assert.equal(parsePeriodDays('0'), null);
  assert.equal(parsePeriodDays('abc'), null);
});

test('TtlCache expires entries', () => {
  const cache = new TtlCache(1000);
  cache.set('k', 1, 0);
  assert.equal(cache.get('k', 500).value, 1);
  assert.equal(cache.get('k', 1000), null);
});
