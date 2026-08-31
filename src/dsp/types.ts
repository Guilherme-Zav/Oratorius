/** Contrato de saida da Camada 1 (ADR-002). Persistido em cada tentativa. */

export interface F0Metrics {
  meanHz: number;
  medianHz: number;
  /** Desvio do contorno em semitons. Abaixo de ~1.5 = fala monotona. */
  sdSemitones: number;
  /** Faixa util (percentil 5 a 95) em semitons. */
  rangeSemitones: number;
  minHz: number;
  maxHz: number;
  /** Fracao de frames vozeados dentro dos trechos de fala. */
  voicedRatio: number;
}

export interface IntensityMetrics {
  meanDb: number;
  sdDb: number;
  peakDb: number;
  noiseFloorDb: number;
  /** Distancia entre fala e piso de ruido. Abaixo de ~15 dB a analise perde confianca. */
  snrDb: number;
  clippingRatio: number;
}

export interface TimingMetrics {
  totalSec: number;
  speechSec: number;
  pauseCount: number;
  pauseTotalSec: number;
  longestPauseSec: number;
  syllableCount: number;
  speechRate: number;
  articulationRate: number;
  filledPauseCount: number;
  filledPauseTotalSec: number;
  /** Alongamentos por minuto de fala — a forma comparavel entre gravacoes. */
  filledPausePerMin: number;
}

export interface VoiceQualityMetrics {
  jitterPct: number;
  shimmerPct: number;
  hnrDb: number;
  reliable: boolean;
}

export interface DdkMetrics {
  syllPerSec: number;
  cvPercent: number;
  count: number;
  meanIoiMs: number;
}

export interface MptMetrics {
  seconds: number;
  f0SdSemitones: number;
  decayDb: number;
  steadyRatio: number;
}

/** Avisos sobre a qualidade da captura. Se houver algum, o scoring e amortecido. */
export type QualityWarning =
  | 'clipping'
  | 'ruido-alto'
  | 'muito-curto'
  | 'sem-voz'
  | 'volume-baixo';

export interface Metrics {
  schemaVersion: 1;
  sampleRate: number;
  f0: F0Metrics;
  intensity: IntensityMetrics;
  timing: TimingMetrics;
  voiceQuality: VoiceQualityMetrics;
  ddk?: DdkMetrics;
  mpt?: MptMetrics;
  warnings: QualityWarning[];
}

/** Series temporais para os graficos da tela de feedback. Nao vao para o banco. */
export interface AnalysisCurves {
  f0: Float32Array;
  f0Times: Float32Array;
  db: Float32Array;
  dbTimes: Float32Array;
  /** Envelope reduzido para desenhar a waveform (pares min/max). */
  waveform: Float32Array;
  syllableNuclei: number[];
  onsets: number[];
  pauses: Array<{ startSec: number; endSec: number }>;
  filledPauses: Array<{ startSec: number; endSec: number }>;
}

export interface AnalysisResult {
  metrics: Metrics;
  curves: AnalysisCurves;
}
