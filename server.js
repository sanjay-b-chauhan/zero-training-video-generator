#!/usr/bin/env node
/* eslint-disable no-console */
//
// zero · video generator — local dev server
//
// Two jobs in one Node process:
//
//   1. Serve the static dashboard files (index.html, app.js, lib/*, mock-assets/*).
//      Same job python's http.server was doing. We keep doing it the same way.
//
//   2. Proxy Ollama Cloud calls. Browser-direct fetch to ollama.com fails with
//      "Failed to fetch" because Ollama doesn't send CORS headers permitting
//      browser origins. So the dashboard's scriptGenerator hits
//      `/api/proxy/ollama/v1/chat/completions` here, and we forward it
//      server-side to `https://ollama.com/v1/chat/completions` with the same
//      headers + body. The Authorization header (carrying the user's API key)
//      passes through untouched. The response streams straight back.
//
//      The key NEVER leaves this user's machine. We're not a hosted backend —
//      this is just a local CORS unblocker.
//
// Usage:
//   node server.js [--port 8000]
//
// Requires Node 18+ for built-in fetch.

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = +(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || process.env.PORT || 8000);
const ROOT = __dirname;

// MIME table — kept short. Browsers infer most things from extension; we just
// need to make sure JS modules + mp3 + html + css come through correctly.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.mp3':  'audio/mpeg',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const PROXIES = {
  // Map a /api/proxy/<key>/<rest...> URL onto a target origin. Add more
  // here if other providers also have CORS issues.
  ollama: 'https://ollama.com',
};

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url);
    const pathname = decodeURIComponent(parsed.pathname || '/');

    // ---- proxy paths ---------------------------------------------------
    const proxyMatch = pathname.match(/^\/api\/proxy\/([^/]+)(\/.*)?$/);
    if (proxyMatch) {
      const [, key, rest = ''] = proxyMatch;
      const target = PROXIES[key];
      if (!target) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end(`Unknown proxy target: ${key}`);
      }
      // CORS preflight — answer locally, no need to bother upstream.
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin':  '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS, PUT, DELETE',
          'access-control-max-age':       '86400',
        });
        return res.end();
      }
      return await proxy(req, res, target + rest + (parsed.search || ''));
    }

    // ---- static paths --------------------------------------------------
    let p = pathname === '/' ? '/index.html' : pathname;

    // Refuse traversal. path.normalize won't catch percent-encoded ".." once
    // we've already decoded, so check after joining.
    const filePath = path.join(ROOT, p);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); return res.end('forbidden');
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end(`Not found: ${pathname}`);
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (err) {
    console.error('server error:', err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(`Server error: ${err.message}`);
  }
});

// ---- proxy implementation ----------------------------------------------
//
// Buffer the request body, forward it to the target with the original
// headers (minus host), then write the upstream response back. We strip
// `host` so the upstream doesn't get confused, and add CORS headers on
// the way out so the browser is happy.
async function proxy(req, res, target) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);

  const fwdHeaders = { ...req.headers };
  delete fwdHeaders.host;
  delete fwdHeaders['content-length'];     // recomputed by fetch
  delete fwdHeaders.connection;

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: fwdHeaders,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
  } catch (err) {
    console.error('proxy fetch failed:', target, err.message);
    res.writeHead(502, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: `Upstream unreachable: ${err.message}` }));
  }

  const respHeaders = {};
  upstream.headers.forEach((v, k) => {
    // Strip headers that fetch sets automatically + CORS controls we want
    // to override. Keep content-type, content-encoding, etc.
    if (['content-encoding', 'transfer-encoding', 'content-length'].includes(k.toLowerCase())) return;
    respHeaders[k] = v;
  });
  respHeaders['access-control-allow-origin']  = '*';
  respHeaders['access-control-allow-headers'] = '*';
  respHeaders['access-control-allow-methods'] = 'GET, POST, OPTIONS, PUT, DELETE';

  res.writeHead(upstream.status, respHeaders);
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.end(buf);
}

// CORS preflight handling for the proxy paths
server.on('request', () => {/* handled inline above */});

server.listen(PORT, () => {
  const reset = '\x1b[0m', dim = '\x1b[2m', green = '\x1b[32m', bold = '\x1b[1m';
  console.log('');
  console.log(`  ${bold}zero · video generator${reset}`);
  console.log(`  ${dim}local server + ollama proxy${reset}`);
  console.log('');
  console.log(`  ${green}URL:${reset}     http://localhost:${PORT}`);
  console.log(`  ${green}Proxy:${reset}   /api/proxy/ollama/* → https://ollama.com/*`);
  console.log('');
  console.log(`  ${dim}Stop with Ctrl+C${reset}`);
  console.log('');
});
