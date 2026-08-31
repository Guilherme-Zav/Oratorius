/**
 * Progressao de nivel e repeticao espacada.
 *
 * Regra conservadora de proposito: subir de nivel cedo demais e o erro classico
 * de quem treina sozinho. Consolidar o nivel 4 e o que torna o nivel 6 possivel;
 * pular para o 6 so produz um erro praticado mais rapido.
 */
import { EXERCISES, TRACKS } from "../content/exercises.js";
/** Nota minima para uma sessao contar como "nivel atingido". */
export const LEVEL_UP_SCORE = 85;
/** Sessoes consecutivas no criterio antes de subir. */
export const LEVEL_UP_STREAK = 3;
/** Escada de intervalos da repeticao espacada, em dias. */
export const REVIEW_INTERVALS = [1, 3, 7, 14];
export function initialProgress() {
    return TRACKS.map((t) => ({
        track: t.id,
        level: 1,
        streakAtLevel: 0,
        updatedAt: new Date().toISOString(),
    }));
}
export function levelFor(progress, track) {
    return progress.find((p) => p.track === track)?.level ?? 1;
}
function maxLevel(track) {
    return TRACKS.find((t) => t.id === track)?.maxLevel ?? 1;
}
/**
 * Avalia a sessao encerrada e atualiza os niveis.
 *
 * Uma trilha so avanca se TODAS as tentativas pontuaveis dela na sessao ficaram
 * no criterio. Uma unica execucao ruim zera o streak: consistencia e o sinal,
 * nao o melhor resultado.
 */
export function applySessionResults(progress, attempts) {
    const byTrack = new Map();
    for (const a of attempts) {
        const ex = EXERCISES.find((e) => e.id === a.exerciseId);
        if (!ex || a.score < 0)
            continue; // nao pontuavel: ignorado
        if (ex.selfReport || ex.rubric === 'guiado')
            continue;
        const list = byTrack.get(ex.track) ?? [];
        list.push(a.score);
        byTrack.set(ex.track, list);
    }
    const leveledUp = [];
    const next = progress.map((p) => ({ ...p }));
    for (const [track, scores] of byTrack) {
        const row = next.find((p) => p.track === track);
        if (!row || scores.length === 0)
            continue;
        const allGood = scores.every((s) => s >= LEVEL_UP_SCORE);
        if (allGood) {
            row.streakAtLevel++;
            if (row.streakAtLevel >= LEVEL_UP_STREAK && row.level < maxLevel(track)) {
                row.level++;
                row.streakAtLevel = 0;
                leveledUp.push({ track, level: row.level });
            }
        }
        else {
            row.streakAtLevel = 0;
        }
        row.updatedAt = new Date().toISOString();
    }
    return { progress: next, leveledUp };
}
/**
 * Atualiza a fila de revisao a partir das tentativas.
 *
 * Errou -> volta amanha, no primeiro degrau. Acertou -> sobe um degrau (1, 3, 7,
 * 14 dias). Acertou no ultimo degrau -> sai da fila.
 */
export function updateReviews(reviews, attempts) {
    const map = new Map(reviews.map((r) => [r.exerciseId, { ...r }]));
    const now = Date.now();
    for (const a of attempts) {
        if (a.score < 0)
            continue;
        const existing = map.get(a.exerciseId);
        const passed = a.score >= LEVEL_UP_SCORE;
        if (!passed) {
            map.set(a.exerciseId, {
                exerciseId: a.exerciseId,
                stage: 0,
                lapses: (existing?.lapses ?? 0) + 1,
                dueAt: new Date(now + REVIEW_INTERVALS[0] * 86400000).toISOString(),
            });
            continue;
        }
        if (!existing)
            continue; // acertou e nao estava na fila
        const nextStage = existing.stage + 1;
        if (nextStage >= REVIEW_INTERVALS.length) {
            map.delete(a.exerciseId); // dominado
            continue;
        }
        map.set(a.exerciseId, {
            ...existing,
            stage: nextStage,
            dueAt: new Date(now + REVIEW_INTERVALS[nextStage] * 86400000).toISOString(),
        });
    }
    return [...map.values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
export function dueReviews(reviews, at = new Date()) {
    return reviews.filter((r) => new Date(r.dueAt).getTime() <= at.getTime());
}
//# sourceMappingURL=progression.js.map