/**
 * Tela de exercício + tela de resultado. São o mesmo fluxo, por isso o mesmo arquivo.
 *
 * Durante a gravação a tela mostra o nível e o tom ao vivo. Isso não é enfeite:
 * o retorno visual imediato é parte do efeito terapêutico — você corrige no meio
 * da fala, e não depois de ler um relatório.
 */

import { h, fmtDuration, fmtNumber } from '../dom.ts';
import { waveformChart } from '../charts.ts';
import { registerScreen, type AppContext } from '../app.ts';
import type { SessionPlan } from '../../engine/session.ts';
import { getExercise } from '../../content/exercises.ts';
import type { Exercise } from '../../content/types.ts';
import { analyzeAsync, disposeAnalysisWorker } from '../../workers/client.ts';
import type { AnalysisCurves } from '../../dsp/types.ts';
import { encodeWav } from '../../audio/wav.ts';
import { resample, ANALYSIS_RATE } from '../../dsp/resample.ts';
import { normalizePcm } from '../../dsp/gain.ts';
import { speak, stopSpeaking } from '../../audio/speech.ts';
import { micSupport } from '../../audio/capture.ts';
import { scoreAttempt, scoreLabel } from '../../scoring/score.ts';
import { newId, type Attempt, type Settings } from '../../data/model.ts';
import {
  bestAttempt, getReviews, saveAttempt, saveProgress, saveReviews, saveSession, setPinned,
} from '../../data/store.ts';
import { loadAudio, makeAudioRef, saveAudio } from '../../data/audioStore.ts';
import { applySessionResults, updateReviews } from '../../engine/progression.ts';

/** Curvas da ultima analise. Ficam so em memoria — nao vao para o banco (ADR-003). */
let lastCurves: AnalysisCurves | null = null;
let lastBlobUrl: string | null = null;

export function startPractice(ctx: AppContext, plan: SessionPlan): void {
  if (plan.exerciseIds.length === 0) {
    ctx.toast('Não há exercício nenhum neste plano.', 'error');
    return;
  }
  const support = micSupport();
  if (!support.ok) {
    ctx.toast(support.reason ?? 'O microfone não está disponível.', 'error');
    return;
  }

  ctx.state.practice = {
    plan,
    index: 0,
    session: {
      id: newId('s'),
      startedAt: new Date().toISOString(),
      endedAt: null,
      attemptIds: [],
      plan: plan.exerciseIds,
      completed: false,
    },
    attempts: [],
    last: null,
  };
  ctx.go('practice');
  // Prepara o grafo de audio ja: no iOS a primeira chamada e lenta e comeria o
  // inicio do primeiro enunciado.
  void ctx.recorder.prepare().catch(() => { /* o erro real aparece ao gravar */ });
}

// ============================================================ tela de exercicio

function renderPractice(ctx: AppContext): HTMLElement {
  const p = ctx.state.practice;
  if (!p) {
    ctx.go('home');
    return h('div');
  }
  const exercise = getExercise(p.plan.exerciseIds[p.index]);
  if (!exercise) {
    void finishSession(ctx);
    return h('div');
  }

  const root = h('div', { class: 'screen practice' });

  // ---------------------------------------------- topo: progresso da sessao
  const total = p.plan.exerciseIds.length;
  root.appendChild(h('div', { class: 'practice-top' },
    (() => {
      const b = h('button', { class: 'icon-btn', text: '✕', aria: { label: 'Encerrar treino' } });
      b.addEventListener('click', () => void abortSession(ctx));
      return b;
    })(),
    h('div', { class: 'practice-progress' },
      h('div', {
        class: 'practice-progress-fill',
        style: `width:${((p.index) / total) * 100}%`,
      }),
    ),
    h('span', { class: 'practice-count', text: `${p.index + 1}/${total}` }),
  ));

  // ---------------------------------------------- prompt
  root.appendChild(h('div', { class: 'exercise-head' },
    h('span', { class: 'exercise-track', text: trackLabel(exercise) }),
    h('h2', { class: 'exercise-title', text: exercise.title }),
  ));

  const promptClass = exercise.prompt.length > 90 ? 'prompt long' : 'prompt';
  root.appendChild(h('p', { class: promptClass, text: exercise.prompt }));

  if (exercise.hint) {
    root.appendChild(h('p', { class: 'hint', text: exercise.hint }));
  }

  // ---------------------------------------------- ouvir o modelo
  const modelText = exercise.modelText ?? (exercise.selfReport ? null : exercise.prompt);
  if (modelText) {
    const row = h('div', { class: 'model-row' });
    const normal = h('button', { class: 'btn ghost', text: '▶ Ouvir como é' });
    normal.addEventListener('click', () => void speak(modelText, { rate: 0.9 }));
    const slow = h('button', { class: 'btn ghost', text: '▶ Bem devagar' });
    slow.addEventListener('click', () => void speak(modelText, { rate: 0.45 }));
    row.appendChild(normal);
    row.appendChild(slow);
    root.appendChild(row);
  }

  // ---------------------------------------------- biofeedback ao vivo
  const meter = h('div', { class: 'meter' },
    h('div', { class: 'meter-fill', id: 'meter-fill' }),
    h('div', { class: 'meter-target' }),
  );
  const pitchDot = h('div', { class: 'pitch-dot', id: 'pitch-dot' });
  const pitchLane = h('div', { class: 'pitch-lane' }, pitchDot);
  const timer = h('div', { class: 'timer', id: 'timer', text: '0,0s' });

  root.appendChild(h('div', { class: 'live', id: 'live' }, timer, meter, pitchLane));

  // ---------------------------------------------- botao de gravar
  const recordBtn = h('button', { class: 'record', id: 'record' },
    h('span', { class: 'record-icon' }),
    h('span', { class: 'record-label', text: exercise.selfReport ? 'Marcar como feito' : 'Gravar' }),
  );
  root.appendChild(recordBtn);

  const skip = h('button', { class: 'btn ghost wide', text: 'Pular' });
  skip.addEventListener('click', () => advance(ctx));
  root.appendChild(skip);

  if (exercise.selfReport) {
    recordBtn.addEventListener('click', () => void registerSelfReport(ctx, exercise));
  } else {
    wireRecording(ctx, exercise, recordBtn, root);
  }

  return root;
}

function trackLabel(ex: Exercise): string {
  const map: Record<string, string> = {
    motricidade: 'Aquecimento',
    ddk: 'Agilidade',
    articulacao: 'O som do R',
    respiracao: 'Fôlego',
    oratoria: 'Falar bem',
  };
  return `${map[ex.track] ?? ex.track} · degrau ${ex.level}`;
}

function wireRecording(
  ctx: AppContext,
  exercise: Exercise,
  button: HTMLElement,
  root: HTMLElement,
): void {
  let recording = false;
  let autoStop: ReturnType<typeof setTimeout> | null = null;

  const meterFill = root.querySelector<HTMLElement>('#meter-fill');
  const pitchDot = root.querySelector<HTMLElement>('#pitch-dot');
  const timer = root.querySelector<HTMLElement>('#timer');
  const label = button.querySelector<HTMLElement>('.record-label');

  const stop = async () => {
    if (!recording) return;
    recording = false;
    if (autoStop) clearTimeout(autoStop);
    button.classList.remove('recording');
    button.classList.add('analyzing');
    if (label) label.textContent = 'Analisando…';
    button.setAttribute('disabled', 'true');
    ctx.recorder.onLevel(null);

    try {
      const rec = await ctx.recorder.stop();
      await handleRecording(ctx, exercise, rec.pcm, rec.sampleRate);
    } catch (err) {
      ctx.toast(`Falha ao gravar: ${(err as Error).message}`, 'error');
      button.classList.remove('analyzing');
      button.removeAttribute('disabled');
      if (label) label.textContent = 'Gravar';
    }
  };

  const start = async () => {
    stopSpeaking();
    try {
      await ctx.recorder.start();
    } catch (err) {
      ctx.toast(
        `Microfone bloqueado: ${(err as Error).message}. Verifique a permissao no navegador.`,
        'error',
      );
      return;
    }
    recording = true;
    button.classList.add('recording');
    if (label) label.textContent = 'Parar';

    ctx.recorder.onLevel((level) => {
      if (meterFill) {
        // `display` ja vem escalado pelo pico recente da propria gravacao. Um
        // mapeamento fixo de dBFS deixava a barra praticamente imovel, porque o
        // ganho automatico do sistema esta desligado e o sinal cru e fraco.
        meterFill.style.width = `${Math.round(level.display * 100)}%`;
        meterFill.classList.toggle('hot', level.peak > 0.94);
      }
      if (pitchDot) {
        if (level.f0 > 0) {
          // 70-320 Hz cobre a faixa de fala; o ponto sobe conforme o tom.
          const norm = Math.max(0, Math.min(1, (level.f0 - 70) / 250));
          pitchDot.style.bottom = `${norm * 100}%`;
          pitchDot.classList.add('on');
        } else {
          pitchDot.classList.remove('on');
        }
      }
      if (timer) timer.textContent = `${level.elapsedSec.toFixed(1).replace('.', ',')}s`;
    });

    // Parada automatica no limite do exercicio, com folga de 50%: ninguem quer
    // ser cortado no meio de uma frase.
    const limit = (exercise.durationSec ?? 30) * 1.5;
    autoStop = setTimeout(() => void stop(), limit * 1000);
  };

  button.addEventListener('click', () => {
    if (recording) void stop();
    else void start();
  });
}

async function handleRecording(
  ctx: AppContext,
  exercise: Exercise,
  pcm: Float32Array,
  sampleRate: number,
): Promise<void> {
  const p = ctx.state.practice;
  if (!p) return;

  const wantsDdk = exercise.kind === 'ddk';
  const wantsMpt = exercise.kind === 'sustentacao';
  // Roda no worker: uma gravacao de 90 s leva alguns segundos e congelaria a tela.
  const { metrics, curves } = await analyzeAsync(pcm, sampleRate, { ddk: wantsDdk, mpt: wantsMpt });
  const result = scoreAttempt(metrics, exercise, ctx.state.settings);

  const attemptId = newId('a');
  let audioRef: string | null = null;

  // Guarda o audio ja reamostrado: e o mesmo sinal que foi analisado, e ocupa
  // um terco do espaco do original a 48 kHz.
  if (metrics.timing.totalSec > 0.3) {
    try {
      // Normaliza antes de guardar: com o ganho do sistema desligado, o sinal
      // cru fica baixo demais para ouvir no celular. O ganho e constante ao
      // longo da gravacao, entao a comparacao "hoje x mes passado" continua
      // valendo — o que mudaria seria um ganho variavel, tipo o AGC.
      const down = normalizePcm(resample(pcm, sampleRate, ANALYSIS_RATE)).pcm;
      audioRef = makeAudioRef(attemptId);
      await saveAudio(audioRef, encodeWav(down, ANALYSIS_RATE));
    } catch (err) {
      audioRef = null;
      ctx.toast(`Metricas salvas, mas o audio nao coube: ${(err as Error).message}`, 'error');
    }
  }

  const attempt: Attempt = {
    id: attemptId,
    exerciseId: exercise.id,
    sessionId: p.session.id,
    at: new Date().toISOString(),
    audioRef,
    pinned: false,
    durationSec: metrics.timing.totalSec,
    metrics,
    score: result.score,
    flags: result.flags,
    feedback: [result.headline, ...result.details],
  };

  await saveAttempt(attempt);
  p.attempts.push(attempt);
  p.session.attemptIds.push(attempt.id);
  p.last = attempt;
  lastCurves = curves;

  ctx.go('feedback');
}

async function registerSelfReport(ctx: AppContext, exercise: Exercise): Promise<void> {
  const p = ctx.state.practice;
  if (!p) return;
  const attempt: Attempt = {
    id: newId('a'),
    exerciseId: exercise.id,
    sessionId: p.session.id,
    at: new Date().toISOString(),
    audioRef: null,
    pinned: false,
    durationSec: exercise.durationSec ?? 30,
    metrics: {
      schemaVersion: 1, sampleRate: ANALYSIS_RATE,
      f0: { meanHz: 0, medianHz: 0, sdSemitones: 0, rangeSemitones: 0, minHz: 0, maxHz: 0, voicedRatio: 0 },
      intensity: {
        meanDb: 0, sdDb: 0, peakDb: 0, noiseFloorDb: 0, snrDb: 0, clippingRatio: 0,
        inputPeakDb: 0, appliedGain: 1,
      },
      timing: {
        totalSec: exercise.durationSec ?? 30, speechSec: 0, pauseCount: 0, pauseTotalSec: 0,
        longestPauseSec: 0, syllableCount: 0, speechRate: 0, articulationRate: 0,
        filledPauseCount: 0, filledPauseTotalSec: 0, filledPausePerMin: 0,
      },
      voiceQuality: { jitterPct: 0, shimmerPct: 0, hnrDb: 0, reliable: false },
      warnings: [],
    },
    score: 100,
    flags: [],
    feedback: ['Exercício feito.'],
  };
  await saveAttempt(attempt);
  p.attempts.push(attempt);
  p.session.attemptIds.push(attempt.id);
  advance(ctx);
}

// ============================================================ tela de feedback

function renderFeedback(ctx: AppContext): HTMLElement {
  const p = ctx.state.practice;
  const attempt = p?.last;
  if (!p || !attempt) {
    ctx.go('home');
    return h('div');
  }
  const exercise = getExercise(attempt.exerciseId);
  const root = h('div', { class: 'screen feedback' });

  const [headline, ...details] = attempt.feedback;
  const scorable = attempt.score >= 0 && !exercise?.selfReport;

  // ---------------------------------------------- manchete
  root.appendChild(h('div', { class: `verdict ${verdictClass(attempt.score, scorable)}` },
    scorable
      ? h('div', { class: 'verdict-score' },
          h('span', { class: 'verdict-number', text: String(attempt.score) }),
          h('span', { class: 'verdict-label', text: scoreLabel(attempt.score) }),
        )
      : h('div', { class: 'verdict-score' }, h('span', { class: 'verdict-number', text: '—' })),
    h('p', { class: 'verdict-headline', text: headline ?? '' }),
  ));

  // ---------------------------------------------- grafico
  if (lastCurves && attempt.durationSec > 0.3) {
    root.appendChild(h('section', { class: 'card' },
      waveformChart({
        waveform: lastCurves.waveform,
        f0: lastCurves.f0,
        f0Times: lastCurves.f0Times,
        durationSec: attempt.durationSec,
        pauses: lastCurves.pauses,
        filledPauses: lastCurves.filledPauses,
        nuclei: lastCurves.syllableNuclei,
      }),
      h('div', { class: 'legend' },
        h('span', { class: 'legend-item wave', text: 'volume' }),
        h('span', { class: 'legend-item pitch', text: 'tom' }),
        h('span', { class: 'legend-item pause', text: 'pausa' }),
        h('span', { class: 'legend-item filled', text: 'som esticado' }),
      ),
    ));
  }

  // ---------------------------------------------- detalhes
  if (details.length > 0) {
    const list = h('ul', { class: 'advice' });
    for (const d of details) list.appendChild(h('li', { text: d }));
    root.appendChild(h('section', { class: 'card' }, list));
  }

  // ---------------------------------------------- criterios
  const criteria = criterionRows(attempt, ctx.state.settings);
  if (criteria.length > 0) {
    root.appendChild(h('section', { class: 'card' },
      h('h2', { text: 'O que foi avaliado' }),
      ...criteria,
    ));
  }

  // ---------------------------------------------- numeros
  root.appendChild(metricsCard(attempt));

  // ---------------------------------------------- audio
  if (attempt.audioRef) {
    root.appendChild(audioCard(ctx, attempt));
  }

  // ---------------------------------------------- acoes
  const actions = h('div', { class: 'actions' });
  const again = h('button', { class: 'btn primary wide', text: 'Tentar de novo' });
  again.addEventListener('click', () => {
    p.last = null;
    ctx.go('practice');
  });
  const next = h('button', { class: 'btn wide', text: isLast(p) ? 'Encerrar treino' : 'Proximo →' });
  next.addEventListener('click', () => advance(ctx));
  actions.appendChild(again);
  actions.appendChild(next);
  root.appendChild(actions);

  // Modo maos-livres: avanca sozinho, para treinar em pe, sem tocar na tela.
  if (ctx.state.settings.handsFree && attempt.score >= 0) {
    const timer = setTimeout(() => advance(ctx), 6000);
    root.addEventListener('click', () => clearTimeout(timer), { once: true });
  }

  return root;
}

function verdictClass(score: number, scorable: boolean): string {
  if (!scorable) return 'neutral';
  if (score >= 85) return 'good';
  if (score >= 65) return 'ok';
  return 'attention';
}

function isLast(p: NonNullable<AppContext['state']['practice']>): boolean {
  return p.index >= p.plan.exerciseIds.length - 1;
}

function criterionRows(attempt: Attempt, settings: Settings): HTMLElement[] {
  const exercise = getExercise(attempt.exerciseId);
  if (!exercise || attempt.score < 0) return [];

  // Recalcula a partir das metricas salvas: nao guardamos os criterios no banco
  // porque eles sao funcao pura de (metricas, rubrica, rigor) e mudam quando a
  // calibracao muda. Recalcular mantem a exibicao coerente com a rubrica atual.
  const rows: HTMLElement[] = [];
  const result = scoreAttempt(attempt.metrics, exercise, settings);

  for (const c of result.criteria) {
    rows.push(h('div', { class: `criterion ${c.verdict}` },
      h('span', { class: 'criterion-label', text: c.label }),
      h('div', { class: 'criterion-bar' },
        h('div', { class: 'criterion-fill', style: `width:${Math.round(c.score * 100)}%` }),
      ),
      h('span', { class: 'criterion-value', text: `${Math.round(c.score * 100)}` }),
    ));
  }
  return rows;
}

function metricsCard(attempt: Attempt): HTMLElement {
  const m = attempt.metrics;
  const items: Array<[string, string]> = [];

  items.push(['Duração', fmtDuration(m.timing.totalSec)]);
  if (m.mpt) items.push(['Fôlego', `${fmtNumber(m.mpt.seconds)} s`]);
  if (m.ddk && m.ddk.count > 0) {
    items.push(['Velocidade', `${fmtNumber(m.ddk.syllPerSec)} sílabas/s`]);
    items.push(['Fora do compasso', `${fmtNumber(m.ddk.cvPercent, 0)}%`]);
  }
  if (m.timing.syllableCount >= 4) {
    items.push(['Ritmo', `${fmtNumber(m.timing.articulationRate)} sílabas/s`]);
  }
  if (m.f0.voicedRatio > 0.2) {
    items.push(['Tom da voz', `${Math.round(m.f0.meanHz)} Hz`]);
    // Semitons: a mesma unidade da música. Abaixo de ~1,5 a fala soa monotona.
    items.push(['Variação do tom', `${fmtNumber(m.f0.sdSemitones)} semitons`]);
  }
  if (m.timing.pauseCount > 0) {
    items.push(['Pausas', `${m.timing.pauseCount} · ${fmtDuration(m.timing.pauseTotalSec)}`]);
  }
  if (m.timing.filledPauseCount > 0) {
    items.push(['Sons esticados', String(m.timing.filledPauseCount)]);
  }
  // Só aparece quando o microfone pegou fraco: é acionável, não é enfeite.
  if (m.intensity.inputPeakDb < -38 && m.intensity.inputPeakDb > -100) {
    items.push(['Captação', 'fraca — chegue mais perto']);
  }

  const grid = h('div', { class: 'metric-grid' });
  for (const [label, value] of items) {
    grid.appendChild(h('div', { class: 'metric' },
      h('span', { class: 'metric-value', text: value }),
      h('span', { class: 'metric-label', text: label }),
    ));
  }
  return h('section', { class: 'card' }, h('h2', { text: 'Seus números' }), grid);
}

function audioCard(ctx: AppContext, attempt: Attempt): HTMLElement {
  const card = h('section', { class: 'card' }, h('h2', { text: 'Ouvir' }));
  const row = h('div', { class: 'audio-row' });

  const playMine = h('button', { class: 'btn', text: '▶ Ouvir você' });
  playMine.addEventListener('click', () => void playRef(ctx, attempt.audioRef));
  row.appendChild(playMine);

  const playBest = h('button', { class: 'btn ghost', text: '▶ Sua melhor vez' });
  playBest.addEventListener('click', async () => {
    const best = await bestAttempt(attempt.exerciseId);
    if (!best || best.id === attempt.id || !best.audioRef) {
      ctx.toast('Ainda não existe uma gravação anterior melhor para comparar.', 'info');
      return;
    }
    await playRef(ctx, best.audioRef);
  });
  row.appendChild(playBest);

  const pin = h('button', {
    class: 'btn ghost',
    text: attempt.pinned ? '★ Fixada' : '☆ Fixar',
  });
  pin.addEventListener('click', async () => {
    const next = !attempt.pinned;
    await setPinned(attempt.id, next);
    attempt.pinned = next;
    pin.textContent = next ? '★ Fixada' : '☆ Fixar';
    ctx.toast(
      next ? 'Gravação fixada. Ela não vai ser apagada.' : 'Gravação desafixada.',
      'ok',
    );
  });
  row.appendChild(pin);

  card.appendChild(row);
  card.appendChild(h('p', {
    class: 'muted small',
    text: 'As gravações são apagadas depois de 30 dias, menos as que você fixar. Seus números ficam para sempre.',
  }));
  return card;
}

async function playRef(ctx: AppContext, ref: string | null): Promise<void> {
  if (!ref) return;
  const blob = await loadAudio(ref);
  if (!blob) {
    ctx.toast('Esta gravação já foi apagada pelo tempo. Seus números continuam guardados.', 'info');
    return;
  }
  if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
  lastBlobUrl = URL.createObjectURL(blob);
  const audio = new Audio(lastBlobUrl);
  await audio.play().catch(() => ctx.toast('Nao consegui reproduzir o audio.', 'error'));
}

// ============================================================ navegacao

function advance(ctx: AppContext): void {
  const p = ctx.state.practice;
  if (!p) return;
  p.last = null;
  p.index++;
  if (p.index >= p.plan.exerciseIds.length) {
    void finishSession(ctx);
    return;
  }
  ctx.go('practice');
}

async function abortSession(ctx: AppContext): Promise<void> {
  const p = ctx.state.practice;
  if (p && p.attempts.length > 0) {
    await persistSession(ctx, false);
  }
  await ctx.recorder.release();
  disposeAnalysisWorker();
  ctx.state.practice = null;
  ctx.go('home');
}

async function finishSession(ctx: AppContext): Promise<void> {
  const p = ctx.state.practice;
  if (!p) {
    ctx.go('home');
    return;
  }
  const leveled = await persistSession(ctx, true);
  await ctx.recorder.release();
  disposeAnalysisWorker();

  const done = p.attempts.length;
  ctx.state.practice = null;
  await ctx.reload();

  if (leveled.length > 0) {
    const names = leveled.map((l) => `${l.track} → nivel ${l.level}`).join(', ');
    ctx.toast(`Subiu de nivel: ${names}`, 'ok');
  } else if (done > 0) {
    ctx.toast(`Treino concluido: ${done} exercicios.`, 'ok');
  }
  ctx.go('home');
}

async function persistSession(
  ctx: AppContext,
  completed: boolean,
): Promise<Array<{ track: string; level: number }>> {
  const p = ctx.state.practice;
  if (!p) return [];

  p.session.endedAt = new Date().toISOString();
  p.session.completed = completed;
  await saveSession(p.session);

  const { progress, leveledUp } = applySessionResults(ctx.state.progress, p.attempts);
  await saveProgress(progress);
  ctx.state.progress = progress;

  const reviews = updateReviews(await getReviews(), p.attempts);
  await saveReviews(reviews);
  ctx.state.reviews = reviews;

  return leveledUp;
}

registerScreen('practice', renderPractice);
registerScreen('feedback', renderFeedback);
