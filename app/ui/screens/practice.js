/**
 * Tela de exercicio + tela de feedback. Sao o mesmo fluxo e por isso o mesmo arquivo.
 *
 * Durante a gravacao a tela mostra biofeedback ao vivo (nivel + tom). Isso nao e
 * enfeite: o retorno visual imediato e parte do mecanismo terapeutico — voce
 * corrige no meio da producao, nao depois de ler um relatorio.
 */
import { h, fmtDuration, fmtNumber } from "../dom.js";
import { waveformChart } from "../charts.js";
import { registerScreen } from "../app.js";
import { getExercise } from "../../content/exercises.js";
import { analyzeAsync, disposeAnalysisWorker } from "../../workers/client.js";
import { encodeWav } from "../../audio/wav.js";
import { resample, ANALYSIS_RATE } from "../../dsp/resample.js";
import { speak, stopSpeaking } from "../../audio/speech.js";
import { micSupport } from "../../audio/capture.js";
import { scoreAttempt, scoreLabel } from "../../scoring/score.js";
import { newId } from "../../data/model.js";
import { bestAttempt, getReviews, saveAttempt, saveProgress, saveReviews, saveSession, setPinned, } from "../../data/store.js";
import { loadAudio, makeAudioRef, saveAudio } from "../../data/audioStore.js";
import { applySessionResults, updateReviews } from "../../engine/progression.js";
/** Curvas da ultima analise. Ficam so em memoria — nao vao para o banco (ADR-003). */
let lastCurves = null;
let lastBlobUrl = null;
export function startPractice(ctx, plan) {
    if (plan.exerciseIds.length === 0) {
        ctx.toast('Nenhum exercicio neste plano.', 'error');
        return;
    }
    const support = micSupport();
    if (!support.ok) {
        ctx.toast(support.reason ?? 'Microfone indisponivel.', 'error');
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
    void ctx.recorder.prepare().catch(() => { });
}
// ============================================================ tela de exercicio
function renderPractice(ctx) {
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
    root.appendChild(h('div', { class: 'practice-top' }, (() => {
        const b = h('button', { class: 'icon-btn', text: '✕', aria: { label: 'Encerrar treino' } });
        b.addEventListener('click', () => void abortSession(ctx));
        return b;
    })(), h('div', { class: 'practice-progress' }, h('div', {
        class: 'practice-progress-fill',
        style: `width:${((p.index) / total) * 100}%`,
    })), h('span', { class: 'practice-count', text: `${p.index + 1}/${total}` })));
    // ---------------------------------------------- prompt
    root.appendChild(h('div', { class: 'exercise-head' }, h('span', { class: 'exercise-track', text: trackLabel(exercise) }), h('h2', { class: 'exercise-title', text: exercise.title })));
    const promptClass = exercise.prompt.length > 90 ? 'prompt long' : 'prompt';
    root.appendChild(h('p', { class: promptClass, text: exercise.prompt }));
    if (exercise.hint) {
        root.appendChild(h('p', { class: 'hint', text: exercise.hint }));
    }
    // ---------------------------------------------- ouvir o modelo
    const modelText = exercise.modelText ?? (exercise.selfReport ? null : exercise.prompt);
    if (modelText) {
        const row = h('div', { class: 'model-row' });
        const normal = h('button', { class: 'btn ghost', text: '▶ Ouvir modelo' });
        normal.addEventListener('click', () => void speak(modelText, { rate: 0.9 }));
        const slow = h('button', { class: 'btn ghost', text: '▶ Camera lenta' });
        slow.addEventListener('click', () => void speak(modelText, { rate: 0.45 }));
        row.appendChild(normal);
        row.appendChild(slow);
        root.appendChild(row);
    }
    // ---------------------------------------------- biofeedback ao vivo
    const meter = h('div', { class: 'meter' }, h('div', { class: 'meter-fill', id: 'meter-fill' }), h('div', { class: 'meter-target' }));
    const pitchDot = h('div', { class: 'pitch-dot', id: 'pitch-dot' });
    const pitchLane = h('div', { class: 'pitch-lane' }, pitchDot);
    const timer = h('div', { class: 'timer', id: 'timer', text: '0,0s' });
    root.appendChild(h('div', { class: 'live', id: 'live' }, timer, meter, pitchLane));
    // ---------------------------------------------- botao de gravar
    const recordBtn = h('button', { class: 'record', id: 'record' }, h('span', { class: 'record-icon' }), h('span', { class: 'record-label', text: exercise.selfReport ? 'Marcar como feito' : 'Gravar' }));
    root.appendChild(recordBtn);
    const skip = h('button', { class: 'btn ghost wide', text: 'Pular este' });
    skip.addEventListener('click', () => advance(ctx));
    root.appendChild(skip);
    if (exercise.selfReport) {
        recordBtn.addEventListener('click', () => void registerSelfReport(ctx, exercise));
    }
    else {
        wireRecording(ctx, exercise, recordBtn, root);
    }
    return root;
}
function trackLabel(ex) {
    const map = {
        motricidade: 'Motricidade',
        ddk: 'Agilidade',
        articulacao: 'Articulacao do R',
        respiracao: 'Respiracao',
        oratoria: 'Oratoria',
    };
    return `${map[ex.track] ?? ex.track} · nivel ${ex.level}`;
}
function wireRecording(ctx, exercise, button, root) {
    let recording = false;
    let autoStop = null;
    const meterFill = root.querySelector('#meter-fill');
    const pitchDot = root.querySelector('#pitch-dot');
    const timer = root.querySelector('#timer');
    const label = button.querySelector('.record-label');
    const stop = async () => {
        if (!recording)
            return;
        recording = false;
        if (autoStop)
            clearTimeout(autoStop);
        button.classList.remove('recording');
        button.classList.add('analyzing');
        if (label)
            label.textContent = 'Analisando…';
        button.setAttribute('disabled', 'true');
        ctx.recorder.onLevel(null);
        try {
            const rec = await ctx.recorder.stop();
            await handleRecording(ctx, exercise, rec.pcm, rec.sampleRate);
        }
        catch (err) {
            ctx.toast(`Falha ao gravar: ${err.message}`, 'error');
            button.classList.remove('analyzing');
            button.removeAttribute('disabled');
            if (label)
                label.textContent = 'Gravar';
        }
    };
    const start = async () => {
        stopSpeaking();
        try {
            await ctx.recorder.start();
        }
        catch (err) {
            ctx.toast(`Microfone bloqueado: ${err.message}. Verifique a permissao no navegador.`, 'error');
            return;
        }
        recording = true;
        button.classList.add('recording');
        if (label)
            label.textContent = 'Parar';
        ctx.recorder.onLevel((level) => {
            if (meterFill) {
                // dBFS mapeado para 0-100%: escala logaritmica corresponde melhor a
                // percepcao de volume do que o RMS linear.
                const db = level.rms > 1e-5 ? 20 * Math.log10(level.rms) : -60;
                const pct = Math.max(0, Math.min(100, ((db + 55) / 50) * 100));
                meterFill.style.width = `${pct}%`;
                meterFill.classList.toggle('hot', level.peak > 0.94);
            }
            if (pitchDot) {
                if (level.f0 > 0) {
                    // 70-320 Hz cobre a faixa de fala; o ponto sobe conforme o tom.
                    const norm = Math.max(0, Math.min(1, (level.f0 - 70) / 250));
                    pitchDot.style.bottom = `${norm * 100}%`;
                    pitchDot.classList.add('on');
                }
                else {
                    pitchDot.classList.remove('on');
                }
            }
            if (timer)
                timer.textContent = `${level.elapsedSec.toFixed(1).replace('.', ',')}s`;
        });
        // Parada automatica no limite do exercicio, com folga de 50%: ninguem quer
        // ser cortado no meio de uma frase.
        const limit = (exercise.durationSec ?? 30) * 1.5;
        autoStop = setTimeout(() => void stop(), limit * 1000);
    };
    button.addEventListener('click', () => {
        if (recording)
            void stop();
        else
            void start();
    });
}
async function handleRecording(ctx, exercise, pcm, sampleRate) {
    const p = ctx.state.practice;
    if (!p)
        return;
    const wantsDdk = exercise.kind === 'ddk';
    const wantsMpt = exercise.kind === 'sustentacao';
    // Roda no worker: uma gravacao de 90 s leva alguns segundos e congelaria a tela.
    const { metrics, curves } = await analyzeAsync(pcm, sampleRate, { ddk: wantsDdk, mpt: wantsMpt });
    const result = scoreAttempt(metrics, exercise, ctx.state.settings);
    const attemptId = newId('a');
    let audioRef = null;
    // Guarda o audio ja reamostrado: e o mesmo sinal que foi analisado, e ocupa
    // um terco do espaco do original a 48 kHz.
    if (metrics.timing.totalSec > 0.3) {
        try {
            const down = resample(pcm, sampleRate, ANALYSIS_RATE);
            audioRef = makeAudioRef(attemptId);
            await saveAudio(audioRef, encodeWav(down, ANALYSIS_RATE));
        }
        catch (err) {
            audioRef = null;
            ctx.toast(`Metricas salvas, mas o audio nao coube: ${err.message}`, 'error');
        }
    }
    const attempt = {
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
async function registerSelfReport(ctx, exercise) {
    const p = ctx.state.practice;
    if (!p)
        return;
    const attempt = {
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
            intensity: { meanDb: 0, sdDb: 0, peakDb: 0, noiseFloorDb: 0, snrDb: 0, clippingRatio: 0 },
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
        feedback: ['Exercicio guiado concluido.'],
    };
    await saveAttempt(attempt);
    p.attempts.push(attempt);
    p.session.attemptIds.push(attempt.id);
    advance(ctx);
}
// ============================================================ tela de feedback
function renderFeedback(ctx) {
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
    root.appendChild(h('div', { class: `verdict ${verdictClass(attempt.score, scorable)}` }, scorable
        ? h('div', { class: 'verdict-score' }, h('span', { class: 'verdict-number', text: String(attempt.score) }), h('span', { class: 'verdict-label', text: scoreLabel(attempt.score) }))
        : h('div', { class: 'verdict-score' }, h('span', { class: 'verdict-number', text: '—' })), h('p', { class: 'verdict-headline', text: headline ?? '' })));
    // ---------------------------------------------- grafico
    if (lastCurves && attempt.durationSec > 0.3) {
        root.appendChild(h('section', { class: 'card' }, waveformChart({
            waveform: lastCurves.waveform,
            f0: lastCurves.f0,
            f0Times: lastCurves.f0Times,
            durationSec: attempt.durationSec,
            pauses: lastCurves.pauses,
            filledPauses: lastCurves.filledPauses,
            nuclei: lastCurves.syllableNuclei,
        }), h('div', { class: 'legend' }, h('span', { class: 'legend-item wave', text: 'volume' }), h('span', { class: 'legend-item pitch', text: 'tom' }), h('span', { class: 'legend-item pause', text: 'pausa' }), h('span', { class: 'legend-item filled', text: 'alongamento' }))));
    }
    // ---------------------------------------------- detalhes
    if (details.length > 0) {
        const list = h('ul', { class: 'advice' });
        for (const d of details)
            list.appendChild(h('li', { text: d }));
        root.appendChild(h('section', { class: 'card' }, list));
    }
    // ---------------------------------------------- criterios
    const criteria = criterionRows(attempt, ctx.state.settings);
    if (criteria.length > 0) {
        root.appendChild(h('section', { class: 'card' }, h('h2', { text: 'Criterios' }), ...criteria));
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
function verdictClass(score, scorable) {
    if (!scorable)
        return 'neutral';
    if (score >= 85)
        return 'good';
    if (score >= 65)
        return 'ok';
    return 'attention';
}
function isLast(p) {
    return p.index >= p.plan.exerciseIds.length - 1;
}
function criterionRows(attempt, settings) {
    const exercise = getExercise(attempt.exerciseId);
    if (!exercise || attempt.score < 0)
        return [];
    // Recalcula a partir das metricas salvas: nao guardamos os criterios no banco
    // porque eles sao funcao pura de (metricas, rubrica, rigor) e mudam quando a
    // calibracao muda. Recalcular mantem a exibicao coerente com a rubrica atual.
    const rows = [];
    const result = scoreAttempt(attempt.metrics, exercise, settings);
    for (const c of result.criteria) {
        rows.push(h('div', { class: `criterion ${c.verdict}` }, h('span', { class: 'criterion-label', text: c.label }), h('div', { class: 'criterion-bar' }, h('div', { class: 'criterion-fill', style: `width:${Math.round(c.score * 100)}%` })), h('span', { class: 'criterion-value', text: `${Math.round(c.score * 100)}` })));
    }
    return rows;
}
function metricsCard(attempt) {
    const m = attempt.metrics;
    const items = [];
    items.push(['Duracao', fmtDuration(m.timing.totalSec)]);
    if (m.mpt)
        items.push(['Tempo de fonacao', `${fmtNumber(m.mpt.seconds)} s`]);
    if (m.ddk && m.ddk.count > 0) {
        items.push(['Velocidade', `${fmtNumber(m.ddk.syllPerSec)} sil/s`]);
        items.push(['Irregularidade', `${fmtNumber(m.ddk.cvPercent, 0)}%`]);
    }
    if (m.timing.syllableCount >= 4) {
        items.push(['Ritmo', `${fmtNumber(m.timing.articulationRate)} sil/s`]);
    }
    if (m.f0.voicedRatio > 0.2) {
        items.push(['Tom medio', `${Math.round(m.f0.meanHz)} Hz`]);
        items.push(['Variacao de tom', `${fmtNumber(m.f0.sdSemitones)} st`]);
    }
    if (m.timing.pauseCount > 0) {
        items.push(['Pausas', `${m.timing.pauseCount} · ${fmtDuration(m.timing.pauseTotalSec)}`]);
    }
    if (m.timing.filledPauseCount > 0) {
        items.push(['Alongamentos', String(m.timing.filledPauseCount)]);
    }
    const grid = h('div', { class: 'metric-grid' });
    for (const [label, value] of items) {
        grid.appendChild(h('div', { class: 'metric' }, h('span', { class: 'metric-value', text: value }), h('span', { class: 'metric-label', text: label })));
    }
    return h('section', { class: 'card' }, h('h2', { text: 'Medidas' }), grid);
}
function audioCard(ctx, attempt) {
    const card = h('section', { class: 'card' }, h('h2', { text: 'Ouvir' }));
    const row = h('div', { class: 'audio-row' });
    const playMine = h('button', { class: 'btn', text: '▶ Sua gravacao' });
    playMine.addEventListener('click', () => void playRef(ctx, attempt.audioRef));
    row.appendChild(playMine);
    const playBest = h('button', { class: 'btn ghost', text: '▶ Sua melhor' });
    playBest.addEventListener('click', async () => {
        const best = await bestAttempt(attempt.exerciseId);
        if (!best || best.id === attempt.id || !best.audioRef) {
            ctx.toast('Ainda nao ha uma tentativa anterior melhor para comparar.', 'info');
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
        ctx.toast(next ? 'Gravacao fixada — nao sera apagada pela limpeza automatica.' : 'Fixacao removida.', 'ok');
    });
    row.appendChild(pin);
    card.appendChild(row);
    card.appendChild(h('p', {
        class: 'muted small',
        text: 'Gravacoes nao fixadas sao apagadas depois de 30 dias. As medidas ficam para sempre.',
    }));
    return card;
}
async function playRef(ctx, ref) {
    if (!ref)
        return;
    const blob = await loadAudio(ref);
    if (!blob) {
        ctx.toast('Esta gravacao ja expirou. As medidas continuam no historico.', 'info');
        return;
    }
    if (lastBlobUrl)
        URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = URL.createObjectURL(blob);
    const audio = new Audio(lastBlobUrl);
    await audio.play().catch(() => ctx.toast('Nao consegui reproduzir o audio.', 'error'));
}
// ============================================================ navegacao
function advance(ctx) {
    const p = ctx.state.practice;
    if (!p)
        return;
    p.last = null;
    p.index++;
    if (p.index >= p.plan.exerciseIds.length) {
        void finishSession(ctx);
        return;
    }
    ctx.go('practice');
}
async function abortSession(ctx) {
    const p = ctx.state.practice;
    if (p && p.attempts.length > 0) {
        await persistSession(ctx, false);
    }
    await ctx.recorder.release();
    disposeAnalysisWorker();
    ctx.state.practice = null;
    ctx.go('home');
}
async function finishSession(ctx) {
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
    }
    else if (done > 0) {
        ctx.toast(`Treino concluido: ${done} exercicios.`, 'ok');
    }
    ctx.go('home');
}
async function persistSession(ctx, completed) {
    const p = ctx.state.practice;
    if (!p)
        return [];
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
//# sourceMappingURL=practice.js.map