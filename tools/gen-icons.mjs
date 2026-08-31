/**
 * Gerador de icones PNG, sem dependencias.
 *
 * Escreve o PNG na mao (chunks IHDR/IDAT/IEND, filtro 0, deflate via node:zlib).
 * Vale as ~70 linhas: evita adicionar sharp/canvas ao projeto so para produzir
 * quatro arquivos que nunca mais mudam — e, neste ambiente Windows, qualquer
 * pacote com binario nativo seria bloqueado pelo Smart App Control.
 *
 * Arte: fundo escuro, um anel (a boca/o "O" de Oratorius) e barras de waveform.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [13, 17, 23];
const ACCENT = [76, 154, 255];
const LIGHT = [230, 237, 243];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {Uint8Array} rgb pixels RGB, size*size*3 */
function encodePng(rgb, size) {
  const stride = size * 3;
  // Cada linha e prefixada pelo byte de filtro (0 = sem filtro).
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // profundidade de bits
  ihdr[9] = 2;   // tipo de cor: truecolor RGB
  ihdr[10] = 0;  // compressao deflate
  ihdr[11] = 0;  // filtro adaptativo
  ihdr[12] = 0;  // sem entrelacamento

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * @param {number} size
 * @param {boolean} maskable Icone maskable precisa da arte dentro da zona segura
 *   (80% central), senao o iOS/Android corta as bordas ao aplicar a mascara.
 */
function drawIcon(size, maskable) {
  const px = new Uint8Array(size * size * 3);
  const cx = size / 2;
  const cy = size / 2;
  const art = maskable ? 0.62 : 0.78;   // fracao do lado ocupada pela arte

  const ringOuter = (size * art) / 2;
  const ringWidth = size * (maskable ? 0.052 : 0.062);
  const ringInner = ringOuter - ringWidth;

  // Barras de waveform: alturas fixas, escolhidas para parecer fala e nao ruido.
  const heights = [0.30, 0.62, 0.95, 0.48, 0.78, 0.36];
  const barW = size * 0.036;
  const barGap = size * 0.028;
  const totalW = heights.length * barW + (heights.length - 1) * barGap;
  const barStart = cx - totalW / 2;
  const maxBarH = ringInner * 1.28;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Fundo com leve gradiente diagonal — evita o aspecto chapado.
      const t = (x / size) * 0.5 + (y / size) * 0.5;
      let color = mix(BG, [22, 29, 40], t);

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Anel.
      if (dist <= ringOuter && dist >= ringInner) {
        const angle = Math.atan2(dy, dx);
        // Clareia o anel de cima para baixo, dando volume.
        color = mix(ACCENT, LIGHT, Math.max(0, Math.min(1, (Math.sin(angle) + 1) / 2 * 0.45)));
      }

      // Barras (desenhadas por cima, so dentro do anel).
      if (dist < ringInner) {
        for (let b = 0; b < heights.length; b++) {
          const bx = barStart + b * (barW + barGap);
          if (x >= bx && x < bx + barW) {
            const half = (heights[b] * maxBarH) / 2;
            if (y >= cy - half && y <= cy + half) {
              color = b % 2 === 0 ? LIGHT : ACCENT;
            }
          }
        }
      }

      const i = (y * size + x) * 3;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
    }
  }
  return encodePng(px, size);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-180.png', 180, false],
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];

for (const [name, size, maskable] of targets) {
  const png = drawIcon(size, maskable);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`  ${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
console.log(`\nIcones gerados em public/icons/`);
