/**
 * Worker de analise.
 *
 * A Camada 1 leva alguns segundos numa gravacao de 90 s de improviso. Na thread
 * principal isso congelaria a tela inteira — inclusive a animacao do botao e o
 * toque do usuario. Aqui, a UI segue viva e mostra "analisando…".
 */

import { analyze, type AnalyzeOptions } from '../dsp/analyze.ts';
import type { AnalysisResult } from '../dsp/types.ts';

export interface AnalysisRequest {
  id: number;
  pcm: Float32Array;
  sampleRate: number;
  options: AnalyzeOptions;
}

export interface AnalysisResponse {
  id: number;
  result?: AnalysisResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { id, pcm, sampleRate, options } = event.data;
  try {
    const result = analyze(pcm, sampleRate, options);

    // Transfere os buffers das curvas em vez de copia-los: sao alguns MB numa
    // gravacao longa, e a copia estruturada seria um segundo custo escondido.
    const transfer: ArrayBuffer[] = [
      result.curves.f0.buffer,
      result.curves.f0Times.buffer,
      result.curves.db.buffer,
      result.curves.dbTimes.buffer,
      result.curves.waveform.buffer,
    ].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);

    const response: AnalysisResponse = { id, result };
    (self as unknown as Worker).postMessage(response, transfer);
  } catch (err) {
    const response: AnalysisResponse = { id, error: (err as Error).message };
    (self as unknown as Worker).postMessage(response);
  }
};
