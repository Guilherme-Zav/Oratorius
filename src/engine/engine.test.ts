import { describe, it } from 'node:test';
import { expect } from '../testing/expect.ts';

import { EXERCISES, TRACKS, baselineExercises, getExercise } from '../content/exercises.ts';
import { RUBRICS } from '../scoring/rubrics.ts';
import { scoreAttempt } from '../scoring/score.ts';
import {
  LEVEL_UP_SCORE, LEVEL_UP_STREAK, REVIEW_INTERVALS, applySessionResults, dueReviews,
  initialProgress, levelFor, updateReviews,
} from './progression.ts';
import { buildSession } from './session.ts';
import { DEFAULT_SETTINGS, type Attempt, type ReviewItem } from '../data/model.ts';
import type { Metrics } from '../dsp/types.ts';

// ---------------------------------------------------------------- helpers

function metrics(patch: Partial<Metrics> = {}): Metrics {
  const base: Metrics = {
    schemaVersion: 1,
    sampleRate: 16000,
    f0: {
      meanHz: 130, medianHz: 128, sdSemitones: 3.2, rangeSemitones: 9,
      minHz: 100, maxHz: 190, voicedRatio: 0.7,
    },
    intensity: {
      meanDb: -22, sdDb: 5.5, peakDb: -8, noiseFloorDb: -55, snrDb: 33, clippingRatio: 0,
    },
    timing: {
      totalSec: 12, speechSec: 9.5, pauseCount: 3, pauseTotalSec: 2.5,
      longestPauseSec: 0.5, syllableCount: 45, speechRate: 3.75,
      articulationRate: 4.7, filledPauseCount: 0, filledPauseTotalSec: 0,
      filledPausePerMin: 0,
    },
    voiceQuality: { jitterPct: 0.8, shimmerPct: 3, hnrDb: 18, reliable: true },
    warnings: [],
  };
  return { ...base, ...patch };
}

function attempt(exerciseId: string, score: number): Attempt {
  return {
    id: `a_${exerciseId}_${score}`,
    exerciseId,
    sessionId: 's1',
    at: new Date().toISOString(),
    audioRef: null,
    pinned: false,
    durationSec: 10,
    metrics: metrics(),
    score,
    flags: [],
    feedback: [],
  };
}

// ---------------------------------------------------------------- catalogo

describe('catalogo de exercicios', () => {
  it('nao tem ids duplicados', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    expect(ids.size).toBe(EXERCISES.length);
  });

  it('toda rubrica referenciada existe', () => {
    for (const e of EXERCISES) {
      expect(Boolean(RUBRICS[e.rubric])).toBeTruthy();
    }
  });

  it('todo nivel cabe no maxLevel da trilha', () => {
    for (const e of EXERCISES) {
      const track = TRACKS.find((t) => t.id === e.track);
      expect(Boolean(track)).toBeTruthy();
      expect(e.level).toBeGreaterThanOrEqual(1);
      expect(e.level).toBeLessThanOrEqual(track!.maxLevel);
    }
  });

  it('a trilha de articulacao cobre os dez niveis do design', () => {
    for (let level = 1; level <= 10; level++) {
      const found = EXERCISES.filter((e) => e.track === 'articulacao' && e.level === level);
      expect(found.length).toBeGreaterThan(0);
    }
  });

  it('existe linha de base e ela inclui DDK, TMF e um par minimo', () => {
    const base = baselineExercises();
    expect(base.length).toBeGreaterThanOrEqual(3);
    expect(base.some((e) => e.kind === 'ddk')).toBeTruthy();
    expect(base.some((e) => e.kind === 'sustentacao')).toBeTruthy();
    expect(base.some((e) => e.kind === 'par-minimo')).toBeTruthy();
  });
});

// ---------------------------------------------------------------- scoring

describe('scoring', () => {
  const leitura = getExercise('art-l7-frase-1')!;

  it('gravacao boa recebe nota alta', () => {
    const r = scoreAttempt(metrics(), leitura, DEFAULT_SETTINGS);
    expect(r.scorable).toBeTruthy();
    expect(r.score).toBeGreaterThan(70);
  });

  it('nao pontua quando nao ha voz — e explica o motivo', () => {
    const r = scoreAttempt(metrics({ warnings: ['sem-voz'] }), leitura, DEFAULT_SETTINGS);
    expect(r.scorable).toBeFalsy();
    expect(r.score).toBe(-1);
    expect(r.headline).toContain('microfone');
  });

  it('nao pontua com clipping — culpa do sinal, nao da fala', () => {
    const r = scoreAttempt(metrics({ warnings: ['clipping'] }), leitura, DEFAULT_SETTINGS);
    expect(r.scorable).toBeFalsy();
  });

  it('fala monotona perde no criterio de entonacao', () => {
    const flat = metrics({
      f0: { ...metrics().f0, sdSemitones: 0.4, rangeSemitones: 1 },
    });
    const r = scoreAttempt(flat, getExercise('ora-leitura-expressiva')!, DEFAULT_SETTINGS);
    const entonacao = r.criteria.find((c) => c.id === 'entonacao');
    expect(Boolean(entonacao)).toBeTruthy();
    expect(entonacao!.verdict).toBe('atencao');
    expect(r.headline).toContain('mesmo tom');
  });

  it('criterio sem dado nao entra na conta (nao vira zero)', () => {
    // Sem dados de DDK, a rubrica de DDK so pode usar o criterio de clareza.
    const r = scoreAttempt(metrics(), getExercise('ddk-pataka')!, DEFAULT_SETTINGS);
    expect(r.criteria.some((c) => c.id === 'regularidade')).toBeFalsy();
    expect(r.criteria.some((c) => c.id === 'clareza')).toBeTruthy();
  });

  it('DDK irregular perde em regularidade, que pesa o dobro', () => {
    const regular = metrics({ ddk: { syllPerSec: 5.5, cvPercent: 6, count: 20, meanIoiMs: 180 } });
    const irregular = metrics({ ddk: { syllPerSec: 5.5, cvPercent: 34, count: 20, meanIoiMs: 180 } });
    const ddk = getExercise('ddk-pataka')!;
    const a = scoreAttempt(regular, ddk, DEFAULT_SETTINGS);
    const b = scoreAttempt(irregular, ddk, DEFAULT_SETTINGS);
    expect(a.score).toBeGreaterThan(b.score + 20);
    expect(b.headline).toContain('irregular');
  });

  it('TMF longo pontua mais que TMF curto', () => {
    const tmf = getExercise('resp-tmf-a')!;
    const curto = metrics({ mpt: { seconds: 6, f0SdSemitones: 1, decayDb: 4, steadyRatio: 0.8 } });
    const longo = metrics({ mpt: { seconds: 22, f0SdSemitones: 0.5, decayDb: 2, steadyRatio: 0.95 } });
    expect(scoreAttempt(longo, tmf, DEFAULT_SETTINGS).score)
      .toBeGreaterThan(scoreAttempt(curto, tmf, DEFAULT_SETTINGS).score + 25);
  });

  it('muitos alongamentos aparecem no feedback do improviso', () => {
    const m = metrics({
      timing: { ...metrics().timing, totalSec: 60, speechSec: 50, filledPauseCount: 14, filledPausePerMin: 16.8 },
    });
    const r = scoreAttempt(m, getExercise('ora-prep')!, DEFAULT_SETTINGS);
    expect(r.flags).toContain('alongamentos');
  });

  it('rigor maior deixa a mesma gravacao mais dificil de aprovar', () => {
    const m = metrics({ f0: { ...metrics().f0, sdSemitones: 1.9 } });
    const ex = getExercise('ora-leitura-expressiva')!;
    const tolerante = scoreAttempt(m, ex, { ...DEFAULT_SETTINGS, strictness: 1 });
    const exigente = scoreAttempt(m, ex, { ...DEFAULT_SETTINGS, strictness: 3 });
    const t = tolerante.criteria.find((c) => c.id === 'entonacao')!;
    const e = exigente.criteria.find((c) => c.id === 'entonacao')!;
    expect(t.score).toBeCloseTo(e.score, 6);   // o valor bruto nao muda...
    expect(t.verdict === 'atencao' && e.verdict === 'atencao').toBeFalsy(); // ...o veredito, sim
  });

  it('exercicio guiado e registrado sem analise acustica', () => {
    const r = scoreAttempt(metrics(), getExercise('mot-estalo')!, DEFAULT_SETTINGS);
    expect(r.scorable).toBeFalsy();
    expect(r.score).toBe(100);
  });

  it('feedback traz no maximo tres frases de apoio', () => {
    const ruim = metrics({
      f0: { ...metrics().f0, sdSemitones: 0.2 },
      intensity: { ...metrics().intensity, sdDb: 0.5, snrDb: 10 },
      timing: {
        ...metrics().timing, totalSec: 60, speechSec: 55, articulationRate: 8.4,
        longestPauseSec: 2.4, filledPausePerMin: 20, pauseTotalSec: 1,
      },
      warnings: ['ruido-alto'],
    });
    const r = scoreAttempt(ruim, getExercise('ora-prep')!, DEFAULT_SETTINGS);
    expect(r.details.length).toBeLessThanOrEqual(4);
    expect(r.headline.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------- progressao

describe('progressao', () => {
  it('sobe de nivel apos tres sessoes consecutivas no criterio', () => {
    let progress = initialProgress();
    const good = [attempt('art-l1-arara', 92), attempt('art-l1-lento', 88)];

    for (let i = 0; i < LEVEL_UP_STREAK - 1; i++) {
      progress = applySessionResults(progress, good).progress;
      expect(levelFor(progress, 'articulacao')).toBe(1);
    }
    const result = applySessionResults(progress, good);
    expect(levelFor(result.progress, 'articulacao')).toBe(2);
    expect(result.leveledUp.length).toBe(1);
  });

  it('uma execucao ruim zera o streak', () => {
    let progress = initialProgress();
    progress = applySessionResults(progress, [attempt('art-l1-arara', 95)]).progress;
    expect(progress.find((p) => p.track === 'articulacao')!.streakAtLevel).toBe(1);

    progress = applySessionResults(progress, [
      attempt('art-l1-arara', 95),
      attempt('art-l1-lento', LEVEL_UP_SCORE - 10),
    ]).progress;
    expect(progress.find((p) => p.track === 'articulacao')!.streakAtLevel).toBe(0);
  });

  it('nao passa do nivel maximo da trilha', () => {
    let progress = initialProgress().map((p) =>
      p.track === 'ddk' ? { ...p, level: 4 } : p);
    for (let i = 0; i < 12; i++) {
      progress = applySessionResults(progress, [attempt('ddk-pataka', 99)]).progress;
    }
    expect(levelFor(progress, 'ddk')).toBe(4);
  });

  it('tentativa nao pontuavel nao afeta a progressao', () => {
    const progress = initialProgress();
    const result = applySessionResults(progress, [attempt('art-l1-arara', -1)]);
    expect(result.progress.find((p) => p.track === 'articulacao')!.streakAtLevel).toBe(0);
    expect(result.leveledUp.length).toBe(0);
  });

  it('exercicio errado entra na fila de revisao para o dia seguinte', () => {
    const reviews = updateReviews([], [attempt('art-l4-gra', 55)]);
    expect(reviews.length).toBe(1);
    expect(reviews[0].stage).toBe(0);
    expect(dueReviews(reviews, new Date()).length).toBe(0);

    const amanha = new Date(Date.now() + 25 * 3600 * 1000);
    expect(dueReviews(reviews, amanha).length).toBe(1);
  });

  it('acertar sobe um degrau por vez ate graduar', () => {
    let reviews: ReviewItem[] = updateReviews([], [attempt('art-l4-gra', 40)]);
    expect(reviews[0].stage).toBe(0);

    // Um acerto por degrau da escada (1, 3, 7 e 14 dias). So depois de passar
    // no ultimo intervalo o item sai da fila — graduar exige sobreviver ao
    // esquecimento de duas semanas, nao acertar tres vezes seguidas no mesmo dia.
    for (let stage = 1; stage < REVIEW_INTERVALS.length; stage++) {
      reviews = updateReviews(reviews, [attempt('art-l4-gra', 95)]);
      expect(reviews.length).toBe(1);
      expect(reviews[0].stage).toBe(stage);
    }

    reviews = updateReviews(reviews, [attempt('art-l4-gra', 95)]);
    expect(reviews.length).toBe(0);
  });

  it('errar de novo devolve ao primeiro degrau e conta a recaida', () => {
    let reviews = updateReviews([], [attempt('art-l4-gra', 40)]);
    reviews = updateReviews(reviews, [attempt('art-l4-gra', 95)]);
    expect(reviews[0].stage).toBe(1);
    reviews = updateReviews(reviews, [attempt('art-l4-gra', 30)]);
    expect(reviews[0].stage).toBe(0);
    expect(reviews[0].lapses).toBe(2);
  });
});

// ---------------------------------------------------------------- sessao

describe('sessao diaria', () => {
  it('monta quatro blocos e cabe na meta de tempo', () => {
    const plan = buildSession(initialProgress(), []);
    expect(plan.blocks.length).toBe(4);
    expect(plan.exerciseIds.length).toBeGreaterThan(6);
    expect(plan.estimatedSec).toBeGreaterThan(240);
    expect(plan.estimatedSec).toBeLessThan(1200);   // ate 20 min
  });

  it('todo id do plano existe no catalogo', () => {
    const plan = buildSession(initialProgress(), []);
    for (const id of plan.exerciseIds) {
      expect(Boolean(getExercise(id))).toBeTruthy();
    }
  });

  it('e estavel dentro do mesmo dia', () => {
    const d = new Date('2026-09-01T08:00:00');
    const a = buildSession(initialProgress(), [], d);
    const b = buildSession(initialProgress(), [], new Date('2026-09-01T21:00:00'));
    expect(a.exerciseIds.join(',')).toBe(b.exerciseIds.join(','));
  });

  it('varia entre dias diferentes', () => {
    const a = buildSession(initialProgress(), [], new Date('2026-09-01T08:00:00'));
    const b = buildSession(initialProgress(), [], new Date('2026-09-08T08:00:00'));
    expect(a.exerciseIds.join(',') === b.exerciseIds.join(',')).toBeFalsy();
  });

  it('a linha de base nunca muda entre os dias', () => {
    const a = buildSession(initialProgress(), [], new Date('2026-09-01T08:00:00'));
    const b = buildSession(initialProgress(), [], new Date('2026-11-20T08:00:00'));
    // Busca pelo id, nunca pelo titulo: titulo e texto de interface e muda.
    const baseA = a.blocks.find((x) => x.id === 'medida')!.exerciseIds;
    const baseB = b.blocks.find((x) => x.id === 'medida')!.exerciseIds;
    expect(baseA.join(',')).toBe(baseB.join(','));
  });

  it('revisao vencida entra no bloco de foco', () => {
    const ontem = new Date(Date.now() - 2 * 86400000).toISOString();
    const reviews: ReviewItem[] = [
      { exerciseId: 'art-l4-gra', dueAt: ontem, stage: 0, lapses: 1 },
    ];
    const plan = buildSession(initialProgress(), reviews);
    const focus = plan.blocks.find((b) => b.id === 'foco')!;
    expect(focus.exerciseIds).toContain('art-l4-gra');
    expect(focus.subtitle).toContain('revisão');
  });

  it('nivel mais alto traz exercicios mais avancados', () => {
    const progress = initialProgress().map((p) =>
      p.track === 'articulacao' ? { ...p, level: 8 } : p);
    const plan = buildSession(progress, []);
    const focusIds = plan.blocks[1].exerciseIds;
    const levels = focusIds.map((id) => getExercise(id)!.level);
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(7);
  });
});
