const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const composer = read('app/composer/page.tsx');
const preview = read('components/preview/SocialPostPreview.tsx');
const options = read('components/composer/YouTubeOptions.tsx') + read('lib/publish-compat.ts');

test('YouTube only takes the video format; adding it never wipes the format or the media', () => {
  assert.match(composer, /FORMAT_PLATFORMS as formatPlatforms/);
  assert.doesNotMatch(composer, /Formato ajustado para vídeo: o YouTube publica somente vídeos/);
  assert.match(composer, /const unavailable = !connectedPlatforms\.includes\(target\.id\)/);
  assert.match(composer, /const formatConflicts = incompatiblePlatforms\(postType, platforms\)/);
  assert.match(composer, /if \(step === 2 && formatConflicts\.length\)/);
  assert.match(composer, /if \(compatibilityProblems\.length\) \{\s*toast\.error\(compatibilityProblems\[0\]\)/);
})

test('composer requires the title and the made-for-kids declaration before sending to YouTube', () => {
  assert.match(composer, /Escreva o título do vídeo para o YouTube\./);
  assert.match(composer, /Informe se o vídeo do YouTube é feito para crianças\./);
  assert.match(options, /madeForKids: null/);
  assert.match(composer, /youtubeSettings: platforms\.includes\("YOUTUBE"\) \? youtubeSettings : undefined/);
  assert.match(options, /maxLength=\{100\}/);
});

test('the chosen format drives the YouTube preview: Shorts player or watch page and search card', () => {
  assert.match(preview, /if \(youtubeFormatOf\(settings, media\) === "short"\)/);
  assert.match(preview, /settings\?\.format \|\| \(fitsYouTubeShort\(media\) \? "short" : "video"\)/);
  assert.match(preview, /media\.width <= media\.height && \(media\.duration === undefined \|\| media\.duration <= YOUTUBE_SHORT_MAX_SECONDS\)/);
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

test('YouTube-only posts pick between a regular video and a Short, and a Short that YouTube would refuse is blocked', () => {
  assert.match(composer, /platforms\.length === 1 && platforms\[0\] === "YOUTUBE" \? <YouTubeFormatPicker/);
  assert.match(composer, /const mediaProblem = youtubeMediaProblem\(youtubeSettings\.format, mediaItems\[0\]\)/);
  assert.match(composer, /aria-label="Formato no YouTube"/);
  assert.match(options, /Este vídeo é horizontal/);
  assert.match(options, /Shorts vão até 3 minutos/);
  assert.match(options, /Configurações avançadas/);
});
