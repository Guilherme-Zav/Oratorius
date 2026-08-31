/**
 * Diadococinesia (DDK): repeticao rapida de silabas como /pa-ta-ka/.
 *
 * A metrica que interessa aqui NAO e so a velocidade. E a **regularidade** — o
 * coeficiente de variacao dos intervalos entre ataques. Uma lingua que trava
 * produz uma serie irregular mesmo quando a media parece boa, e o CV captura
 * exatamente isso. Por isso o DDK e o exercicio de linha de base diaria do app
 * (ver DESIGN.md, secao 4): e objetivo, rapido e comparavel dia a dia.
 */
import { mean, medianFilter, stdDev } from "./frames.js";
export const EMPTY_DDK = {
    onsets: [], count: 0, syllPerSec: 0, cvPercent: 0, meanIoiMs: 0, ioiMs: [],
};
export const DEFAULT_DDK_OPTIONS = {
    minIntervalSec: 0.09,
    sensitivity: 1.5,
};
export function analyzeDdk(spectral, intensity, options = {}) {
    const opts = { ...DEFAULT_DDK_OPTIONS, ...options };
    const n = Math.min(spectral.flux.length, intensity.rms.length);
    if (n < 4)
        return EMPTY_DDK;
    // Funcao de deteccao: fluxo espectral ponderado pela subida de energia.
    // Oclusivas (/p/, /t/, /k/) produzem silencio seguido de explosao — as duas
    // pistas coincidem, e multiplica-las suprime falsos positivos de cada uma.
    const odf = new Float32Array(n);
    for (let i = 1; i < n; i++) {
        const rise = Math.max(0, intensity.rms[i] - intensity.rms[i - 1]);
        odf[i] = spectral.flux[i] * rise;
    }
    // Limiar adaptativo: mediana movel + margem, para tolerar variacao de volume
    // ao longo da serie (a gente sempre perde forca no fim).
    const baseline = medianFilter(odf, 21);
    const dynamic = new Float32Array(n);
    const globalMean = mean(odf);
    for (let i = 0; i < n; i++) {
        dynamic[i] = baseline[i] * opts.sensitivity + globalMean * 0.35;
    }
    const hop = spectral.hopMs / 1000;
    const minFrames = Math.max(1, Math.round(opts.minIntervalSec / hop));
    const onsets = [];
    let lastFrame = -Infinity;
    for (let i = 1; i < n - 1; i++) {
        if (odf[i] <= dynamic[i])
            continue;
        if (odf[i] < odf[i - 1] || odf[i] < odf[i + 1])
            continue;
        if (i - lastFrame < minFrames) {
            // Mantem apenas o ataque mais forte dentro da janela de refratariedade.
            if (onsets.length > 0 && odf[i] > odf[lastFrame]) {
                onsets[onsets.length - 1] = spectral.times[i];
                lastFrame = i;
            }
            continue;
        }
        onsets.push(spectral.times[i]);
        lastFrame = i;
    }
    if (onsets.length < 2)
        return { ...EMPTY_DDK, onsets, count: onsets.length };
    const ioiMs = [];
    for (let i = 1; i < onsets.length; i++)
        ioiMs.push((onsets[i] - onsets[i - 1]) * 1000);
    const m = mean(ioiMs);
    const span = onsets[onsets.length - 1] - onsets[0];
    return {
        onsets,
        count: onsets.length,
        syllPerSec: span > 0 ? (onsets.length - 1) / span : 0,
        cvPercent: m > 0 ? (stdDev(ioiMs) / m) * 100 : 0,
        meanIoiMs: m,
        ioiMs,
    };
}
//# sourceMappingURL=ddk.js.map