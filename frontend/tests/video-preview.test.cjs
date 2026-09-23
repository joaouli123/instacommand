const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');

test('Reel and Story video previews autoplay muted and expose manual playback and sound controls', () => {
  assert.match(source, /<video[\s\S]*?autoPlay[\s\S]*?muted=\{isMuted\}[\s\S]*?loop[\s\S]*?playsInline[\s\S]*?preload="auto"/);
  assert.match(source, /<video[\s\S]*?className="absolute inset-0 h-full w-full object-contain"/);
  assert.match(source, /aria-label=\{isPlaying \? "Pausar prévia do vídeo" : "Reproduzir prévia do vídeo"\}/);
  assert.match(source, /aria-label=\{isMuted \? "Ativar som do vídeo" : "Desativar som do vídeo"\}/);
  assert.match(source, /video\.play\(\)/);
  assert.match(source, /video\.pause\(\)/);
  assert.match(source, /onError=\{\(event\) => \{/);
  assert.match(source, /Exporte como MP4 \(H\.264 \+ AAC\) e tente novamente\./);
});

test('immersive Reel and Story previews fill the 9:16 stage and preserve source video proportions', () => {
  assert.match(source, /fill \? "absolute inset-0" : "relative"/);
  assert.match(source, /className=\{`group\/video \$\{fill \? "absolute inset-0" : "relative"\} overflow-hidden bg-\[#eef1f4\]/);

  for (const previewCall of [
    'emptyMessage="Sua mídia de Story aparecerá aqui" fill',
    'emptyMessage="Sua mídia do Story aparecerá aqui" fill',
    'emptyMessage="Sua capa do Reel aparecerá aqui" fill',
    'emptyMessage="Seu vídeo do Reel aparecerá aqui" fill',
  ]) {
    assert.ok(source.includes(previewCall), `Expected immersive preview to fill its stage: ${previewCall}`);
  }

  assert.match(source, /<video[\s\S]*?className="absolute inset-0 h-full w-full object-contain"/);
});

test('browser detects uploaded video type, shows loading feedback and reports unsupported codecs', () => {
  assert.match(source, /<video[\s\S]*?src=\{media\.src\}[\s\S]*?\/>/);
  assert.doesNotMatch(source, /<source src=\{media\.src\} type=\{getVideoMimeType\(media\)\}/);
  assert.match(source, /video\.load\(\)/);
  assert.match(source, /onCanPlay=\{\(event\) => \{[\s\S]*?setIsVideoReady\(true\)[\s\S]*?video\.play\(\)/);
  assert.match(source, /Carregando vídeo…/);
  assert.match(source, /event\.currentTarget\.error\?\.code/);
  assert.match(source, /O navegador não reconhece o formato ou codec deste vídeo/);
  assert.match(source, /muted autoPlay loop playsInline preload="auto"/);
});

test('switching social preview tabs remounts the media and retries muted playback once decodable', () => {
  assert.match(source, /<ComposerSocialPreview\s+key=\{resolvedPreviewPlatform\}/);
  assert.match(source, /onCanPlay=\{\(event\) => \{[\s\S]*?if \(!video\.paused\) return[\s\S]*?video\.muted = true[\s\S]*?video\.play\(\)/);
});

test('vertical video format uses the platform name and ratio instead of calling every video a Reel', () => {
  assert.match(source, /const typeLabel = type\.id === "REEL" \? platformSpecific\?\.name \|\| type\.label : type\.label/);
  assert.match(source, /const typeDescription = type\.id === "REEL" \? platformSpecific\?\.shape \|\| type\.description/);
  assert.match(source, /THREADS:[\s\S]*?REEL: \{ name: "Post com vídeo"/);
  assert.match(source, /INSTAGRAM:[\s\S]*?REEL: \{ name: "Reel"/);
  assert.match(source, /FACEBOOK:[\s\S]*?REEL: \{ name: "Reel do Facebook"/);
});

test('video files without a video MIME type and common draft-video URLs are still recognized', () => {
  assert.ok(source.includes('file.type.toLowerCase().startsWith("video/") || /\\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(file.name)'));
  assert.ok(source.includes('const isVideoUrl = (src: string) => /\\.(mp4|m4v|mov|webm|ogv|ogg)(?:[?#].*)?$/i.test(src)'));
  assert.ok(source.includes('const kind = isVideoFile(file) ? "video" : "image"'));
  assert.ok(source.includes("kind: isVideoUrl(src) ? 'video' : 'image'"));
});
