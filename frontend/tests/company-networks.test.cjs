const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

test('the dashboard shows every network of the selected company from the company summary', () => {
  const dashboard = read('components/dashboard/DashboardPage.tsx');
  assert.match(dashboard, /<CompanyNetworks accountId=\{accountId\}\/>/);
  const networks = read('components/dashboard/CompanyNetworks.tsx');
  assert.match(networks, /\/analytics\/company\/\$\{encodeURIComponent\(accountId\)\}\/summary\?days=\$\{days\}/);
  assert.match(networks, /summary\.missing\.map/);
});

test('Analytics has a YouTube tab limited to the company channels', () => {
  const page = read('app/analytics/page.tsx');
  assert.match(page, /const TABS = \["instagram", "facebook", "threads", "x", "youtube"\]/);
  assert.match(page, /<TabsContent value="youtube"><YouTubeReport \/><\/TabsContent>/);
  const report = read('components/dashboard/YouTubeReport.tsx');
  assert.match(report, /youtube: channels/);
  assert.match(report, /\/auth\/youtube\/url\?workspace=\$\{encodeURIComponent\(companyId\)\}/);
  assert.match(report, /inverted: true/);
});

test('the PDF report includes the company YouTube channel', () => {
  const page = read('app/report/page.tsx');
  assert.match(page, /YOUTUBE: true/);
  assert.match(page, /const youtubeId = ofCompany\(youtubeAccountsQuery\.data\?\.accounts, id\)\[0\]\?\.id \|\| ""/);
  assert.match(page, /<YouTubeSection data=\{yt\.data\}/);
  assert.match(read('lib/report-text.ts'), /pelo YouTube/);
});
