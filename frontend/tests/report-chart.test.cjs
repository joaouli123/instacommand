const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/report-chart.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, Intl, Date }; vm.runInNewContext(compiled, context);
const { groupChartRows, fillChartGaps, reportDay, reportCsv, mediaLabel, reportFormat } = context.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const series = [{ key: 'views', aggregation: 'sum' }, { key: 'followers', aggregation: 'last' }];

test('weekly and monthly charts sum flows but keep the latest follower snapshot', () => {
  const rows = [{ date: '2026-09-22', views: 4, followers: 102 }, { date: '2026-09-21', views: 3, followers: 100 }];
  assert.deepEqual(plain(groupChartRows(rows, series, 'week')), [{ date: '2026-09-21', views: 7, followers: 102 }]);
  assert.deepEqual(plain(groupChartRows(rows, series, 'month')), [{ date: '2026-09-01', views: 7, followers: 102 }]);
});
test('missing metrics stay null while genuine zero stays zero', () => {
  const rows = [{ date: '2026-09-21', views: 0, followers: null }, { date: '2026-09-23', views: null, followers: null }];
  assert.deepEqual(plain(fillChartGaps(rows, series))[1], { date: '2026-09-22', views: null, followers: null });
  assert.deepEqual(plain(groupChartRows(rows, series, 'week')), [{ date: '2026-09-21', views: 0, followers: null }]);
});
test('daily grouping sorts input and does not mutate it', () => {
  const rows = [{ date: '2026-09-23', views: 2 }, { date: '2026-09-21', views: 1 }];
  assert.equal(groupChartRows(rows, series, 'day')[0].date, '2026-09-21');
  assert.equal(rows[0].date, '2026-09-23');
});
test('publication grouping uses Sao Paulo dates, never the machine timezone', () => {
  assert.equal(reportDay('2026-09-28T01:30:00Z'), '2026-09-27');
  assert.equal(reportDay('2026-09-28'), '2026-09-28');
  assert.equal(reportDay('invalid'), '');
});
test('CSV exports guard formula injection and preserve empty metrics', () => {
  const csv = reportCsv([['@account', '=HYPERLINK("evil")', '\t+SUM(1)', null, 0]]);
  assert.match(csv, /'@account/); assert.match(csv, /'=HYPERLINK/); assert.match(csv, /'\t\+SUM/);
  assert.match(csv, /;"";"0"$/);
});
test('public media labels do not expose raw provider enum names', () => {
  assert.equal(mediaLabel('TEXT_POST'), 'Texto'); assert.equal(mediaLabel('REPOST_FACADE'), 'Republicação');
  assert.equal(mediaLabel('CAROUSEL_ALBUM'), 'Carrossel'); assert.equal(mediaLabel('unknown'), 'Publicação');
});

test('metric labels distinguish missing observations from genuine zero', () => {
  assert.equal(reportFormat(null), '—');
  assert.equal(reportFormat(undefined), '—');
  assert.equal(reportFormat(NaN), '—');
  assert.equal(reportFormat(0), '0');
});

test('interactive chart axes and zoom are direct children, not an opaque fragment', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/ReportChart.tsx'), 'utf8');
  assert.match(source, /const axes = \[/);
  assert.doesNotMatch(source, /const axes = <>/);
  assert.match(source, /<Brush key="zoom" ariaLabel=/);
  assert.match(source, /connectNulls=\{false\}/);
});
