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
import { getRubric, scoreCriterion } from "./rubrics.js";
const WARNING_TEXT = {
    clipping: 'A gravacao saturou (volume alto demais). Afaste-se um pouco do microfone e repita.',
    'ruido-alto': 'Muito ruido de fundo em relacao a sua voz. Procure um lugar mais silencioso.',
    'muito-curto': 'Gravacao curta demais para analisar.',
    'sem-voz': 'Nao encontrei voz nesta gravacao. Verifique se o microfone captou.',
    'volume-baixo': 'Volume muito baixo. Chegue mais perto do microfone.',
};
/** Avisos que impedem qualquer pontuacao. */
const BLOCKING = new Set(['sem-voz', 'muito-curto', 'clipping']);
/**
 * O rigor ajusta as fronteiras: no modo tolerante um criterio precisa ir bem pior
 * para ser marcado como "atencao". Serve para nao desanimar no comeco e para
 * apertar quando o nivel sobe.
 */
function thresholds(strictness) {
    switch (strictness) {
        case 1: return { good: 0.62, ok: 0.34 };
        case 3: return { good: 0.82, ok: 0.60 };
        default: return { good: 0.72, ok: 0.45 };
    }
}
export function scoreAttempt(metrics, exercise, settings) {
    const flags = [...metrics.warnings];
    const blocking = metrics.warnings.filter((w) => BLOCKING.has(w));
    if (blocking.length > 0) {
        return {
            score: -1,
            scorable: false,
            criteria: [],
            headline: WARNING_TEXT[blocking[0]] ?? 'Nao foi possivel analisar esta gravacao.',
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
            headline: 'Exercicio concluido.',
            details: ['Este e um exercicio guiado — nao ha analise acustica, so o registro de que foi feito.'],
            flags,
        };
    }
    const rubric = getRubric(exercise.rubric);
    const { good, ok } = thresholds(settings.strictness);
    const results = [];
    let weighted = 0;
    let totalWeight = 0;
    for (const c of rubric.criteria) {
        const value = c.extract(metrics);
        if (value === null || !Number.isFinite(value))
            continue; // criterio nao aplicavel
        const s = scoreCriterion(c, value);
        const verdict = s >= good ? 'bom' : s >= ok ? 'ok' : 'atencao';
        results.push({ id: c.id, label: c.label, value, score: s, weight: c.weight, verdict });
        weighted += s * c.weight;
        totalWeight += c.weight;
        if (verdict === 'atencao')
            flags.push(c.id);
    }
    if (totalWeight === 0) {
        return {
            score: -1,
            scorable: false,
            criteria: [],
            headline: 'Gravacao curta demais para gerar metricas confiaveis.',
            details: [],
            flags,
        };
    }
    const score = Math.round((weighted / totalWeight) * 100);
    const { headline, details } = buildFeedback(results, rubric.criteria, metrics, exercise, score);
    return { score, scorable: true, criteria: results, headline, details, flags };
}
function buildFeedback(results, criteria, metrics, exercise, score) {
    const byId = new Map(criteria.map((c) => [c.id, c]));
    // O pior criterio ponderado vira a manchete: uma coisa para corrigir por vez.
    const worst = [...results]
        .filter((r) => r.verdict !== 'bom')
        .sort((a, b) => a.score * a.weight - b.score * b.weight)[0];
    const details = [];
    let headline;
    if (!worst) {
        headline = pickPraise(score, exercise);
        const best = [...results].sort((a, b) => b.score * b.weight - a.score * a.weight)[0];
        const praise = best ? byId.get(best.id)?.praise : undefined;
        if (praise)
            details.push(praise);
    }
    else {
        headline = byId.get(worst.id)?.advice ?? `Atencao em: ${worst.label}.`;
        // Ate dois pontos secundarios — mais que isso ninguem absorve entre uma
        // tentativa e a proxima.
        for (const r of results) {
            if (r.id === worst.id || r.verdict === 'bom')
                continue;
            const advice = byId.get(r.id)?.advice;
            if (advice && details.length < 2)
                details.push(advice);
        }
        const strong = results.find((r) => r.verdict === 'bom' && byId.get(r.id)?.praise);
        if (strong)
            details.push(byId.get(strong.id).praise);
    }
    // Avisos nao bloqueantes entram no fim, como contexto.
    for (const w of metrics.warnings) {
        const text = WARNING_TEXT[w];
        if (text && !details.includes(text))
            details.push(text);
    }
    if (metrics.voiceQuality.reliable && metrics.voiceQuality.jitterPct > 2.5) {
        details.push('A voz saiu instavel nesta gravacao. Se isso se repetir por varios dias, vale hidratar mais e descansar a voz — e, persistindo, procurar um fonoaudiologo.');
    }
    return { headline, details };
}
function pickPraise(score, exercise) {
    if (score >= 92)
        return 'Execucao muito boa. Este exercicio esta dominado.';
    if (score >= 80)
        return 'Boa execucao, dentro do alvo em todos os criterios.';
    if (exercise.track === 'articulacao')
        return 'Execucao limpa. Repita para consolidar.';
    return 'Execucao dentro do esperado.';
}
/** Rotulo curto para a UI. */
export function scoreLabel(score) {
    if (score < 0)
        return '—';
    if (score >= 90)
        return 'Excelente';
    if (score >= 78)
        return 'Bom';
    if (score >= 60)
        return 'Regular';
    return 'Precisa treino';
}
//# sourceMappingURL=score.js.map