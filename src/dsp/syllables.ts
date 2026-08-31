/**
 * Deteccao de nucleos silabicos, no espirito do metodo de De Jong & Wempe (2009):
 * um nucleo e um pico do envelope de intensidade que (a) esta acima do limiar de
 * fala, (b) e separado dos picos vizinhos por um vale suficientemente profundo e
 * (c) e vozeado.
 *
 * O criterio do vale e o que impede contar duas vezes a mesma vogal quando o
 * envelope oscila, e o criterio de vozeamento e o que impede contar fricativas
 * ruidosas (/s/, /f/) como silabas.
 */

import type { IntensityTrack } from './intensity.ts';
import type { PitchTrack } from './pitch.ts';
import type { Segment } from './vad.ts';

export interface SyllableResult {
  /** Instante (s) de cada nucleo detectado. */
  nuclei: number[];
  count: number;
  /** Silabas por segundo sobre a duracao total (inclui pausas). */
  speechRate: number;
  /** Silabas por segundo sobre o tempo de fonacao (exclui pausas). */
  articulationRate: number;
}

export interface SyllableOptions {
  /** Profundidade minima do vale entre dois picos, em dB. */
  dipDb: number;
  /** Distancia minima entre nucleos — 100 ms ~ 10 silabas/s, o teto humano. */
  minDistanceSec: number;
  /** Suavizacao do envelope antes da busca de picos. */
  smoothFrames: number;
}

export const DEFAULT_SYLLABLE_OPTIONS: SyllableOptions = {
  dipDb: 2,
  minDistanceSec: 0.1,
  smoothFrames: 5,
};

function smooth(a: Float32Array, k: number): Float32Array {
  if (k < 2) return a;
  const out = new Float32Array(a.length);
  const half = k >> 1;
  for (let i = 0; i < a.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= a.length) continue;
      sum += a[j];
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

function isVoicedAt(pitch: PitchTrack | null, timeSec: number, toleranceSec = 0.03): boolean {
  if (!pitch || pitch.f0.length === 0) return true; // sem pista de pitch, nao filtra
  for (let i = 0; i < pitch.f0.length; i++) {
    if (Math.abs(pitch.times[i] - timeSec) <= toleranceSec && pitch.f0[i] > 0) return true;
  }
  return false;
}

export function detectSyllables(
  intensity: IntensityTrack,
  pitch: PitchTrack | null,
  thresholdDb: number,
  totalSec: number,
  speechSegments: Segment[],
  options: Partial<SyllableOptions> = {},
): SyllableResult {
  const opts = { ...DEFAULT_SYLLABLE_OPTIONS, ...options };
  const env = smooth(intensity.db, opts.smoothFrames);
  const hop = intensity.hopMs / 1000;
  const minDistFrames = Math.max(1, Math.round(opts.minDistanceSec / hop));

  // Picos locais acima do limiar de fala.
  const peaks: number[] = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] <= thresholdDb) continue;
    if (env[i] >= env[i - 1] && env[i] > env[i + 1]) peaks.push(i);
  }

  // Filtro do vale: mantem um pico apenas se houver queda de `dipDb` entre ele e
  // o pico aceito anterior. Se nao houver, fica o mais alto dos dois.
  const kept: number[] = [];
  for (const p of peaks) {
    if (kept.length === 0) {
      kept.push(p);
      continue;
    }
    const prev = kept[kept.length - 1];
    let valley = Infinity;
    for (let i = prev; i <= p; i++) valley = Math.min(valley, env[i]);
    const dip = Math.min(env[prev], env[p]) - valley;
    if (dip >= opts.dipDb && p - prev >= minDistFrames) {
      kept.push(p);
    } else if (env[p] > env[prev]) {
      kept[kept.length - 1] = p;
    }
  }

  const nuclei = kept
    .map((i) => intensity.times[i])
    .filter((t) => isVoicedAt(pitch, t));

  const speechTotal = speechSegments.reduce((a, s) => a + s.durationSec, 0);
  return {
    nuclei,
    count: nuclei.length,
    speechRate: totalSec > 0 ? nuclei.length / totalSec : 0,
    articulationRate: speechTotal > 0 ? nuclei.length / speechTotal : 0,
  };
}
