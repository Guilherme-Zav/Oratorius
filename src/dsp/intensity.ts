/**
 * Envelope de intensidade.
 *
 * ATENCAO: os valores sao dBFS (relativos ao fundo de escala digital), NAO dB SPL.
 * Sem calibracao com sonometro nao existe volume absoluto. Por isso o app so usa
 * intensidade de forma *relativa*: variacao dentro de uma mesma gravacao, ou
 * comparacao entre gravacoes feitas na mesma distancia do microfone.
 */

export interface IntensityTrack {
  /** dBFS por frame. -100 representa silencio digital. */
  db: Float32Array;
  rms: Float32Array;
  times: Float32Array;
  hopMs: number;
}

export const DB_FLOOR = -100;

export function toDb(rms: number): number {
  return rms <= 1e-10 ? DB_FLOOR : Math.max(DB_FLOOR, 20 * Math.log10(rms));
}

export function trackIntensity(
  x: Float32Array,
  sampleRate: number,
  frameMs = 25,
  hopMs = 10,
): IntensityTrack {
  const frameLen = Math.max(1, Math.round((frameMs / 1000) * sampleRate));
  const hopLen = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  const count = x.length < frameLen ? 0 : 1 + Math.floor((x.length - frameLen) / hopLen);

  const rms = new Float32Array(count);
  const db = new Float32Array(count);
  const times = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const start = i * hopLen;
    let s = 0;
    for (let j = 0; j < frameLen; j++) {
      const v = x[start + j];
      s += v * v;
    }
    const r = Math.sqrt(s / frameLen);
    rms[i] = r;
    db[i] = toDb(r);
    times[i] = (start + frameLen / 2) / sampleRate;
  }

  return { db, rms, times, hopMs };
}

/** Pico absoluto em dBFS — usado para detectar clipping. */
export function peakDb(x: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
  }
  return toDb(peak);
}

/** Fracao de amostras saturadas. Acima de ~0.1% o sinal ja nao serve para medir. */
export function clippingRatio(x: Float32Array, threshold = 0.995): number {
  if (x.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= threshold) n++;
  return n / x.length;
}

/**
 * Piso de ruido estimado como o percentil 10 do envelope. Robusto: assume que ao
 * menos 10% da gravacao e silencio, o que vale para qualquer enunciado real.
 */
export function estimateNoiseFloorDb(track: IntensityTrack): number {
  if (track.db.length === 0) return DB_FLOOR;
  const sorted = Array.from(track.db).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.1)];
}
