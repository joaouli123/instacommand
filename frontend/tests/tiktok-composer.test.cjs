const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

test('TikTok options follow the Direct Post rules: fresh creator info, no default privacy, interactions off, disclosure and consent', () => {
  const options = read('components/composer/TikTokOptions.tsx');
  assert.match(options, /staleTime: 0, gcTime: 0, retry: false, refetchOnMount: "always"/);
  assert.match(options, /<option value="" disabled>\{t\("Selecione"\)\}<\/option>/);
  assert.match(options, /privacyLevel: null, allowComment: false, allowDuet: false, allowStitch: false/);
  assert.match(options, /disabled=\{creator\.commentDisabled\}/);
  assert.match(options, /const blocked = option === "SELF_ONLY" && settings\.brandedContent/);
  assert.match(options, /Declaração de Uso de Música/);
  assert.match(options, /Política de Conteúdo de Marca/);
  assert.match(options, /O vídeo será identificado como/);
  assert.match(options, /Publicar como \{name\}", \{ name: creator\.nickname \}/);
});

test('the composer offers TikTok only with the company profile and blocks publishing until the TikTok rules pass', () => {
  const composer = read('app/composer/page.tsx');
  assert.match(composer, /const tiktokAccounts = ofCompany\(allTikTokAccounts, accountId\)/);
  assert.match(composer, /tiktokProblem\(tiktokSettings, tiktokCreator\.data, mediaItems\[0\] \?\? null\)/);
  assert.match(composer, /tiktokAccountId: platforms\.includes\("TIKTOK"\) \? selectedTikTokAccount\?\.id : undefined/);
  assert.match(read('lib/publish-compat.ts'), /REEL: \["INSTAGRAM", "FACEBOOK", "THREADS", "X", "YOUTUBE", "TIKTOK"\]/);
  assert.match(read('components/preview/SocialPostPreview.tsx'), /if \(previewPlatform === "TIKTOK"\) return <TikTokPreview/);
  assert.match(read('app/analytics/page.tsx'), /<TabsContent value="tiktok"><TikTokReport \/><\/TabsContent>/);
  assert.match(read('app/accounts/page.tsx'), /\/auth\/tiktok\/url\?workspace=/);
});
