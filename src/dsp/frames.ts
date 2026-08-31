/**
 * Utilitarios de janelamento e estatistica.
 * Tudo aqui e funcao pura sobre Float32Array — sem DOM, sem IO, testavel no Node.
 */

export const DEFAULT_FRAME_MS = 25;
export const DEFAULT_HOP_MS = 10;

export interface FrameGrid {
  frameLen: number;
  hopLen: number;
  count: number;
  /** Tempo (s) do centro do frame i. */
  timeAt(i: number): number;
}

export function frameGrid(
  numSamples: number,
  sampleRate: number,
  frameMs = DEFAULT_FRAME_MS,
  hopMs = DEFAULT_HOP_MS,
): FrameGrid {
  const frameLen = Math.max(2, Math.round((frameMs / 1000) * sampleRate));
  const hopLen = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  const count = numSamples < frameLen ? 0 : 1 + Math.floor((numSamples - frameLen) / hopLen);
  return {
    frameLen,
    hopLen,
    count,
    timeAt: (i: number) => (i * hopLen + frameLen / 2) / sampleRate,
  };
}

/** Copia o frame i para `out` (realoca se necessario). */
export function readFrame(
  x: Float32Array,
  grid: FrameGrid,
  i: number,
  out?: Float32Array,
): Float32Array {
  const dst = out && out.length === grid.frameLen ? out : new Float32Array(grid.frameLen);
  dst.set(x.subarray(i * grid.hopLen, i * grid.hopLen + grid.frameLen));
  return dst;
}

export function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

export function mean(a: ArrayLike<number>): number {
  if (a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

export function stdDev(a: ArrayLike<number>): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - m;
    s += d * d;
  }
  return Math.sqrt(s / (a.length - 1));
}

export function median(a: ArrayLike<number>): number {
  if (a.length === 0) return 0;
  const s = Array.from(a).sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(a: ArrayLike<number>, p: number): number {
  if (a.length === 0) return 0;
  const s = Array.from(a).sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, (s.length - 1) * p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** Razao entre duas frequencias, em semitons. */
export function semitones(f1: number, f2: number): number {
  if (f1 <= 0 || f2 <= 0) return 0;
  return 12 * Math.log2(f1 / f2);
}

/** Mediana movel — remove picos espurios de contornos de f0. */
export function medianFilter(a: Float32Array, k = 5): Float32Array {
  if (k < 3 || a.length < k) return Float32Array.from(a);
  const half = k >> 1;
  const out = new Float32Array(a.length);
  const buf: number[] = new Array(k);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < k; j++) {
      const idx = Math.min(a.length - 1, Math.max(0, i - half + j));
      buf[j] = a[idx];
    }
    buf.sort((x, y) => x - y);
    out[i] = buf[half];
  }
  return out;
}

/** Remove nivel DC — microfones de celular costumam trazer offset. */
export function removeDC(x: Float32Array): Float32Array {
  const m = mean(x);
  if (Math.abs(m) < 1e-7) return x;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] - m;
  return out;
}
