/**
 * Servidor estatico local, sem dependencias.
 *
 * Serve `dist/` em http://localhost:5173 — que e contexto seguro, entao o
 * microfone funciona no navegador do desktop.
 *
 * ATENCAO para testar no iPhone: abrir pelo IP da rede (http://192.168.x.x) NAO
 * funciona — o Safari exige contexto seguro para o microfone, e IP em HTTP nao e.
 * Para o teste no aparelho, publique em qualquer host estatico com HTTPS
 * (instrucoes no README).
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT ?? 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8',
};

if (!existsSync(ROOT)) {
  console.error('dist/ nao existe. Rode `npm run build` primeiro.');
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // Impede escapar de dist/ com ../
  const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA: qualquer rota desconhecida cai no index.
    const fallback = join(ROOT, 'index.html');
    if (existsSync(fallback)) {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(readFileSync(fallback));
      return;
    }
    res.writeHead(404).end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream',
    // Sem cache em dev: o service worker ja e agressivo o bastante.
    'cache-control': 'no-store',
  });
  res.end(readFileSync(filePath));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Oratorius em http://localhost:${PORT}\n`);
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  rede: http://${a.address}:${PORT}  (${name})`);
      }
    }
  }
  console.log('\n  Aviso: no iPhone, o microfone SO funciona em HTTPS.');
  console.log('  Para testar no aparelho, publique em um host estatico (ver README).\n');
});
