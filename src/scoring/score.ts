/**
 * Transforma metricas em nota, criterios e feedback textual.
 *
 * Tres compromissos deliberados, todos herdados do ADR-002:
 *
 * 1. **Nunca acusar erro com sinal ruim.** Se a gravacao tem clipping, ruido alto
 *    ou nao tem voz, o app diz isso e NAO pontua. Um app que reprova por causa do
 *    proprio microfone perde a confianca do usuario, e a confianca e o insumo do
 *    treino.
 * 2. **Criterio sem dado nao entra na conta.** Nada de tratar ausente como zero.
 * 3. **Feedback nomeia o que fazer.** "Ritmo 72%" nao ajuda ninguem; "acima de 6
 *    silabas/s a articulacao se perde" ajuda.
 */

import type { Metrics } from '../dsp/types.ts';
import type { Exercise } from '../content/types.ts';
import { getRubric, scoreCriterion, type Criterion } from './rubrics.ts';
import type { Settings } from '../data/model.ts';

export interface CriterionResult {
  id: string;
  label: string;
  value: number;
  score: number;
  weight: number;
  verdict: 'bom' | 'ok' | 'atencao';
}

export interface ScoreResult {
  /** 0..100. -1 quando a gravacao nao pode ser pontuada. */
  score: number;
  scorable: boolean;
  criteria: CriterionResult[];
  /** Frase principal, em destaque no topo do feedback. */
  headline: string;
  /** Frases de apoio, em ordem de prioridade. */
  details: string[];
  flags: string[];
}

const WARNING_TEXT: Record<string, string> = {
  clipping: 'A gravação estourou de tão alta. Afaste um pouco o microfone e grave de novo.',
  'ruido-alto': 'Tem muito barulho de fundo junto com a sua voz. Procure um lugar mais quieto.',
  'muito-curto': 'A gravação ficou curta demais para analisar.',
  'sem-voz': 'Não encontrei voz nesta gravação. Veja se o microfone está liberado e fale mais perto dele.',
  'volume-baixo': 'O som chegou fraco demais. Chegue mais perto do microfone e fale um pouco mais alto.',
};

/** Avisos que impedem qualquer pontuacao. */
const BLOCKING: ReadonlySet<string> = new Set(['sem-voz', 'muito-curto', 'clipping']);

/**
 * O rigor ajusta as fronteiras: no modo tolerante um criterio precisa ir bem pior
 * para ser marcado como "atencao". Serve para nao desanimar no comeco e para
 * apertar quando o nivel sobe.
 */
function thresholds(strictness: Settings['strictness']): { good: number; ok: number } {
  switch (strictness) {
    case 1: return { good: 0.62, ok: 0.34 };
    case 3: return { good: 0.82, ok: 0.60 };
    default: return { good: 0.72, ok: 0.45 };
  }
}

export function scoreAttempt(
  metrics: Metrics,
  exercise: Exercise,
  settings: Settings,
): ScoreResult {
  const flags: string[] = [...metrics.warnings];
  const blocking = metrics.warnings.filter((w) => BLOCKING.has(w));

  if (blocking.length > 0) {
    return {
      score: -1,
      scorable: false,
      criteria: [],
      headline: WARNING_TEXT[blocking[0]] ?? 'Não deu para analisar esta gravação.',
      details: metrics.warnings
        .filter((w) => w !== blocking[0])
        .map((w) => WARNING_TEXT[w] ?? w),
      flags,
    };
  }

  if (exercise.selfReport || exercise.rubric === 'guiado') {
    return {
      score: 100,
      scorable: false,
      criteria: [],
      headline: 'Exercício feito.',
      details: ['Este exercício é para fazer, não para medir. O app só anota que você cumpriu.'],
      flags,
    };
  }

  const rubric = getRubric(exercise.rubric);
  const { good, ok } = thresholds(settings.strictness);

  const results: CriterionResult[] = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const c of rubric.criteria) {
    const value = c.extract(metrics);
    if (value === null || !Number.isFinite(value)) continue; // criterio nao aplicavel

    const s = scoreCriterion(c, value);
    const verdict: CriterionResult['verdict'] = s >= good ? 'bom' : s >= ok ? 'ok' : 'atencao';
    results.push({ id: c.id, label: c.label, value, score: s, weight: c.weight, verdict });
    weighted += s * c.weight;
    totalWeight += c.weight;
    if (verdict === 'atencao') flags.push(c.id);
  }

  if (totalWeight === 0) {
    return {
      score: -1,
      scorable: false,
      criteria: [],
      headline: 'A gravação ficou curta demais para dar um resultado confiável.',
      details: [],
      flags,
    };
  }

  const score = Math.round((weighted / totalWeight) * 100);
  const { headline, details } = buildFeedback(results, rubric.criteria, metrics, exercise, score);

  return { score, scorable: true, criteria: results, headline, details, flags };
}

function buildFeedback(
  results: CriterionResult[],
  criteria: Criterion[],
  metrics: Metrics,
  exercise: Exercise,
  score: number,
): { headline: string; details: string[] } {
  const byId = new Map(criteria.map((c) => [c.id, c]));

  // O pior criterio ponderado vira a manchete: uma coisa para corrigir por vez.
  const worst = [...results]
    .filter((r) => r.verdict !== 'bom')
    .sort((a, b) => a.score * a.weight - b.score * b.weight)[0];

  const details: string[] = [];
  let headline: string;

  if (!worst) {
    headline = pickPraise(score, exercise);
    const best = [...results].sort((a, b) => b.score * b.weight - a.score * a.weight)[0];
    const praise = best ? byId.get(best.id)?.praise : undefined;
    if (praise) details.push(praise);
  } else {
    headline = byId.get(worst.id)?.advice ?? `Para melhorar: ${worst.label}.`;
    // Ate dois pontos secundarios — mais que isso ninguem absorve entre uma
    // tentativa e a proxima.
    for (const r of results) {
      if (r.id === worst.id || r.verdict === 'bom') continue;
      const advice = byId.get(r.id)?.advice;
      if (advice && details.length < 2) details.push(advice);
    }
    const strong = results.find((r) => r.verdict === 'bom' && byId.get(r.id)?.praise);
    if (strong) details.push(byId.get(strong.id)!.praise!);
  }

  // Avisos nao bloqueantes entram no fim, como contexto.
  for (const w of metrics.warnings) {
    const text = WARNING_TEXT[w];
    if (text && !details.includes(text)) details.push(text);
  }

  if (metrics.voiceQuality.reliable && metrics.voiceQuality.jitterPct > 2.5) {
    details.push(
      'A voz saiu meio trêmula hoje. Se isso continuar por vários dias, beba mais água e descanse a voz — e, se não passar, vale consultar um fonoaudiólogo.',
    );
  }

  return { headline, details };
}

function pickPraise(score: number, exercise: Exercise): string {
  if (score >= 92) return 'Muito bom. Este exercício você já domina.';
  if (score >= 80) return 'Boa. Ficou dentro do esperado em tudo.';
  if (exercise.track === 'articulacao') return 'Saiu limpo. Repita mais algumas vezes para fixar.';
  return 'Ficou dentro do esperado.';
}

/** Rotulo curto para a UI. */
export function scoreLabel(score: number): string {
  if (score < 0) return '—';
  if (score >= 90) return 'Muito bom';
  if (score >= 78) return 'Bom';
  if (score >= 60) return 'Dá para melhorar';
  return 'Precisa treinar';
}
