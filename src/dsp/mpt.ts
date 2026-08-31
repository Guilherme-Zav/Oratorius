/**
 * Tempo Maximo de Fonacao (TMF) — quanto tempo voce sustenta um /a/ (ou /s/)
 * numa unica expiracao. E a medida mais simples e mais util de apoio respiratorio,
 * e a base de qualquer trabalho de projecao vocal.
 *
 * Referencia grosseira para adultos: 15-25 s. Abaixo de ~10 s costuma indicar
 * apoio respiratorio insuficiente — o que e treinavel, e e justamente o alvo da
 * trilha D do app.
 */

import { mean, semitones, stdDev } from './frames.ts';
import type { PitchTrack } from './pitch.ts';
import type { IntensityTrack } from './intensity.ts';

export interface MptResult {
  /** Duracao (s) da fonacao continua mais longa. */
  seconds: number;
  startSec: number;
  endSec: number;
  /** Estabilidade do tom durante a sustentacao (desvio em semitons). */
  f0SdSemitones: number;
  meanF0: number;
  /** Queda de intensidade entre o primeiro e o ultimo terco (dB). Alta = perda de apoio. */
  decayDb: number;
  /** Fracao inicial da sustentacao com intensidade estavel — o "trecho aproveitavel". */
  steadyRatio: number;
}

export const EMPTY_MPT: MptResult = {
  seconds: 0, startSec: 0, endSec: 0, f0SdSemitones: 0, meanF0: 0, decayDb: 0, steadyRatio: 0,
};

/**
 * @param maxGapSec Tolerancia a falhas momentaneas do detector de f0. Sem ela,
 * um unico frame perdido no meio de um /a/ de 18 s cortaria a medida ao meio.
 */
export function analyzeMpt(
  pitch: PitchTrack,
  intensity: IntensityTrack,
  maxGapSec = 0.12,
): MptResult {
  if (pitch.f0.length === 0) return EMPTY_MPT;
  const hop = pitch.hopMs / 1000;
  const maxGapFrames = Math.max(1, Math.round(maxGapSec / hop));

  let bestStart = -1, bestEnd = -1, bestLen = 0;
  let start = -1, gap = 0;

  for (let i = 0; i < pitch.f0.length; i++) {
    if (pitch.f0[i] > 0) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap > maxGapFrames) {
        const end = i - gap;
        if (end - start > bestLen) {
          bestLen = end - start;
          bestStart = start;
          bestEnd = end;
        }
        start = -1;
        gap = 0;
      }
    }
  }
  if (start >= 0) {
    const end = pitch.f0.length - 1 - gap;
    if (end - start > bestLen) {
      bestLen = end - start;
      bestStart = start;
      bestEnd = end;
    }
  }

  if (bestStart < 0 || bestLen <= 0) return EMPTY_MPT;

  const startSec = pitch.times[bestStart];
  const endSec = pitch.times[Math.min(bestEnd, pitch.times.length - 1)];
  const seconds = Math.max(0, endSec - startSec);

  const f0s: number[] = [];
  for (let i = bestStart; i <= bestEnd && i < pitch.f0.length; i++) {
    if (pitch.f0[i] > 0) f0s.push(pitch.f0[i]);
  }
  const meanF0 = f0s.length ? mean(f0s) : 0;
  const f0SdSemitones = f0s.length > 1 ? stdDev(f0s.map((v) => semitones(v, meanF0))) : 0;

  // Decaimento: primeiro terco vs. ultimo terco do envelope dentro da sustentacao.
  const inRange: number[] = [];
  for (let i = 0; i < intensity.times.length; i++) {
    if (intensity.times[i] >= startSec && intensity.times[i] <= endSec) inRange.push(intensity.db[i]);
  }
  let decayDb = 0;
  if (inRange.length >= 6) {
    const third = Math.floor(inRange.length / 3);
    decayDb = mean(inRange.slice(0, third)) - mean(inRange.slice(-third));
  }

  // Trecho estavel: enquanto a intensidade nao cair mais de 6 dB do pico inicial.
  let steadyRatio = 1;
  if (inRange.length >= 6) {
    const reference = mean(inRange.slice(0, Math.max(3, Math.floor(inRange.length / 10))));
    let i = 0;
    while (i < inRange.length && inRange[i] > reference - 6) i++;
    steadyRatio = i / inRange.length;
  }

  return { seconds, startSec, endSec, f0SdSemitones, meanF0, decayDb, steadyRatio };
}
