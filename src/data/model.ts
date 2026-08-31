/** Modelo de dados persistido. Ver ADR-003 para a politica de retencao. */

import type { Metrics } from '../dsp/types.ts';

export const SCHEMA_VERSION = 1;

/** Realizacao alvo do /r/ em coda — varia legitimamente por regiao (ADR-002). */
export type CodaRhotic = 'fricativa' | 'tepe' | 'retroflexo';

export interface Settings {
  schemaVersion: number;
  codaRhoticTarget: CodaRhotic;
  /** 1 = tolerante, 2 = normal, 3 = exigente. */
  strictness: 1 | 2 | 3;
  dailyGoalMin: number;
  /** Avanca automaticamente para o proximo exercicio apos o feedback. */
  handsFree: boolean;
  keepAudioDays: number;
  lastBackupAt: string | null;
  micNoiseFloorDb: number | null;
  createdAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  codaRhoticTarget: 'fricativa',
  strictness: 2,
  dailyGoalMin: 12,
  handsFree: false,
  keepAudioDays: 30,
  lastBackupAt: null,
  micNoiseFloorDb: null,
  createdAt: new Date().toISOString(),
};

export interface Attempt {
  id: string;
  exerciseId: string;
  sessionId: string;
  /** ISO 8601. */
  at: string;
  /** Chave no armazenamento de audio. Pode sumir por retencao — nunca e obrigatorio. */
  audioRef: string | null;
  /** Gravacoes fixadas nunca sao apagadas pela retencao. */
  pinned: boolean;
  durationSec: number;
  metrics: Metrics;
  score: number;
  flags: string[];
  feedback: string[];
}

export interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  attemptIds: string[];
  plan: string[];
  completed: boolean;
}

/** Estado de progressao por trilha. */
export interface TrackProgress {
  track: string;
  level: number;
  /** Sessoes consecutivas atingindo o criterio de avanco. */
  streakAtLevel: number;
  updatedAt: string;
}

/** Fila de repeticao espacada dos exercicios errados. */
export interface ReviewItem {
  exerciseId: string;
  dueAt: string;
  /** Indice na escada de intervalos (1, 3, 7, 14 dias). */
  stage: number;
  lapses: number;
}

export interface DailyStat {
  /** YYYY-MM-DD, hora local. */
  day: string;
  attempts: number;
  practiceSec: number;
  meanScore: number;
}

export interface BackupFile {
  format: 'oratorius-backup';
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  attempts: Attempt[];
  sessions: Session[];
  progress: TrackProgress[];
  reviews: ReviewItem[];
}

export function todayKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
