const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');
const instagramReelStart = source.indexOf('if (isInstagram && postType === "REEL")');
const facebookReelStart = source.indexOf('if (isFacebook && postType === "REEL")');
const threadsPreviewStart = source.indexOf('if (!isInstagram && !isFacebook)');
const instagramReel = source.slice(instagramReelStart, facebookReelStart);
const facebookReel = source.slice(facebookReelStart, threadsPreviewStart);

test('Instagram and Facebook Reels use a larger official 9:16 stage without phone chrome', () => {
  assert.match(source, /data-preview="instagram-reel"[^\n]*aspect-\[9\/16\][^\n]*max-w-\[340px\]/);
  assert.match(source, /data-preview="facebook-reel"/);
  assert.match(source, /data-preview="facebook-reel"[^\n]*aspect-\[9\/16\][^\n]*max-w-\[340px\]/);
  assert.doesNotMatch(instagramReel, /9:41|RiSignalWifiLine|Navegação do Instagram/);
  assert.doesNotMatch(facebookReel, /9:41|RiSignalWifiLine|Adicione um comentário|<footer/);
  assert.match(instagramReel, /Ações do Reel[^\n]*right-2[^\n]*gap-2\.5/);
  assert.match(facebookReel, /Ações do Facebook Reel[^\n]*right-2[^\n]*gap-2\.5/);
  assert.match(instagramReel, /ring compact/);
  assert.match(facebookReel, /facebook compact/);
});

test('Facebook Reels and Stories retain distinct platform previews and relevant icons', () => {
  assert.match(source, /aria-label="Prévia de Facebook Reels"/);
  assert.match(source, /aria-label="Navegação do Facebook Reels"/);
  assert.match(source, /aria-label="Ações do Facebook Reel"/);
  assert.match(source, /RiThumbUpLine/);
  assert.match(source, /RiBookmarkLine/);
  assert.match(source, /RiMusic2Line/);
  assert.match(source, /data-preview="facebook-story"/);
  assert.match(source, /data-preview="facebook-story"[^\n]*aspect-\[9\/16\][^\n]*max-w-\[340px\]/);
  assert.match(source, /aria-label="Prévia visual de Facebook Stories"/);
  assert.match(source, /Enviar mensagem\.\.\./);
  assert.match(source, /Reagir com coração/);
  assert.match(source, /Reagir com curtir/);
});

test('Instagram and Facebook Stories use a larger 9:16 canvas without phone status bars and with compact bottom controls', () => {
  const instagramStoryStart = source.indexOf('if (isInstagram && postType === "STORY")');
  const facebookStoryStart = source.indexOf('if (isFacebook && postType === "STORY")');
  const instagramReelStart = source.indexOf('if (isInstagram && postType === "REEL")');
  const instagramStory = source.slice(instagramStoryStart, facebookStoryStart);
  const facebookStory = source.slice(facebookStoryStart, instagramReelStart);

  assert.match(instagramStory, /data-preview="instagram-story"[^\n]*aspect-\[9\/16\][^\n]*max-w-\[340px\]/);
  assert.match(facebookStory, /data-preview="facebook-story"[^\n]*aspect-\[9\/16\][^\n]*max-w-\[340px\]/);
  assert.match(instagramStory, /<header className="absolute inset-x-3 top-5/);
  for (const story of [instagramStory, facebookStory]) {
    assert.doesNotMatch(story, /9:41|RiSignalWifiLine|RiWifiLine|RiBatteryLine/);
    assert.match(story, /compact/);
    assert.match(story, /bottom-2\.5/);
  }
  assert.match(instagramStory, /h-8 min-w-0 flex-1[^\n]*Responder/);
  assert.match(instagramStory, /RiHeartLine size=\{19\}/);
  assert.match(facebookStory, /h-8 min-w-0 flex-1[^\n]*Enviar mensagem/);
  assert.match(facebookStory, /h-8 w-8 shrink-0/);
});

test('Facebook Stories can be previewed but remain unavailable as a publishing destination', () => {
  assert.match(source, /STORY: \["INSTAGRAM"\]/);
  assert.match(source, /Facebook \(prévia visual\)/);
  assert.match(source, /Apenas prévia visual\. Facebook Stories não está habilitado para publicação neste compositor\./);
});

test('Selected platform format details expand to use the available horizontal space', () => {
  assert.match(source, /grid gap-2 sm:grid-cols-\[repeat\(auto-fit,minmax\(260px,1fr\)\)\]/);
  assert.match(source, /grid min-w-0 grid-cols-2 content-start gap-x-4/);
});
