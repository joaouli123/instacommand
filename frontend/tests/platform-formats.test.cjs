const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');

test('composer defines platform-specific formats and makes Stories Instagram-only', () => {
  assert.match(source, /FEED: \["INSTAGRAM", "FACEBOOK", "THREADS"\]/);
  assert.match(source, /CAROUSEL: \["INSTAGRAM", "FACEBOOK", "THREADS"\]/);
  assert.match(source, /STORY: \["INSTAGRAM"\]/);
  assert.match(source, /TEXT: \["THREADS"\]/);
  assert.match(source, /Formato e dimensões por plataforma/);
  assert.match(source, /App 1,91:1–3:4 · API conservadora 1,91:1–4:5/);
  assert.match(source, /1080 × 1350 px \(API\) · 3:4 · 1080 × 1440 px \(app\)/);
  assert.match(source, /9:16 obrigatório/);
  assert.match(source, /Mínimo 540 × 960 px · recomendado 1080 × 1920 px/);
  assert.match(source, /Sem dimensão fixa publicada pela API/);
  assert.match(source, /Até 5 min/);
});

test('format preview measures uploaded media and preserves its source aspect ratio', () => {
  assert.match(source, /function getMediaDimensions\(/);
  assert.match(source, /naturalWidth/);
  assert.match(source, /video\.videoWidth/);
  assert.match(source, /function formatAspectRatio\(/);
  assert.match(source, /preserveSourceRatio/);
  assert.match(source, /fora da faixa aceita/);
  assert.match(source, /firstCarouselItem/);
  assert.match(source, /o 1º item define o corte/);
  assert.match(source, /preserveSourceRatio=\{postType !== "REEL" \|\| \(!isInstagram && !isFacebook\)\}/);
});

test('format options derive compatible connected destinations and explain destination changes', () => {
  assert.match(source, /connectedPlatforms\.filter\(\(platform\) => formatPlatforms\[format\]\.includes\(platform\)\)/);
  assert.match(source, /selected\.length \? selected : connected/);
  assert.match(source, /const targetPlatforms = compatiblePlatformsFor\(type\.id\)/);
  assert.match(source, /Usar em \{targetPlatforms\.map\(platform => platformNames\[platform\] \|\| platform\)\.join\(" e "\)\}/);
  assert.match(source, /Não disponível para todas as redes escolhidas/);
  assert.match(source, /postType === "TEXT" \? "500" : "2\.200"/);
});
