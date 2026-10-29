const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const composer = read('app/composer/page.tsx');
const preview = read('components/preview/SocialPostPreview.tsx');

test('YouTube only takes the video format and choosing it moves the post to video', () => {
  assert.match(composer, /REEL: \["INSTAGRAM", "FACEBOOK", "THREADS", "X", "YOUTUBE"\]/);
  assert.match(composer, /FEED: \["INSTAGRAM", "FACEBOOK", "THREADS", "X"\]/);
  assert.match(composer, /if \(nextPlatforms\.includes\("YOUTUBE"\) && postType !== "REEL"\) \{\s*setPostType\("REEL"\)/);
  assert.match(composer, /o YouTube publica somente vídeos/);
});

test('composer requires the title and the made-for-kids declaration before sending to YouTube', () => {
  assert.match(composer, /Escreva o título do vídeo para o YouTube\./);
  assert.match(composer, /Informe se o vídeo do YouTube é feito para crianças\./);
  assert.match(composer, /madeForKids: null/);
  assert.match(composer, /youtubeSettings: platforms\.includes\("YOUTUBE"\) \? youtubeSettings : undefined/);
  assert.match(composer, /maxLength=\{100\}/);
});

test('vertical or square videos preview as a Short, horizontal ones as the watch page and search card', () => {
  assert.match(preview, /export const isYouTubeShort = \(media: MediaItem \| null\) => !media\?\.width \|\| !media\.height \|\| media\.width <= media\.height/);
  assert.match(preview, /data-preview="youtube-short"/);
  assert.match(preview, /data-preview="youtube-video"/);
  assert.match(preview, /data-preview="youtube-search-card"/);
  assert.match(preview, /emptyMessage="Seu Short aparecerá aqui" fill backgroundClassName="bg-\[#0f0f0f\]"/);
  assert.match(preview, /aspectRatioOverride="16 \/ 9"/);
  assert.match(preview, /if \(previewPlatform === "YOUTUBE"\) return <YouTubePreview/);
});

test('the YouTube preview tab only appears for video posts', () => {
  assert.match(composer, /tab\.id !== "YOUTUBE" \|\| postType === "REEL"/);
});
