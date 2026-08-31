/**
 * Build: copia `public/` para `dist/` e verifica o resultado.
 *
 * O tsc ja emitiu os modulos ES em `dist/app/` (ver tsconfig.json). Nao ha
 * bundling nem minificacao — o Safari carrega ES modules nativamente, e para um
 * app deste tamanho o custo de rede e irrelevante frente ao ganho de nunca
 * depender de uma toolchain que pode quebrar.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');

mkdirSync(DIST, { recursive: true });

if (!existsSync(join(PUBLIC, 'icons', 'icon-180.png'))) {
  console.log('Icones ausentes — gerando…');
  await import('./gen-icons.mjs');
}

cpSync(PUBLIC, DIST, { recursive: true });

// --- verificacoes que pegam os erros silenciosos mais provaveis ---
const problems = [];

const entry = join(DIST, 'app', 'main.js');
if (!existsSync(entry)) {
  problems.push('dist/app/main.js nao existe — rode `npm run build` (o tsc precisa rodar antes).');
}

const html = existsSync(join(DIST, 'index.html'))
  ? readFileSync(join(DIST, 'index.html'), 'utf8')
  : '';
if (html && !html.includes('./app/main.js')) {
  problems.push('index.html nao aponta para ./app/main.js');
}

// Todo import relativo emitido precisa existir: um .ts nao reescrito para .js
// quebraria o app inteiro em silencio no primeiro carregamento.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

if (existsSync(join(DIST, 'app'))) {
  const files = walk(join(DIST, 'app'));
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const spec = match[1];
      if (spec.endsWith('.ts')) {
        problems.push(`${relative(DIST, file)}: import ainda aponta para .ts (${spec})`);
        continue;
      }
      const target = join(dirname(file), spec);
      if (!existsSync(target)) {
        problems.push(`${relative(DIST, file)}: import quebrado -> ${spec}`);
      }
    }
  }

  let bytes = 0;
  for (const f of files) bytes += statSync(f).size;
  console.log(`  ${files.length} modulos JS  ${(bytes / 1024).toFixed(0)} KB`);
}

for (const asset of ['index.html', 'styles.css', 'sw.js', 'manifest.webmanifest', 'worklets/pcm-recorder.js']) {
  if (!existsSync(join(DIST, asset))) problems.push(`ausente em dist/: ${asset}`);
}

if (problems.length > 0) {
  console.error('\nBuild com problemas:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log('  build ok -> dist/');
