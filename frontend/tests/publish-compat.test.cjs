const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/publish-compat.ts'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports, require);
const { publishProblems, incompatiblePlatforms, acceptedKinds } = mod.exports;

const ALL = ['INSTAGRAM', 'FACEBOOK', 'THREADS', 'X', 'YOUTUBE'];
const photo = { kind: 'image', width: 1080, height: 1350 };
const video = (duration, width = 1920, height = 1080) => ({ kind: 'video', width, height, duration });
const check = (format, platforms, media, youtubeFormat) => publishProblems({ format, platforms, media, youtubeFormat });

test('all networks with a photo: only YouTube is left out, with a clear reason', () => {
  assert.deepEqual(incompatiblePlatforms('FEED', ALL), ['YOUTUBE']);
  const problems = check('FEED', ALL, [photo]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /YouTube só publica vídeos/);
  assert.deepEqual(check('FEED', ALL.filter(p => p !== 'YOUTUBE'), [photo]), []);
});

test('all networks with a short horizontal video: every network takes it', () => {
  assert.deepEqual(check('REEL', ALL, [video(60)], 'video'), []);
});

test('video length limits per network: X 2:20, Threads 5 min, Instagram Reels 3 s to 15 min', () => {
  assert.match(check('REEL', ALL, [video(200)], 'video').join('\n'), /X aceita vídeos de até 2 min 20 s/);
  const long = check('REEL', ALL, [video(400)], 'video').join('\n');
  assert.match(long, /X aceita/);
  assert.match(long, /Threads aceita vídeos de até 5 minutos/);
  assert.doesNotMatch(long, /Instagram/);
  assert.match(check('REEL', ['INSTAGRAM'], [video(2)]).join('\n'), /pelo menos 3 segundos/);
  assert.match(check('REEL', ['INSTAGRAM'], [video(960)]).join('\n'), /até 15 minutos/);
  assert.deepEqual(check('REEL', ['YOUTUBE', 'FACEBOOK'], [video(3600)], 'video'), []);
});

test('Stories, text posts and photos keep the networks that cannot take them out', () => {
  assert.deepEqual(incompatiblePlatforms('STORY', ALL), ['FACEBOOK', 'THREADS', 'X', 'YOUTUBE']);
  assert.match(check('STORY', ['INSTAGRAM', 'X'], [photo])[0], /Stories só são publicados no Instagram/);
  assert.match(check('STORY', ['INSTAGRAM'], [video(90, 1080, 1920)]).join('\n'), /até 60 segundos/);
  assert.deepEqual(incompatiblePlatforms('TEXT', ALL), ['INSTAGRAM', 'FACEBOOK', 'YOUTUBE']);
  assert.match(check('TEXT', ['THREADS'], [photo]).join('\n'), /não leva fotos nem vídeos/);
  assert.deepEqual(check('TEXT', ['THREADS', 'X'], []), []);
});

test('carousel rules: Facebook albums are photos only, X takes 4 images or 1 video', () => {
  assert.match(check('CAROUSEL', ['INSTAGRAM', 'FACEBOOK'], [photo, video(20, 1080, 1350)]).join('\n'), /álbum aceita só fotos/);
  assert.deepEqual(check('CAROUSEL', ['INSTAGRAM'], [photo, video(20, 1080, 1350)]), []);
  assert.match(check('CAROUSEL', ['X'], [photo, photo, photo, photo, photo]).join('\n'), /até 4 mídias/);
  assert.match(check('CAROUSEL', ['X'], [photo, video(20)]).join('\n'), /não os dois juntos/);
  assert.match(check('CAROUSEL', ['INSTAGRAM'], [photo]).join('\n'), /pelo menos 2/);
});

test('format and media must match: photo formats refuse video and the video format refuses photos', () => {
  assert.match(check('FEED', ['INSTAGRAM'], [video(20)]).join('\n'), /Foto única aceita só imagem/);
  assert.match(check('REEL', ['INSTAGRAM'], [photo]).join('\n'), /único arquivo de vídeo/);
  assert.match(check('FEED', ['INSTAGRAM'], []).join('\n'), /Adicione a mídia/);
  assert.deepEqual(check('FEED', ['THREADS', 'X'], []), []);
  assert.deepEqual(acceptedKinds('REEL', ALL), ['video']);
  assert.deepEqual(acceptedKinds('FEED', ALL), ['image']);
  assert.deepEqual(acceptedKinds('CAROUSEL', ['INSTAGRAM', 'FACEBOOK']), ['image']);
  assert.deepEqual(acceptedKinds('CAROUSEL', ['INSTAGRAM']), ['image', 'video']);
});

test('a YouTube Short must be vertical or square and up to 3 minutes', () => {
  assert.match(check('REEL', ['YOUTUBE'], [video(30)], 'short').join('\n'), /horizontal/);
  assert.match(check('REEL', ['YOUTUBE'], [video(240, 1080, 1920)], 'short').join('\n'), /Shorts vão até 3 minutos/);
  assert.deepEqual(check('REEL', ['YOUTUBE', 'INSTAGRAM'], [video(45, 1080, 1920)], 'short'), []);
  assert.deepEqual(check('REEL', ['YOUTUBE'], [video(240, 1080, 1920)], 'video'), []);
});

test('nothing selected asks for a network first', () => {
  assert.deepEqual(check('FEED', [], [photo]), ['Selecione pelo menos uma rede para publicar.']);
});
