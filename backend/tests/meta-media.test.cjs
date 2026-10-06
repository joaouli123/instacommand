const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mediaPreviewUrl, isVideoFileUrl } = require('../dist/utils/meta-media');

const video = 'https://scontent.cdninstagram.com/o1/v/t16/f2/m86/AQabc.mp4?efg=x&oe=66AA';
const cover = 'https://scontent.cdninstagram.com/v/t51.2885-15/123_n.jpg?stp=dst-jpg&oe=66AA';

test('Reels and video Stories use the cover image, never the .mp4 file', () => {
  assert.equal(mediaPreviewUrl({ media_type: 'VIDEO', media_url: video, thumbnail_url: cover }), cover);
  assert.equal(mediaPreviewUrl({ media_type: 'CAROUSEL_ALBUM', media_url: video, thumbnail_url: cover }), cover);
});

test('images keep their own URL; a video without a cover still returns something', () => {
  assert.equal(mediaPreviewUrl({ media_type: 'IMAGE', media_url: cover }), cover);
  assert.equal(mediaPreviewUrl({ media_type: 'VIDEO', media_url: video }), video);
  assert.equal(mediaPreviewUrl({ media_type: 'IMAGE' }), null);
  assert.equal(isVideoFileUrl(video), true);
  assert.equal(isVideoFileUrl(cover), false);
  assert.equal(isVideoFileUrl('not a url'), false);
});
