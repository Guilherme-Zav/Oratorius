/**
 * Montagem da sessao diaria.
 *
 * Estrutura fixa (DESIGN.md, secao 4), ~10-15 min:
 *   1. Aquecimento          respiracao + humming + motricidade
 *   2. Foco articulatorio   nivel atual + revisao espacada
 *   3. Linha de base        SEMPRE os mesmos exercicios, sem adaptacao
 *   4. Oratoria             leitura expressiva ou improviso
 *
 * O bloco 3 e o mais importante do ponto de vista clinico e o mais chato do ponto
 * de vista de produto: ele nao se adapta, justamente para produzir uma serie
 * temporal comparavel dia a dia. E o que voce leva a um fonoaudiologo.
 */

import {
  EXERCISES, baselineExercises, exercisesAtLevel, getExercise, warmupExercises,
} from '../content/exercises.ts';
import type { Exercise, Track } from '../content/types.ts';
import { dueReviews, levelFor } from './progression.ts';
import type { ReviewItem, TrackProgress } from '../data/model.ts';

export interface SessionBlock {
  title: string;
  subtitle: string;
  exerciseIds: string[];
}

export interface SessionPlan {
  blocks: SessionBlock[];
  exerciseIds: string[];
  estimatedSec: number;
}

/** Escolha estavel dentro do dia: o mesmo plano se voce reabrir o app. */
function dailyPick<T>(items: T[], seed: number, count: number): T[] {
  if (items.length <= count) return [...items];
  const out: T[] = [];
  const used = new Set<number>();
  let s = seed;
  while (out.length < count && used.size < items.length) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const idx = s % items.length;
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(items[idx]);
  }
  return out;
}

function daySeed(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function estimate(ids: string[]): number {
  return ids.reduce((sum, id) => {
    const ex = getExercise(id);
    // +6 s por exercicio: ler a instrucao, ouvir o modelo, se preparar.
    return sum + (ex?.durationSec ?? 15) + 6;
  }, 0);
}

/**
 * Exercicios do nivel atual da trilha, caindo para o nivel anterior se o nivel
 * atual nao tiver conteudo suficiente.
 */
function atOrBelow(track: Track, level: number, count: number, seed: number): Exercise[] {
  const out: Exercise[] = [];
  for (let l = level; l >= 1 && out.length < count; l--) {
    const pool = exercisesAtLevel(track, l).filter((e) => !out.some((o) => o.id === e.id));
    out.push(...dailyPick(pool, seed + l, count - out.length));
  }
  return out;
}

export function buildSession(
  progress: TrackProgress[],
  reviews: ReviewItem[],
  date = new Date(),
): SessionPlan {
  const seed = daySeed(date);
  const blocks: SessionBlock[] = [];

  // --- 1. Aquecimento ---
  const warmup = dailyPick(warmupExercises(), seed, 3);
  blocks.push({
    title: 'Aquecimento',
    subtitle: 'Solta a lingua e prepara a respiracao',
    exerciseIds: warmup.map((e) => e.id),
  });

  // --- 2. Foco articulatorio: revisao vencida primeiro, depois o nivel atual ---
  const due = dueReviews(reviews, date)
    .map((r) => getExercise(r.exerciseId))
    .filter((e): e is Exercise => Boolean(e))
    .slice(0, 2);

  const artLevel = levelFor(progress, 'articulacao');
  const focus = atOrBelow('articulacao', artLevel, 3, seed);
  const focusIds = [...due.map((e) => e.id), ...focus.map((e) => e.id)]
    .filter((id, i, arr) => arr.indexOf(id) === i);

  blocks.push({
    title: `Articulacao — nivel ${artLevel}`,
    subtitle: due.length
      ? `${due.length} exercicio(s) voltando para revisao`
      : 'Foco do dia no som /r/',
    exerciseIds: focusIds,
  });

  // --- 3. Linha de base (nunca muda) ---
  blocks.push({
    title: 'Linha de base',
    subtitle: 'Sempre os mesmos — e o que torna a evolucao comparavel',
    exerciseIds: baselineExercises().map((e) => e.id),
  });

  // --- 4. Oratoria ---
  const oraLevel = levelFor(progress, 'oratoria');
  const oratory = atOrBelow('oratoria', oraLevel, 2, seed + 7);
  blocks.push({
    title: `Oratoria — nivel ${oraLevel}`,
    subtitle: 'Projecao, prosodia e estrutura',
    exerciseIds: oratory.map((e) => e.id),
  });

  const exerciseIds = blocks.flatMap((b) => b.exerciseIds);
  return { blocks, exerciseIds, estimatedSec: estimate(exerciseIds) };
}

/** Sessao livre com uma trilha so, a partir da Biblioteca. */
export function buildTrackSession(track: Track, level: number): SessionPlan {
  const ids = EXERCISES
    .filter((e) => e.track === track && e.level <= level)
    .sort((a, b) => a.level - b.level)
    .map((e) => e.id);
  return {
    blocks: [{ title: track, subtitle: `Ate o nivel ${level}`, exerciseIds: ids }],
    exerciseIds: ids,
    estimatedSec: estimate(ids),
  };
}

export function singleExerciseSession(exerciseId: string): SessionPlan {
  const ex = getExercise(exerciseId);
  const ids = ex ? [ex.id] : [];
  return {
    blocks: [{ title: ex?.title ?? 'Exercicio', subtitle: '', exerciseIds: ids }],
    exerciseIds: ids,
    estimatedSec: estimate(ids),
  };
}
