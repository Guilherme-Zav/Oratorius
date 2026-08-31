/**
 * Orquestrador da Camada 1 (ADR-002).
 *
 * Entrada: PCM mono na taxa nativa do aparelho (48 kHz no iPhone).
 * Saida: Metrics (persistido) + AnalysisCurves (descartavel, so para os graficos).
 *
 * Reamostra uma unica vez para 16 kHz e todo o resto opera sobre esse sinal, de
 * modo que uma metrica nunca discorde de outra por diferenca de taxa.
 */

import { median, percentile, removeDC, semitones, stdDev, mean } from './frames.ts';
import { ANALYSIS_RATE, resample } from './resample.ts';
import { fixOctaveJumps, trackPitch, voicedValues } from './pitch.ts';
import { clippingRatio, peakDb, trackIntensity } from './intensity.ts';
import { detectVoiceActivity } from './vad.ts';
import { analyzeSpectrum } from './spectrum.ts';
import { detectSyllables } from './syllables.ts';
import { detectFilledPauses } from './filledPause.ts';
import { analyzeVoiceQuality } from './voiceQuality.ts';
import { analyzeDdk, EMPTY_DDK } from './ddk.ts';
import { analyzeMpt } from './mpt.ts';
import type { AnalysisResult, Metrics, QualityWarning } from './types.ts';

export interface AnalyzeOptions {
  /** Liga a analise de DDK (custa uma passagem extra de pico). */
  ddk?: boolean;
  /** Liga a analise de TMF. */
  mpt?: boolean;
  /** Numero de colunas do envelope de waveform desenhado na UI. */
  waveformBins?: number;
}

/** Envelope min/max reduzido — desenhar 480k amostras num canvas de 350 px e desperdicio. */
function buildWaveform(x: Float32Array, bins: number): Float32Array {
  const out = new Float32Array(bins * 2);
  if (x.length === 0) return out;
  const per = x.length / bins;
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(x.length, Math.floor((b + 1) * per));
    let lo = 0;
    let hi = 0;
    for (let i = start; i < end; i++) {
      if (x[i] < lo) lo = x[i];
      if (x[i] > hi) hi = x[i];
    }
    out[b * 2] = lo;
    out[b * 2 + 1] = hi;
  }
  return out;
}

/** Acima disto, a gravacao e "longa" e a resolucao temporal fina deixa de valer o custo. */
const LONG_FORM_SEC = 20;

export function analyze(
  input: Float32Array,
  inputRate: number,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const { ddk = false, mpt = false, waveformBins = 360 } = options;

  const clipped = clippingRatio(input);
  const peak = peakDb(input);
  const x = removeDC(resample(input, inputRate, ANALYSIS_RATE));
  const sr = ANALYSIS_RATE;
  const totalSec = x.length / sr;

  // Passo temporal adaptativo. O rastreamento de f0 domina o custo da analise, e
  // ele cresce linearmente com o numero de frames.
  //
  // Num exercicio curto de articulacao, resolucao fina importa: 10 ms e o que
  // permite ver onde exatamente a voz falhou. Num improviso de 90 s, as metricas
  // que usamos (variacao de tom, ritmo, alongamentos, pausas) sao todas
  // estatisticas sobre a gravacao inteira — 50 pontos por segundo dizem o mesmo
  // que 100, e custam metade.
  //
  // O DDK e a excecao que precisa dos 10 ms sempre: ele mede intervalos entre
  // ataques de silaba, e a 20 ms o erro de quantizacao poluiria o coeficiente de
  // variacao, que e justamente a metrica mais sensivel da trilha.
  const longForm = totalSec > LONG_FORM_SEC;
  const pitchHopMs = longForm ? 20 : 10;
  const spectrumHopMs = longForm && !ddk ? 20 : 10;

  const intensity = trackIntensity(x, sr);
  const pitch = fixOctaveJumps(trackPitch(x, sr, { hopMs: pitchHopMs }));
  const spectral = analyzeSpectrum(x, sr, 25, spectrumHopMs);
  const vad = detectVoiceActivity(intensity, pitch, totalSec);
  const syllables = detectSyllables(
    intensity, pitch, vad.thresholdDb, totalSec, vad.speech,
  );
  // Alongamentos ("eeee", "hmmm") so fazem sentido em fala conectada.
  //
  // Num exercicio de repeticao lenta ("a — ra — a — ra"), uma vogal deliberada de
  // 400 ms tem exatamente a assinatura que o detector procura: vozeada, longa,
  // f0 plano, trato vocal parado. Mas ali ela e o proprio objetivo do exercicio,
  // nao um vicio de linguagem. Reportar "2 alongamentos" numa serie de tepes
  // seria um falso positivo que corroi a confianca no feedback.
  //
  // O limiar acompanha o do criterio de scoring, que ja exigia fala conectada.
  const connectedSpeech = vad.speechTotalSec >= 5;
  const filled = connectedSpeech ? detectFilledPauses(pitch, spectral) : [];
  const vq = analyzeVoiceQuality(x, sr, pitch);
  const ddkResult = ddk ? analyzeDdk(spectral, intensity) : EMPTY_DDK;
  const mptResult = mpt ? analyzeMpt(pitch, intensity) : null;

  // --- Estatistica de f0 ---
  const voiced = voicedValues(pitch.f0);
  const meanHz = voiced.length ? mean(voiced) : 0;
  const medianHz = voiced.length ? median(voiced) : 0;
  const p5 = voiced.length ? percentile(voiced, 0.05) : 0;
  const p95 = voiced.length ? percentile(voiced, 0.95) : 0;
  const sdSemitones = voiced.length > 1 && medianHz > 0
    ? stdDev(voiced.map((v) => semitones(v, medianHz)))
    : 0;

  // --- Intensidade, restrita aos trechos de fala ---
  const speechDb: number[] = [];
  for (let i = 0; i < intensity.times.length; i++) {
    const t = intensity.times[i];
    if (vad.speech.some((s) => t >= s.startSec && t <= s.endSec)) speechDb.push(intensity.db[i]);
  }
  const meanDb = speechDb.length ? mean(speechDb) : intensity.db.length ? mean(Array.from(intensity.db)) : -100;
  const snrDb = meanDb - vad.noiseFloorDb;

  // --- Avisos de qualidade de captura ---
  const warnings: QualityWarning[] = [];
  if (clipped > 0.001) warnings.push('clipping');
  if (snrDb < 15) warnings.push('ruido-alto');
  if (totalSec < 0.4) warnings.push('muito-curto');
  if (vad.speechTotalSec < 0.2 || voiced.length < 5) warnings.push('sem-voz');
  if (peak < -35) warnings.push('volume-baixo');

  const longestPause = vad.internalPauses.reduce((a, p) => Math.max(a, p.durationSec), 0);
  const filledTotal = filled.reduce((a, f) => a + f.durationSec, 0);

  const metrics: Metrics = {
    schemaVersion: 1,
    sampleRate: sr,
    f0: {
      meanHz, medianHz, sdSemitones,
      rangeSemitones: p5 > 0 && p95 > 0 ? semitones(p95, p5) : 0,
      minHz: p5, maxHz: p95,
      voicedRatio: vad.voicedRatio,
    },
    intensity: {
      meanDb, sdDb: speechDb.length > 1 ? stdDev(speechDb) : 0,
      peakDb: peak, noiseFloorDb: vad.noiseFloorDb, snrDb, clippingRatio: clipped,
    },
    timing: {
      totalSec,
      speechSec: vad.speechTotalSec,
      pauseCount: vad.internalPauses.length,
      pauseTotalSec: vad.pauseTotalSec,
      longestPauseSec: longestPause,
      syllableCount: syllables.count,
      speechRate: syllables.speechRate,
      articulationRate: syllables.articulationRate,
      filledPauseCount: filled.length,
      filledPauseTotalSec: filledTotal,
      filledPausePerMin: vad.speechTotalSec > 0 ? (filled.length / vad.speechTotalSec) * 60 : 0,
    },
    voiceQuality: {
      jitterPct: vq.jitterPct,
      shimmerPct: vq.shimmerPct,
      hnrDb: vq.hnrDb,
      reliable: vq.reliable,
    },
    warnings,
  };

  if (ddk) {
    metrics.ddk = {
      syllPerSec: ddkResult.syllPerSec,
      cvPercent: ddkResult.cvPercent,
      count: ddkResult.count,
      meanIoiMs: ddkResult.meanIoiMs,
    };
  }
  if (mptResult) {
    metrics.mpt = {
      seconds: mptResult.seconds,
      f0SdSemitones: mptResult.f0SdSemitones,
      decayDb: mptResult.decayDb,
      steadyRatio: mptResult.steadyRatio,
    };
  }

  return {
    metrics,
    curves: {
      f0: pitch.f0,
      f0Times: pitch.times,
      db: intensity.db,
      dbTimes: intensity.times,
      waveform: buildWaveform(x, waveformBins),
      syllableNuclei: syllables.nuclei,
      onsets: ddkResult.onsets,
      pauses: vad.internalPauses.map((p) => ({ startSec: p.startSec, endSec: p.endSec })),
      filledPauses: filled.map((p) => ({ startSec: p.startSec, endSec: p.endSec })),
    },
  };
}
