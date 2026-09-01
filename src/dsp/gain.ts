/**
 * Ganho de normalizacao.
 *
 * O app desliga o controle automatico de ganho do sistema (ver audio/capture.ts),
 * porque o AGC varia o volume AO LONGO do tempo e isso destroi exatamente o que
 * queremos medir: perda de apoio no fim de uma sustentacao, variacao de projecao.
 *
 * Mas desligar o AGC sem repor nada deixa o sinal fraco: o microfone do iPhone a
 * meio metro entrega picos em torno de -35 dBFS. Fraco demais para ouvir na
 * reproducao, e fraco demais para os limiares absolutos do detector de f0.
 *
 * A solucao e um ganho CONSTANTE por gravacao. Constante e a palavra importante:
 * multiplicar o sinal inteiro por um mesmo numero preserva toda relacao interna
 * (o fim continua mais fraco que o comeco na mesma proporcao), ao contrario do
 * AGC, que achata justamente essa diferenca.
 */

export interface NormalizedAudio {
  pcm: Float32Array;
  /** Fator aplicado. 1 = nada mudou. */
  gain: number;
  /** Pico do sinal ORIGINAL, 0..1. E o que diz se o microfone captou bem. */
  rawPeak: number;
  rawRms: number;
}

/** Alvo de pico. Deixa folga para nao saturar na reproducao. */
export const TARGET_PEAK = 0.89;

/**
 * Teto do ganho. Sem teto, uma gravacao quase silenciosa viraria ruido de fundo
 * amplificado ao maximo, e o app analisaria o chiado do comodo como se fosse voz.
 */
export const MAX_GAIN = 40;

/** Abaixo disto o sinal e ruido, nao voz: nao vale amplificar. */
const NOISE_PEAK = 0.0008;

export function peakOf(x: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    if (a > peak) peak = a;
  }
  return peak;
}

export function rmsOf(x: Float32Array): number {
  if (x.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

/**
 * Normaliza pelo pico. Usa o percentil 99,9 em vez do maximo absoluto: um unico
 * estalo de lingua ou batida na mesa nao deve definir o ganho da gravacao inteira
 * e deixar a fala inaudivel.
 */
export function normalizePcm(
  x: Float32Array,
  targetPeak = TARGET_PEAK,
  maxGain = MAX_GAIN,
): NormalizedAudio {
  const rawPeak = peakOf(x);
  const rawRms = rmsOf(x);

  if (x.length === 0 || rawPeak <= NOISE_PEAK) {
    return { pcm: x, gain: 1, rawPeak, rawRms };
  }

  const reference = robustPeak(x, rawPeak);
  let gain = targetPeak / reference;
  if (gain > maxGain) gain = maxGain;
  if (gain < 1.02) {
    // Ja esta em bom nivel (ou saturado). Mexer so introduziria erro.
    return { pcm: x, gain: 1, rawPeak, rawRms };
  }

  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * gain;
    // O percentil deixa passar alguns transientes acima do alvo; limitamos para
    // que nao virem estalo na reproducao.
    out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }

  return { pcm: out, gain, rawPeak, rawRms };
}

/**
 * Percentil ~99,9 da amplitude, por histograma. Evita ordenar milhoes de amostras
 * so para descartar os poucos picos do topo.
 */
function robustPeak(x: Float32Array, maxAbs: number): number {
  const BINS = 512;
  const hist = new Int32Array(BINS);
  const scale = (BINS - 1) / maxAbs;

  for (let i = 0; i < x.length; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    hist[(a * scale) | 0]++;
  }

  const cutoff = x.length * 0.001; // 0,1% mais alto fica de fora
  let seen = 0;
  for (let b = BINS - 1; b >= 0; b--) {
    seen += hist[b];
    if (seen >= cutoff) return Math.max(((b + 1) / scale), maxAbs * 0.1);
  }
  return maxAbs;
}
