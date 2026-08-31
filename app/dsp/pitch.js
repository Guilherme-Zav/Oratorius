/**
 * Deteccao de f0 pelo algoritmo YIN (de Cheveigne & Kawahara, 2002).
 *
 * Roda sobre o sinal ja reamostrado para 16 kHz. A 48 kHz o custo seria ~9x maior
 * sem ganho util: f0 de voz humana vive entre 60 e 500 Hz, muito abaixo de Nyquist
 * em 16 kHz.
 */
export const DEFAULT_PITCH_OPTIONS = {
    fmin: 60,
    fmax: 500,
    threshold: 0.15,
    frameMs: 40,
    hopMs: 10,
    silenceRms: 0.0015,
};
/**
 * YIN para um unico frame. Retorna o periodo em amostras (com interpolacao
 * parabolica) ou 0 se o frame nao for vozeado.
 */
export function yinPeriod(frame, sampleRate, opts) {
    const tauMin = Math.max(2, Math.floor(sampleRate / opts.fmax));
    const tauMax = Math.min(Math.floor(frame.length / 2), Math.ceil(sampleRate / opts.fmin));
    if (tauMax <= tauMin)
        return { period: 0, confidence: 0 };
    const W = frame.length - tauMax;
    if (W < tauMin)
        return { period: 0, confidence: 0 };
    // Passos 1, 2 e 3 fundidos num unico laco, com saida antecipada.
    //
    // O YIN canonico calcula a funcao de diferenca para TODOS os taus e so depois
    // procura o minimo. Mas a soma cumulativa e incremental, entao da para avaliar
    // o criterio de parada a cada tau e abandonar o resto: uma voz masculina a
    // 16 kHz resolve em tau~120 de um tauMax de 267, e mais da metade do trabalho
    // era desperdicio. O resultado e identico — os taus abandonados nunca seriam
    // escolhidos — e a analise de um improviso de 90 s cai de ~11 s para ~4 s.
    const cmnd = new Float64Array(tauMax + 2);
    cmnd[0] = 1;
    let running = 0;
    let candidate = -1;
    let lastTau = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
        let sum = 0;
        for (let j = 0; j < W; j++) {
            const d = frame[j] - frame[j + tau];
            sum += d * d;
        }
        running += sum;
        cmnd[tau] = running === 0 ? 1 : (sum * tau) / running;
        lastTau = tau;
        if (tau < tauMin)
            continue;
        if (candidate < 0) {
            if (cmnd[tau] < opts.threshold)
                candidate = tau;
        }
        else if (cmnd[tau] < cmnd[candidate]) {
            candidate = tau; // ainda descendo o vale
        }
        else {
            break; // passou do fundo; tau+1 ja esta calculado
        }
    }
    let tauEstimate = candidate;
    // Nenhum tau cruzou o limiar: aceita o minimo global se for razoavel.
    if (tauEstimate < 0) {
        let best = tauMin;
        for (let tau = tauMin + 1; tau <= lastTau; tau++)
            if (cmnd[tau] < cmnd[best])
                best = tau;
        if (cmnd[best] > 0.55)
            return { period: 0, confidence: 0 };
        tauEstimate = best;
    }
    // Passo 4: interpolacao parabolica em torno do minimo — da resolucao
    // sub-amostra, essencial para medir jitter a 16 kHz.
    let period = tauEstimate;
    if (tauEstimate > 0 && tauEstimate < tauMax) {
        const a = cmnd[tauEstimate - 1];
        const b = cmnd[tauEstimate];
        const c = cmnd[tauEstimate + 1];
        const denom = 2 * (2 * b - a - c);
        if (Math.abs(denom) > 1e-12)
            period = tauEstimate + (c - a) / denom;
    }
    return { period, confidence: Math.max(0, Math.min(1, 1 - cmnd[tauEstimate])) };
}
function frameRms(x, start, len) {
    let s = 0;
    const end = Math.min(x.length, start + len);
    for (let i = start; i < end; i++)
        s += x[i] * x[i];
    const n = end - start;
    return n > 0 ? Math.sqrt(s / n) : 0;
}
export function trackPitch(x, sampleRate, options = {}) {
    const opts = { ...DEFAULT_PITCH_OPTIONS, ...options };
    const frameLen = Math.round((opts.frameMs / 1000) * sampleRate);
    const hopLen = Math.max(1, Math.round((opts.hopMs / 1000) * sampleRate));
    const count = x.length < frameLen ? 0 : 1 + Math.floor((x.length - frameLen) / hopLen);
    const f0 = new Float32Array(count);
    const period = new Float32Array(count);
    const confidence = new Float32Array(count);
    const times = new Float32Array(count);
    const buf = new Float32Array(frameLen);
    for (let i = 0; i < count; i++) {
        const start = i * hopLen;
        times[i] = (start + frameLen / 2) / sampleRate;
        if (frameRms(x, start, frameLen) < opts.silenceRms)
            continue;
        buf.set(x.subarray(start, start + frameLen));
        const { period: p, confidence: c } = yinPeriod(buf, sampleRate, opts);
        if (p > 0) {
            const hz = sampleRate / p;
            if (hz >= opts.fmin && hz <= opts.fmax) {
                f0[i] = hz;
                period[i] = p;
                confidence[i] = c;
            }
        }
    }
    return { f0, period, confidence, times, hopMs: opts.hopMs, sampleRate };
}
/**
 * Remove saltos de oitava isolados — o erro classico do YIN. Um frame cujo f0
 * e ~metade ou ~o dobro dos vizinhos e corrigido em vez de descartado.
 */
export function fixOctaveJumps(track) {
    const f0 = Float32Array.from(track.f0);
    for (let i = 1; i < f0.length - 1; i++) {
        const prev = f0[i - 1], cur = f0[i], next = f0[i + 1];
        if (prev <= 0 || cur <= 0 || next <= 0)
            continue;
        const neighbour = (prev + next) / 2;
        const ratio = cur / neighbour;
        if (ratio > 1.8 && ratio < 2.2)
            f0[i] = cur / 2;
        else if (ratio > 0.45 && ratio < 0.55)
            f0[i] = cur * 2;
    }
    return { ...track, f0 };
}
/** Apenas os frames vozeados, para estatistica. */
export function voicedValues(f0) {
    const out = [];
    for (let i = 0; i < f0.length; i++)
        if (f0[i] > 0)
            out.push(f0[i]);
    return out;
}
//# sourceMappingURL=pitch.js.map