/** Camada de acesso a dados. Toda a UI passa por aqui — nada fala com IndexedDB direto. */

import {
  clearStore, getAll, getByIndexDesc, kvGet, kvSet, put, putMany,
} from './idb.ts';
import {
  DEFAULT_SETTINGS, SCHEMA_VERSION, todayKey,
  type Attempt, type BackupFile, type DailyStat, type ReviewItem,
  type Session, type Settings, type TrackProgress,
} from './model.ts';
import { deleteAudio, pruneAudio, timestampFromRef } from './audioStore.ts';

const KEY_SETTINGS = 'settings';
const KEY_PROGRESS = 'progress';
const KEY_REVIEWS = 'reviews';

// ---------------------------------------------------------------- Settings

export async function getSettings(): Promise<Settings> {
  const stored = await kvGet<Settings>(KEY_SETTINGS);
  // Merge com o default: um campo novo em versao futura nao quebra um banco antigo.
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await kvSet(KEY_SETTINGS, next);
  return next;
}

// ---------------------------------------------------------------- Attempts

export async function saveAttempt(attempt: Attempt): Promise<void> {
  await put('attempts', attempt);
}

export async function allAttempts(): Promise<Attempt[]> {
  return getAll<Attempt>('attempts');
}

export async function recentAttempts(limit = 60): Promise<Attempt[]> {
  return getByIndexDesc<Attempt>('attempts', 'at', limit);
}

export async function attemptsForExercise(exerciseId: string): Promise<Attempt[]> {
  const all = await allAttempts();
  return all
    .filter((a) => a.exerciseId === exerciseId)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export async function setPinned(attemptId: string, pinned: boolean): Promise<void> {
  const all = await allAttempts();
  const found = all.find((a) => a.id === attemptId);
  if (!found) return;
  await put('attempts', { ...found, pinned });
}

/** Melhor tentativa anterior de um exercicio — usada no comparativo A/B. */
export async function bestAttempt(exerciseId: string): Promise<Attempt | null> {
  const list = (await attemptsForExercise(exerciseId)).filter((a) => a.audioRef);
  if (list.length === 0) return null;
  return list.reduce((best, a) => (a.score > best.score ? a : best));
}

// ---------------------------------------------------------------- Sessions

export async function saveSession(session: Session): Promise<void> {
  await put('sessions', session);
}

export async function allSessions(): Promise<Session[]> {
  return getAll<Session>('sessions');
}

// ---------------------------------------------------------------- Progress

export async function getProgress(): Promise<TrackProgress[]> {
  return (await kvGet<TrackProgress[]>(KEY_PROGRESS)) ?? [];
}

export async function saveProgress(list: TrackProgress[]): Promise<void> {
  await kvSet(KEY_PROGRESS, list);
}

export async function getReviews(): Promise<ReviewItem[]> {
  return (await kvGet<ReviewItem[]>(KEY_REVIEWS)) ?? [];
}

export async function saveReviews(list: ReviewItem[]): Promise<void> {
  await kvSet(KEY_REVIEWS, list);
}

// ---------------------------------------------------------------- Estatistica

export async function dailyStats(days = 30): Promise<DailyStat[]> {
  const attempts = await allAttempts();
  const byDay = new Map<string, { attempts: number; sec: number; scoreSum: number }>();

  for (const a of attempts) {
    const day = todayKey(new Date(a.at));
    const row = byDay.get(day) ?? { attempts: 0, sec: 0, scoreSum: 0 };
    row.attempts++;
    row.sec += a.durationSec;
    row.scoreSum += a.score;
    byDay.set(day, row);
  }

  const out: DailyStat[] = [];
  const cursor = new Date();
  for (let i = 0; i < days; i++) {
    const key = todayKey(cursor);
    const row = byDay.get(key);
    out.unshift({
      day: key,
      attempts: row?.attempts ?? 0,
      practiceSec: row?.sec ?? 0,
      meanScore: row && row.attempts > 0 ? row.scoreSum / row.attempts : 0,
    });
    cursor.setDate(cursor.getDate() - 1);
  }
  return out;
}

/** Dias consecutivos de treino, contados a partir de hoje (ou de ontem). */
export async function currentStreak(): Promise<number> {
  const stats = await dailyStats(365);
  let streak = 0;
  for (let i = stats.length - 1; i >= 0; i--) {
    if (stats[i].attempts > 0) streak++;
    else if (i === stats.length - 1) continue; // hoje ainda pode ser treinado
    else break;
  }
  return streak;
}

export async function practiceSecondsToday(): Promise<number> {
  const key = todayKey();
  const attempts = await allAttempts();
  return attempts
    .filter((a) => todayKey(new Date(a.at)) === key)
    .reduce((sum, a) => sum + a.durationSec, 0);
}

// ---------------------------------------------------------------- Backup

export async function exportBackup(): Promise<BackupFile> {
  return {
    format: 'oratorius-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    attempts: await allAttempts(),
    sessions: await allSessions(),
    progress: await getProgress(),
    reviews: await getReviews(),
  };
}

export interface ImportResult {
  attempts: number;
  sessions: number;
}

export async function importBackup(data: unknown): Promise<ImportResult> {
  if (!data || typeof data !== 'object') throw new Error('Arquivo vazio ou invalido.');
  const file = data as Partial<BackupFile>;
  if (file.format !== 'oratorius-backup') {
    throw new Error('Este arquivo nao e um backup do Oratorius.');
  }
  if (typeof file.schemaVersion !== 'number' || file.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Backup da versao ${file.schemaVersion} e mais novo que este app (v${SCHEMA_VERSION}). Atualize o app antes de importar.`,
    );
  }

  const attempts = Array.isArray(file.attempts) ? file.attempts : [];
  const sessions = Array.isArray(file.sessions) ? file.sessions : [];

  // Restauracao substitui: importar e "voltar ao estado do backup", nao mesclar
  // — mesclar dois historicos criaria series temporais com furos e duplicatas.
  await clearStore('attempts');
  await clearStore('sessions');
  await putMany('attempts', attempts);
  await putMany('sessions', sessions);
  if (file.settings) await kvSet(KEY_SETTINGS, { ...DEFAULT_SETTINGS, ...file.settings });
  if (file.progress) await kvSet(KEY_PROGRESS, file.progress);
  if (file.reviews) await kvSet(KEY_REVIEWS, file.reviews);

  // O audio nao viaja no backup (seria de centenas de MB). As refs viram orfas,
  // e o app ja trata ref orfa como "audio expirado".
  return { attempts: attempts.length, sessions: sessions.length };
}

export async function daysSinceBackup(): Promise<number | null> {
  const s = await getSettings();
  if (!s.lastBackupAt) return null;
  const diff = Date.now() - new Date(s.lastBackupAt).getTime();
  return Math.floor(diff / (24 * 3600 * 1000));
}

// ---------------------------------------------------------------- Manutencao

/** Roda na abertura do app. Nunca durante uma gravacao (ADR-003). */
export async function runRetention(): Promise<{ removed: number; orphans: number }> {
  const settings = await getSettings();
  const attempts = await allAttempts();

  const knownRefs = new Set<string>();
  const pinnedRefs = new Set<string>();
  for (const a of attempts) {
    if (!a.audioRef) continue;
    knownRefs.add(a.audioRef);
    if (a.pinned) pinnedRefs.add(a.audioRef);
  }

  const result = await pruneAudio(settings.keepAudioDays, knownRefs, pinnedRefs);

  // As tentativas cujo audio expirou passam a apontar para null. A metrica fica;
  // so o audio some. A UI trata `audioRef: null` como "gravacao expirada".
  const cutoff = Date.now() - settings.keepAudioDays * 24 * 3600 * 1000;
  const updates: Attempt[] = [];
  for (const a of attempts) {
    if (!a.audioRef || a.pinned) continue;
    const ts = timestampFromRef(a.audioRef);
    if (ts !== null && ts < cutoff) updates.push({ ...a, audioRef: null });
  }
  if (updates.length) await putMany('attempts', updates);

  return result;
}

/** Apaga tudo. So chamado a partir de Ajustes, com confirmacao dupla. */
export async function wipeEverything(): Promise<void> {
  const attempts = await allAttempts();
  for (const a of attempts) if (a.audioRef) await deleteAudio(a.audioRef);
  await clearStore('attempts');
  await clearStore('sessions');
  await clearStore('kv');
}
