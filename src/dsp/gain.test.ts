import { describe, it } from 'node:test';
import { expect } from '../testing/expect.ts';

import { MAX_GAIN, TARGET_PEAK, normalizePcm, peakOf, rmsOf } from './gain.ts';
import { analyze } from './analyze.ts';
import { concat, envelope, glottalTone, silence } from './testSignals.ts';

const SR = 48000;

/**
 * Escala um sinal para um pico exato. Os testes falam em pico porque e o que a
 * normalizacao enxerga — a amplitude nominal do gerador passa por uma soma de
 * harmonicos e nao corresponde ao pico resultante.
 */
function atPeak(x: Float32Array, target: number): Float32Array {
  const p = peakOf(x);
  if (p === 0) return x;
  const out = new Float32Array(x.length);
  const k = target / p;
  for (let i = 0; i < x.length; i++) out[i] = x[i] * k;
  return out;
}

describe('normalizacao de ganho', () => {
  it('leva um sinal fraco para um nivel audivel', () => {
    // -35 dBFS de pico: o que o microfone do iPhone entrega a meio metro
    // com o ganho automatico desligado.
    const fraco = atPeak(glottalTone(140, 1, SR), 0.018);
    const { pcm, gain } = normalizePcm(fraco);

    expect(gain).toBeGreaterThan(10);
    expect(peakOf(pcm)).toBeGreaterThan(0.3);   // audivel
    expect(peakOf(pcm)).toBeLessThanOrEqual(1); // sem estourar
  });

  it('nao mexe num sinal que ja esta em bom nivel', () => {
    const bom = atPeak(glottalTone(140, 1, SR), 0.9);
    const { gain, pcm } = normalizePcm(bom);
    expect(gain).toBe(1);
    expect(pcm).toBe(bom); // mesma referencia: nenhuma copia desnecessaria
  });

  it('respeita o teto de ganho em gravacao quase muda', () => {
    const quaseMudo = glottalTone(140, 1, SR, 0.002);
    const { gain } = normalizePcm(quaseMudo);
    expect(gain).toBeLessThanOrEqual(MAX_GAIN);
  });

  it('nao amplifica silencio puro', () => {
    const { gain } = normalizePcm(silence(1, SR, 0.0002));
    expect(gain).toBe(1);
  });

  it('um estalo isolado nao define o ganho da gravacao inteira', () => {
    // Fala fraca com um unico pico alto no meio (batida na mesa).
    const fala = glottalTone(140, 2, SR, 0.03);
    fala[Math.floor(fala.length / 2)] = 0.95;

    const { pcm } = normalizePcm(fala);
    // Se o maximo absoluto mandasse, o ganho seria ~0.94 e a fala continuaria
    // inaudivel. O percentil ignora o transiente e levanta a fala.
    expect(rmsOf(pcm)).toBeGreaterThan(rmsOf(fala) * 5);
  });

  it('preserva a dinamica interna — e o que separa isto de um AGC', () => {
    // Metade forte, metade fraca. A razao entre elas nao pode mudar.
    const forte = envelope(glottalTone(140, 1, SR, 0.08), SR);
    const fraca = envelope(glottalTone(140, 1, SR, 0.02), SR);
    const original = concat(forte, fraca);
    const { pcm } = normalizePcm(original);

    const meio = Math.floor(original.length / 2);
    const razaoAntes = rmsOf(original.subarray(0, meio)) / rmsOf(original.subarray(meio));
    const razaoDepois = rmsOf(pcm.subarray(0, meio)) / rmsOf(pcm.subarray(meio));
    expect(Math.abs(razaoAntes - razaoDepois)).toBeLessThan(0.05);
  });
});

describe('analise com sinal fraco (o caso real do microfone)', () => {
  /** Enunciado normal, gravado fraco — como o iPhone entrega sem ganho automatico. */
  function enunciado(amplitude: number): Float32Array {
    return concat(
      silence(0.3, SR, 0.00005),
      envelope(glottalTone(130, 0.5, SR, amplitude), SR),
      silence(0.45, SR, 0.00005),
      envelope(glottalTone(165, 0.5, SR, amplitude), SR),
      silence(0.3, SR, 0.00005),
    );
  }

  it('gravacao fraca NAO e mais confundida com "sem voz"', () => {
    const { metrics } = analyze(enunciado(0.012), SR);
    expect(metrics.warnings).not.toContain('sem-voz');
    expect(metrics.f0.meanHz).toBeGreaterThan(110);
    expect(metrics.f0.meanHz).toBeLessThan(190);
    expect(metrics.timing.pauseCount).toBe(1);
  });

  it('fraca e forte produzem as mesmas metricas', () => {
    const fraca = analyze(enunciado(0.012), SR).metrics;
    const forte = analyze(enunciado(0.4), SR).metrics;

    expect(Math.abs(fraca.f0.meanHz - forte.f0.meanHz)).toBeLessThan(3);
    expect(fraca.timing.pauseCount).toBe(forte.timing.pauseCount);
    expect(Math.abs(fraca.timing.syllableCount - forte.timing.syllableCount))
      .toBeLessThanOrEqual(1);
  });

  it('registra o nivel de entrada real, nao o normalizado', () => {
    const { metrics } = analyze(enunciado(0.012), SR);
    // O pico apos ganho sobe muito; o de entrada continua contando a verdade
    // sobre a captacao, que e o que alimenta o aviso de "fale mais perto".
    expect(metrics.intensity.inputPeakDb).toBeLessThan(-25);
    expect(metrics.intensity.peakDb).toBeGreaterThan(metrics.intensity.inputPeakDb + 20);
    expect(metrics.intensity.appliedGain).toBeGreaterThan(1);
  });

  it('microfone realmente mudo ainda e sinalizado', () => {
    const { metrics } = analyze(silence(2, SR, 0.00002), SR);
    expect(metrics.warnings).toContain('volume-baixo');
    expect(metrics.warnings).toContain('sem-voz');
  });

  it('o alvo de pico e respeitado', () => {
    expect(TARGET_PEAK).toBeLessThan(1);
    expect(TARGET_PEAK).toBeGreaterThan(0.5);
  });
});
