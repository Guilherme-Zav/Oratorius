/** FFT radix-2 in-place (Cooley-Tukey). Tamanho deve ser potencia de 2. */
export function nextPow2(n) {
    let p = 1;
    while (p < n)
        p <<= 1;
    return p;
}
export function fft(re, im) {
    const n = re.length;
    if (n <= 1)
        return;
    if ((n & (n - 1)) !== 0)
        throw new Error(`FFT exige potencia de 2, recebeu ${n}`);
    // Reordenacao bit-reversa.
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j) {
            let t = re[i];
            re[i] = re[j];
            re[j] = t;
            t = im[i];
            im[i] = im[j];
            im[j] = t;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wRe = Math.cos(ang);
        const wIm = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let curRe = 1;
            let curIm = 0;
            for (let j = 0; j < len / 2; j++) {
                const uRe = re[i + j];
                const uIm = im[i + j];
                const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
                const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
                re[i + j] = uRe + vRe;
                im[i + j] = uIm + vIm;
                re[i + j + len / 2] = uRe - vRe;
                im[i + j + len / 2] = uIm - vIm;
                const nextRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nextRe;
            }
        }
    }
}
/** Espectro de magnitude (metade util) de um frame real ja janelado. */
export function magnitudeSpectrum(frame, fftSize) {
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    const n = Math.min(frame.length, fftSize);
    for (let i = 0; i < n; i++)
        re[i] = frame[i];
    fft(re, im);
    const half = fftSize >> 1;
    const mag = new Float64Array(half);
    for (let i = 0; i < half; i++)
        mag[i] = Math.hypot(re[i], im[i]);
    return mag;
}
//# sourceMappingURL=fft.js.map