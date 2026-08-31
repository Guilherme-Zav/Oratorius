/**
 * Qualidade vocal: jitter, shimmer e HNR.
 *
 * LIMITACAO ASSUMIDA: a 16 kHz uma amostra vale 62,5 us, enquanto o jitter tipico
 * de uma voz saudavel fica em torno de 20-40 us. Medimos o periodo com interpolacao
 * parabolica no minimo do YIN, o que da resolucao sub-amostra, mas o resultado
 * ainda e mais ruidoso que o de um software clinico rodando a 44,1 kHz sobre
 * marcacao de pulsos glotais.
 *
 * Consequencia pratica, respeitada no scoring: estes numeros servem para
 * acompanhar *tendencia* na sua propria voz ao longo das semanas, e nao para
 * comparacao com valores normativos de literatura. A UI apresenta-os como
 * "estabilidade da voz", nunca como diagnostico.
 */
import { mean } from "./frames.js";
const EMPTY = {
    jitterPct: 0, shimmerPct: 0, hnrDb: 0, cycles: 0, reliable: false,
};
/**
 * Analisa o trecho vozeado continuo mais longo — misturar trechos separados
 * introduziria descontinuidades artificiais na serie de periodos.
 */
function longestVoicedRun(pitch) {
    let best = null;
    let bestLen = 0;
    let start = -1;
    for (let i = 0; i <= pitch.f0.length; i++) {
        const voiced = i < pitch.f0.length && pitch.f0[i] > 0;
        if (voiced && start < 0)
            start = i;
        if (!voiced && start >= 0) {
            const len = i - start;
            if (len > bestLen) {
                bestLen = len;
                best = [start, i - 1];
            }
            start = -1;
        }
    }
    return best;
}
export function analyzeVoiceQuality(x, sampleRate, pitch) {
    const run = longestVoicedRun(pitch);
    if (!run)
        return EMPTY;
    const [a, b] = run;
    if (b - a < 5)
        return EMPTY;
    const startSample = Math.max(0, Math.floor(pitch.times[a] * sampleRate));
    const endSample = Math.min(x.length, Math.ceil(pitch.times[b] * sampleRate));
    const meanPeriod = mean(Array.from(pitch.period.subarray(a, b + 1)).filter((p) => p > 0));
    if (meanPeriod <= 0)
        return EMPTY;
    // Serie de periodos e de amplitudes de pico, ciclo a ciclo, percorrendo o sinal
    // em passos de um periodo local.
    const periods = [];
    const amplitudes = [];
    let pos = startSample;
    while (pos + meanPeriod * 2 < endSample) {
        // Periodo local: interpola o contorno de f0 na posicao atual.
        const t = pos / sampleRate;
        let idx = a;
        for (let i = a; i <= b; i++)
            if (pitch.times[i] <= t)
                idx = i;
        const p = pitch.period[idx] > 0 ? pitch.period[idx] : meanPeriod;
        let peak = 0;
        const end = Math.min(endSample, pos + Math.round(p));
        for (let i = pos; i < end; i++)
            peak = Math.max(peak, Math.abs(x[i]));
        periods.push(p);
        amplitudes.push(peak);
        pos += Math.round(p);
    }
    const cycles = periods.length;
    if (cycles < 10)
        return { ...EMPTY, cycles };
    // Jitter local relativo.
    let jitterSum = 0;
    for (let i = 1; i < cycles; i++)
        jitterSum += Math.abs(periods[i] - periods[i - 1]);
    const jitterPct = (jitterSum / (cycles - 1) / mean(periods)) * 100;
    // Shimmer local relativo.
    let shimmerSum = 0;
    let used = 0;
    for (let i = 1; i < cycles; i++) {
        if (amplitudes[i] <= 1e-9 || amplitudes[i - 1] <= 1e-9)
            continue;
        shimmerSum += Math.abs(amplitudes[i] - amplitudes[i - 1]);
        used++;
    }
    const meanAmp = mean(amplitudes);
    const shimmerPct = used > 0 && meanAmp > 1e-9 ? (shimmerSum / used / meanAmp) * 100 : 0;
    // HNR por autocorrelacao: r(T) / (1 - r(T)) no atraso de um periodo.
    const hnrDb = estimateHnr(x, startSample, endSample, Math.round(meanPeriod));
    return {
        jitterPct,
        shimmerPct,
        hnrDb,
        cycles,
        reliable: cycles >= 30,
    };
}
function estimateHnr(x, start, end, period) {
    const n = end - start - period;
    if (n <= 0 || period <= 0)
        return 0;
    let num = 0;
    let den0 = 0;
    let den1 = 0;
    for (let i = 0; i < n; i++) {
        const a = x[start + i];
        const c = x[start + i + period];
        num += a * c;
        den0 += a * a;
        den1 += c * c;
    }
    const denom = Math.sqrt(den0 * den1);
    if (denom < 1e-12)
        return 0;
    const r = Math.max(0, Math.min(0.9999, num / denom));
    return 10 * Math.log10(r / (1 - r));
}
//# sourceMappingURL=voiceQuality.js.map