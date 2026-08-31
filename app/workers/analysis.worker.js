/**
 * Worker de analise.
 *
 * A Camada 1 leva alguns segundos numa gravacao de 90 s de improviso. Na thread
 * principal isso congelaria a tela inteira — inclusive a animacao do botao e o
 * toque do usuario. Aqui, a UI segue viva e mostra "analisando…".
 */
import { analyze } from "../dsp/analyze.js";
self.onmessage = (event) => {
    const { id, pcm, sampleRate, options } = event.data;
    try {
        const result = analyze(pcm, sampleRate, options);
        // Transfere os buffers das curvas em vez de copia-los: sao alguns MB numa
        // gravacao longa, e a copia estruturada seria um segundo custo escondido.
        const transfer = [
            result.curves.f0.buffer,
            result.curves.f0Times.buffer,
            result.curves.db.buffer,
            result.curves.dbTimes.buffer,
            result.curves.waveform.buffer,
        ].filter((b) => b instanceof ArrayBuffer);
        const response = { id, result };
        self.postMessage(response, transfer);
    }
    catch (err) {
        const response = { id, error: err.message };
        self.postMessage(response);
    }
};
//# sourceMappingURL=analysis.worker.js.map