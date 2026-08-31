/**
 * Segmentacao voz / silencio e analise de pausas.
 *
 * Limiar adaptativo em vez de fixo: o piso de ruido do quarto muda entre uma
 * gravacao e outra, e um limiar fixo classificaria um comodo silencioso inteiro
 * como fala (ou um comodo ruidoso inteiro como silencio).
 */

import type { IntensityTrack } from './intensity.ts';
import { estimateNoiseFloorDb } from './intensity.ts';
import type { PitchTrack } from './pitch.ts';

export interface Segment {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface VadResult {
  speech: Segment[];
  pauses: Segment[];
  /** Pausas internas ao enunciado (exclui silencio antes do inicio e depois do fim). */
  internalPauses: Segment[];
  noiseFloorDb: number;
  thresholdDb: number;
  speechTotalSec: number;
  pauseTotalSec: number;
  /** Fracao de frames com f0 detectado dentro dos trechos de fala. */
  voicedRatio: number;
}

export interface VadOptions {
  /** dB acima do piso de ruido para contar como fala. */
  marginDb: number;
  /** Pausas menores que isso sao oclusivas normais da fala, nao pausas reais. */
  minPauseSec: number;
  /** Trechos de fala menores que isso sao ruido transiente (clique, estalo de teclado). */
  minSpeechSec: number;
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  marginDb: 9,
  minPauseSec: 0.25,
  minSpeechSec: 0.08,
};

function mergeShortGaps(segments: Segment[], minGap: number): Segment[] {
  if (segments.length === 0) return [];
  const out: Segment[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const last = out[out.length - 1];
    const cur = segments[i];
    if (cur.startSec - last.endSec < minGap) {
      last.endSec = cur.endSec;
      last.durationSec = last.endSec - last.startSec;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export function detectVoiceActivity(
  intensity: IntensityTrack,
  pitch: PitchTrack | null,
  totalSec: number,
  options: Partial<VadOptions> = {},
): VadResult {
  const opts = { ...DEFAULT_VAD_OPTIONS, ...options };
  const noiseFloorDb = estimateNoiseFloorDb(intensity);
  const thresholdDb = noiseFloorDb + opts.marginDb;
  const hop = intensity.hopMs / 1000;

  // 1. Frames acima do limiar viram segmentos brutos.
  const raw: Segment[] = [];
  let start = -1;
  for (let i = 0; i < intensity.db.length; i++) {
    const active = intensity.db[i] > thresholdDb;
    if (active && start < 0) start = i;
    if (!active && start >= 0) {
      raw.push({ startSec: start * hop, endSec: i * hop, durationSec: (i - start) * hop });
      start = -1;
    }
  }
  if (start >= 0) {
    const end = intensity.db.length;
    raw.push({ startSec: start * hop, endSec: end * hop, durationSec: (end - start) * hop });
  }

  // 2. Junta trechos separados por silencios curtos (oclusivas de /p/, /t/, /k/
  //    produzem 50-80 ms de silencio que NAO sao pausa).
  const merged = mergeShortGaps(raw, opts.minPauseSec);

  // 3. Descarta transientes.
  const speech = merged.filter((s) => s.durationSec >= opts.minSpeechSec);

  // 4. Pausas = complemento dos trechos de fala.
  const pauses: Segment[] = [];
  let cursor = 0;
  for (const s of speech) {
    if (s.startSec - cursor >= opts.minPauseSec) {
      pauses.push({ startSec: cursor, endSec: s.startSec, durationSec: s.startSec - cursor });
    }
    cursor = s.endSec;
  }
  if (totalSec - cursor >= opts.minPauseSec) {
    pauses.push({ startSec: cursor, endSec: totalSec, durationSec: totalSec - cursor });
  }

  const firstSpeech = speech.length ? speech[0].startSec : 0;
  const lastSpeech = speech.length ? speech[speech.length - 1].endSec : totalSec;
  const internalPauses = pauses.filter((p) => p.startSec >= firstSpeech && p.endSec <= lastSpeech);

  const speechTotalSec = speech.reduce((a, s) => a + s.durationSec, 0);
  const pauseTotalSec = internalPauses.reduce((a, s) => a + s.durationSec, 0);

  let voicedRatio = 0;
  if (pitch && pitch.f0.length > 0) {
    let inSpeech = 0;
    let voiced = 0;
    for (let i = 0; i < pitch.f0.length; i++) {
      const t = pitch.times[i];
      if (!speech.some((s) => t >= s.startSec && t <= s.endSec)) continue;
      inSpeech++;
      if (pitch.f0[i] > 0) voiced++;
    }
    voicedRatio = inSpeech > 0 ? voiced / inSpeech : 0;
  }

  return {
    speech,
    pauses,
    internalPauses,
    noiseFloorDb,
    thresholdDb,
    speechTotalSec,
    pauseTotalSec,
    voicedRatio,
  };
}
