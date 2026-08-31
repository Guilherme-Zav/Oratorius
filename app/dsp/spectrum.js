/**
 * Descritores espectrais por frame.
 *
 * Servem a dois propositos hoje: detectar pausas preenchidas (baixo fluxo
 * espectral = o trato vocal parou de se mover) e distinguir fricativa de vogal
 * (alta taxa de cruzamentos por zero + centroide alto = ruido). Na Fase 3, a
 * mesma matriz alimenta o detector de rotico.
 */
import { hann } from "./frames.js";
import { magnitudeSpectrum, nextPow2 } from "./fft.js";
export function analyzeSpectrum(x, sampleRate, frameMs = 25, hopMs = 10) {
    const frameLen = Math.max(8, Math.round((frameMs / 1000) * sampleRate));
    const hopLen = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
    const count = x.length < frameLen ? 0 : 1 + Math.floor((x.length - frameLen) / hopLen);
    const fftSize = nextPow2(frameLen);
    const win = hann(frameLen);
    const buf = new Float32Array(frameLen);
    const centroid = new Float32Array(count);
    const flux = new Float32Array(count);
    const zcr = new Float32Array(count);
    const highRatio = new Float32Array(count);
    const times = new Float32Array(count);
    const binHz = sampleRate / fftSize;
    const highBin = Math.floor(3000 / binHz);
    let prevMag = null;
    for (let i = 0; i < count; i++) {
        const start = i * hopLen;
        times[i] = (start + frameLen / 2) / sampleRate;
        let crossings = 0;
        for (let j = 0; j < frameLen; j++) {
            const v = x[start + j];
            buf[j] = v * win[j];
            if (j > 0 && ((v < 0 && x[start + j - 1] >= 0) || (v >= 0 && x[start + j - 1] < 0))) {
                crossings++;
            }
        }
        zcr[i] = crossings / frameLen;
        const mag = magnitudeSpectrum(buf, fftSize);
        let total = 0;
        let weighted = 0;
        let high = 0;
        for (let b = 1; b < mag.length; b++) {
            const m = mag[b];
            total += m;
            weighted += m * b * binHz;
            if (b >= highBin)
                high += m;
        }
        centroid[i] = total > 1e-12 ? weighted / total : 0;
        highRatio[i] = total > 1e-12 ? high / total : 0;
        if (prevMag) {
            let d = 0;
            let norm = 0;
            for (let b = 1; b < mag.length; b++) {
                d += Math.abs(mag[b] - prevMag[b]);
                norm += mag[b] + prevMag[b];
            }
            flux[i] = norm > 1e-12 ? d / norm : 0;
        }
        prevMag = mag;
    }
    if (count > 1)
        flux[0] = flux[1];
    return { centroid, flux, zcr, highRatio, times, hopMs };
}
//# sourceMappingURL=spectrum.js.map