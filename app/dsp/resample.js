/**
 * Reamostragem com anti-aliasing.
 *
 * O iPhone entrega 48 kHz. Reamostramos uma unica vez para 16 kHz e a partir dai
 * tudo (pitch, energia, WAV gravado e, na Fase 3, o modelo de fonemas) usa o mesmo
 * sinal — evita tres reamostragens diferentes com resultados sutilmente distintos.
 */
/** Taxa canonica de analise e armazenamento. */
export const ANALYSIS_RATE = 16000;
/** Passa-baixa RBJ. `q` = 0.5412 e 1.3066 dao um Butterworth de 4a ordem em cascata. */
function lowpass(sampleRate, freq, q) {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const b0 = (1 - cos) / 2;
    const b1 = 1 - cos;
    const b2 = (1 - cos) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cos;
    const a2 = 1 - alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
function applyBiquad(x, f) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
        const xi = x[i];
        const yi = f.b0 * xi + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
        x2 = x1;
        x1 = xi;
        y2 = y1;
        y1 = yi;
        y[i] = yi;
    }
    return y;
}
/** Butterworth de 4a ordem, aplicado em ida e volta (fase zero). */
export function lowpassFilter(x, sampleRate, cutoffHz) {
    const stages = [lowpass(sampleRate, cutoffHz, 0.5412), lowpass(sampleRate, cutoffHz, 1.3066)];
    let y = x;
    for (const s of stages)
        y = applyBiquad(y, s);
    // Passagem reversa: cancela o atraso de fase, importante para nao deslocar
    // as fronteiras de silabas e pausas no tempo.
    y = y.slice().reverse();
    for (const s of stages)
        y = applyBiquad(y, s);
    return y.slice().reverse();
}
/**
 * Reamostra com filtro anti-aliasing seguido de interpolacao linear.
 * Interpolacao linear introduz um leve rolloff no topo da banda, aceitavel aqui
 * porque a informacao que nos interessa (f0, energia, formantes baixos) vive
 * bem abaixo de Nyquist.
 */
export function resample(x, fromRate, toRate) {
    if (fromRate === toRate)
        return x;
    const src = toRate < fromRate ? lowpassFilter(x, fromRate, toRate * 0.45) : x;
    const ratio = fromRate / toRate;
    const outLen = Math.max(1, Math.floor(x.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const i1 = Math.min(src.length - 1, i0 + 1);
        const frac = pos - i0;
        out[i] = src[i0] * (1 - frac) + src[i1] * frac;
    }
    return out;
}
/** Mixa canais intercalados para mono. */
export function toMono(interleaved, channels) {
    if (channels <= 1)
        return interleaved;
    const n = Math.floor(interleaved.length / channels);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++)
            s += interleaved[i * channels + c];
        out[i] = s / channels;
    }
    return out;
}
//# sourceMappingURL=resample.js.map