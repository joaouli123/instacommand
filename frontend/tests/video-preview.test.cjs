const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');

test('Reel and Story video previews autoplay muted and expose manual playback and sound controls', () => {
  assert.match(source, /<video[\s\S]*?autoPlay[\s\S]*?muted=\{isMuted\}[\s\S]*?loop[\s\S]*?playsInline[\s\S]*?preload="auto"/);
  assert.match(source, /aria-label=\{isPlaying \? "Pausar prévia do vídeo" : "Reproduzir prévia do vídeo"\}/);
  assert.match(source, /aria-label=\{isMuted \? "Ativar som do vídeo" : "Desativar som do vídeo"\}/);
  assert.match(source, /video\.play\(\)/);
  assert.match(source, /video\.pause\(\)/);
  assert.match(source, /onError=\{\(\) => \{ setVideoError\(true\); setIsPlaying\(false\) \}\}/);
  assert.match(source, /Não foi possível reproduzir este arquivo no navegador\. Tente MP4 com vídeo H\.264\./);
});

test('video files without a video MIME type and common draft-video URLs are still recognized', () => {
  assert.ok(source.includes('file.type.toLowerCase().startsWith("video/") || /\\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(file.name)'));
  assert.ok(source.includes('const isVideoUrl = (src: string) => /\\.(mp4|m4v|mov|webm|ogv|ogg)(?:[?#].*)?$/i.test(src)'));
  assert.ok(source.includes('const kind = isVideoFile(file) ? "video" : "image"'));
  assert.ok(source.includes("kind: isVideoUrl(src) ? 'video' : 'image'"));
});
