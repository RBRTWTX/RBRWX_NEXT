import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fetchWithCors, providerOrigins } from './provider-http.mjs';

test('origins follow development URL and Windows scheme configuration', () => {
  assert.deepEqual(providerOrigins({ build: { devUrl: 'http://localhost:1420/path' }, app: { windows: [{}] } }),
    ['http://localhost:1420', 'http://tauri.localhost']);
  assert.deepEqual(providerOrigins({ build: { devUrl: 'http://localhost:1420' }, app: { windows: [{ useHttpsScheme: true }] } }),
    ['http://localhost:1420', 'https://tauri.localhost']);
});

test('real HTTP probe accepts conditional CORS and rejects absent or wrong permissions', async () => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.headers.origin);
    const origin = req.headers.origin;
    if (req.url === '/echo' && origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.url === '/wildcard') res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/wrong') res.setHeader('Access-Control-Allow-Origin', 'https://unrelated.example');
    if (req.url === '/dev-only' && origin === 'http://localhost:1420') res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.url === '/error') res.statusCode = 503;
    res.end('{"ok":true}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const origins = ['http://localhost:1420', 'http://tauri.localhost'];
  try {
    const withoutOrigin = await fetch(`${base}/echo`);
    assert.equal(withoutOrigin.headers.get('access-control-allow-origin'), null);
    await withoutOrigin.text();
    for (const path of ['/echo', '/wildcard']) {
      seen.length = 0;
      const response = await fetchWithCors('test', base + path, 'application/json', origins);
      assert.deepEqual(await response.json(), { ok: true });
      assert.deepEqual(seen, origins);
    }
    for (const path of ['/missing', '/wrong', '/dev-only']) {
      await assert.rejects(fetchWithCors('test', base + path, 'application/json', origins), /does not allow/);
    }
    await assert.rejects(fetchWithCors('test', base + '/error', 'application/json', origins), /HTTP 503/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
