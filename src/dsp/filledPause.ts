/**
 * Deteccao de pausas preenchidas ("eeee", "hmmm", "aaah") SEM reconhecimento de fala.
 *
 * A ideia: um vicio de linguagem vocalizado e, acusticamente, um trecho vozeado
 * anormalmente longo em que o trato vocal para de se mover. Isso da uma assinatura
 * muito especifica e facil de medir:
 *
 *   1. vozeado (f0 detectado de forma continua)
 *   2. longo (>= 350 ms — uma vogal normal em fala corrida dura 60-150 ms)
 *   3. f0 quase plano (desvio < ~1.2 semitons)
 *   4. fluxo espectral baixo (a lingua e os labios pararam)
 *
 * Isso pega "eeee" e "hmmm" bem. NAO pega vicios lexicais como "tipo", "ne",
 * "entao" — esses dependem de transcricao (Camada 2, ADR-002). O contador exibido
 * na UI e rotulado como "alongamentos" justamente para nao prometer mais do que mede.
 */

import { semitones, stdDev } from './frames.ts';
import type { PitchTrack } from './pitch.ts';
import type { SpectralTrack } from './spectrum.ts';
import type { Segment } from './vad.ts';

export interface FilledPauseOptions {
  minDurationSec: number;
  maxF0SdSemitones: number;
  maxFlux: number;
}

export const DEFAULT_FILLED_PAUSE_OPTIONS: FilledPauseOptions = {
  minDurationSec: 0.35,
  maxF0SdSemitones: 1.2,
  maxFlux: 0.13,
};

export function detectFilledPauses(
  pitch: PitchTrack,
  spectral: SpectralTrack,
  options: Partial<FilledPauseOptions> = {},
): Segment[] {
  const opts = { ...DEFAULT_FILLED_PAUSE_OPTIONS, ...options };
  const out: Segment[] = [];
  if (pitch.f0.length === 0) return out;

  // Agrupa frames vozeados contiguos.
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < pitch.f0.length; i++) {
    const voiced = pitch.f0[i] > 0;
    if (voiced && start < 0) start = i;
    if (!voiced && start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, pitch.f0.length - 1]);

  for (const [a, b] of runs) {
    const startSec = pitch.times[a];
    const endSec = pitch.times[b];
    const durationSec = endSec - startSec;
    if (durationSec < opts.minDurationSec) continue;

    // Estabilidade de f0, medida em semitons em torno da mediana do trecho.
    const values: number[] = [];
    for (let i = a; i <= b; i++) values.push(pitch.f0[i]);
    const ref = values.reduce((s, v) => s + v, 0) / values.length;
    const cents = values.map((v) => semitones(v, ref));
    if (stdDev(cents) > opts.maxF0SdSemitones) continue;

    // Imobilidade articulatoria.
    let fluxSum = 0;
    let fluxN = 0;
    for (let i = 0; i < spectral.times.length; i++) {
      if (spectral.times[i] >= startSec && spectral.times[i] <= endSec) {
        fluxSum += spectral.flux[i];
        fluxN++;
      }
    }
    if (fluxN === 0) continue;
    if (fluxSum / fluxN > opts.maxFlux) continue;

    out.push({ startSec, endSec, durationSec });
  }

  return out;
}
