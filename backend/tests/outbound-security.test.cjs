const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const dns = require('node:dns');
const { safeGet, safeFetchPolicy, readLimitedBody } = require('../dist/utils/safe-fetch');
let first, second, url, other, received;
before(async () => {
  safeFetchPolicy.allowPrivateNetworks = true; safeFetchPolicy.allowAnyPort = true;
  second = http.createServer((req, res) => { received = req.headers; res.end('fixture'); });
  await new Promise(resolve => second.listen(0, '127.0.0.1', resolve));
  other = `http://127.0.0.1:${second.address().port}`;
  first = http.createServer((req, res) => {
    if (req.url === '/slow') {
      res.writeHead(200); res.write('a');
      const interval = setInterval(() => res.write('a'), 20);
      res.on('close', () => clearInterval(interval)); return;
    }
    if (req.url === '/oversized') { res.setHeader('Content-Length', '1000000'); res.end('fixture'); return; }
    res.writeHead(302, { location: `${other}/target` }); res.end();
  });
  await new Promise(resolve => first.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${first.address().port}`;
});
after(async () => {
  safeFetchPolicy.allowPrivateNetworks = false; safeFetchPolicy.allowAnyPort = false;
  for (const server of [first, second]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('cross-origin redirect never receives authorization, cookies or custom sensitive headers', async () => {
  const result = await safeGet(`${url}/redirect`, { headers: { Authorization: 'Bearer fixture', Cookie: 'private=fixture', 'X-Private-Token': 'fixture' } });
  assert.equal((await readLimitedBody(result.response, 100)).toString(), 'fixture');
  for (const name of ['authorization', 'cookie', 'x-private-token']) assert.equal(received[name], undefined);
});
test('slow-trickle responses hit the wall-clock deadline instead of occupying a request forever', async () => {
  const start = Date.now();
  const { response } = await safeGet(`${url}/slow`, { timeoutMs: 120 });
  await assert.rejects(() => readLimitedBody(response, 100000));
  assert.ok(Date.now() - start < 1500);
});
test('declared oversized responses are refused before buffering the body', async () => {
  const { response } = await safeGet(`${url}/oversized`);
  await assert.rejects(() => readLimitedBody(response, 100), /limite/);
});
test('DNS answers resolving to private addresses are denied at connection time', async () => {
  safeFetchPolicy.allowPrivateNetworks = false;
  const original = dns.lookup;
  dns.lookup = (_host, _options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]);
  try { await assert.rejects(() => safeGet(`http://fixture.invalid:${first.address().port}/`), /rede privada/); }
  finally { dns.lookup = original; safeFetchPolicy.allowPrivateNetworks = true; }
});
