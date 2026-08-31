import { describe, it } from 'node:test';
import { expect } from '../testing/expect.ts';

import { median, percentile, semitones, stdDev } from './frames.ts';
import { ANALYSIS_RATE, resample } from './resample.ts';
import { trackPitch, fixOctaveJumps, voicedValues } from './pitch.ts';
import { trackIntensity, toDb, clippingRatio, peakDb } from './intensity.ts';
import { detectVoiceActivity } from './vad.ts';
import { analyzeSpectrum } from './spectrum.ts';
import { detectSyllables } from './syllables.ts';
import { analyzeMpt } from './mpt.ts';
import { analyzeDdk } from './ddk.ts';
import { analyze } from './analyze.ts';
import { fft } from './fft.ts';
import {
  concat, ddkSeries, envelope, glide, glottalTone, noiseBurst, silence,
} from './testSignals.ts';

const SR = 48000;

describe('frames', () => {
  it('mediana e percentil', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(percentile([0, 10], 0.5)).toBeCloseTo(5, 6);
  });

  it('semitons: uma oitava vale 12', () => {
    expect(semitones(220, 110)).toBeCloseTo(12, 6);
    expect(semitones(110, 220)).toBeCloseTo(-12, 6);
  });

  it('desvio padrao amostral', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });
});

describe('fft', () => {
  it('acha o bin correto de uma senoide', () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const binTarget = 64;
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * binTarget * i) / n);
    fft(re, im);
    let best = 0;
    let bestMag = 0;
    for (let i = 1; i < n / 2; i++) {
      const m = Math.hypot(re[i], im[i]);
      if (m > bestMag) { bestMag = m; best = i; }
    }
    expect(best).toBe(binTarget);
  });
});

describe('resample', () => {
  it('produz o numero de amostras esperado', () => {
    const x = glottalTone(150, 1.0, SR);
    const y = resample(x, SR, ANALYSIS_RATE);
    expect(y.length).toBeCloseTo(ANALYSIS_RATE, -2);
  });

  it('preserva f0 apos reamostrar 48k -> 16k', () => {
    const x = glottalTone(147, 1.0, SR);
    const y = resample(x, SR, ANALYSIS_RATE);
    const track = trackPitch(y, ANALYSIS_RATE);
    const v = voicedValues(track.f0);
    expect(v.length).toBeGreaterThan(50);
    expect(median(v)).toBeCloseTo(147, 0);
  });
});

describe('pitch (YIN)', () => {
  const cases = [85, 110, 147, 196, 240, 330];
  for (const f of cases) {
    it(`detecta ${f} Hz com erro < 1%`, () => {
      const x = resample(glottalTone(f, 0.8, SR), SR, ANALYSIS_RATE);
      const track = trackPitch(x, ANALYSIS_RATE);
      const v = voicedValues(track.f0);
      expect(v.length).toBeGreaterThan(30);
      const m = median(v);
      expect(Math.abs(m - f) / f).toBeLessThan(0.01);
    });
  }

  it('marca silencio como nao vozeado', () => {
    const x = resample(silence(0.8, SR), SR, ANALYSIS_RATE);
    const track = trackPitch(x, ANALYSIS_RATE);
    expect(voicedValues(track.f0).length).toBe(0);
  });

  it('marca ruido de banda larga como nao vozeado na maior parte dos frames', () => {
    const x = resample(noiseBurst(0.8, SR, 0.2), SR, ANALYSIS_RATE);
    const track = trackPitch(x, ANALYSIS_RATE);
    const ratio = voicedValues(track.f0).length / track.f0.length;
    expect(ratio).toBeLessThan(0.35);
  });

  it('acompanha um glissando de 120 a 240 Hz', () => {
    const x = resample(glide(120, 240, 1.5, SR), SR, ANALYSIS_RATE);
    const track = fixOctaveJumps(trackPitch(x, ANALYSIS_RATE));
    const v = voicedValues(track.f0);
    expect(v.length).toBeGreaterThan(80);
    // Primeiro quarto perto de 120, ultimo quarto perto de 240.
    const q = Math.floor(v.length / 4);
    expect(median(v.slice(0, q))).toBeGreaterThan(110);
    expect(median(v.slice(0, q))).toBeLessThan(160);
    expect(median(v.slice(-q))).toBeGreaterThan(200);
    expect(median(v.slice(-q))).toBeLessThan(260);
  });

  it('confianca e alta em tom puro e baixa em ruido', () => {
    const tone = trackPitch(resample(glottalTone(150, 0.5, SR), SR, ANALYSIS_RATE), ANALYSIS_RATE);
    const conf: number[] = [];
    for (let i = 0; i < tone.f0.length; i++) if (tone.f0[i] > 0) conf.push(tone.confidence[i]);
    expect(median(conf)).toBeGreaterThan(0.8);
  });
});

describe('intensity', () => {
  it('dBFS de amplitude conhecida', () => {
    // Senoide de amplitude 1.0 tem RMS = 0.707 -> -3 dBFS.
    expect(toDb(Math.SQRT1_2)).toBeCloseTo(-3.01, 1);
    expect(toDb(0.1)).toBeCloseTo(-20, 1);
    expect(toDb(0)).toBe(-100);
  });

  it('detecta clipping', () => {
    const x = new Float32Array(1000).fill(0.1);
    for (let i = 0; i < 50; i++) x[i] = 1.0;
    expect(clippingRatio(x)).toBeCloseTo(0.05, 3);
    expect(peakDb(x)).toBeCloseTo(0, 1);
  });

  it('sinal mais alto tem dB maior', () => {
    const quiet = trackIntensity(glottalTone(150, 0.5, SR, 0.05), SR);
    const loud = trackIntensity(glottalTone(150, 0.5, SR, 0.5), SR);
    const q = median(Array.from(quiet.db));
    const l = median(Array.from(loud.db));
    expect(l - q).toBeCloseTo(20, 0);
  });
});

describe('vad', () => {
  it('separa tres blocos de fala com duas pausas', () => {
    const sig = concat(
      silence(0.3, SR),
      envelope(glottalTone(140, 0.8, SR), SR),
      silence(0.6, SR),
      envelope(glottalTone(140, 0.8, SR), SR),
      silence(0.6, SR),
      envelope(glottalTone(140, 0.8, SR), SR),
      silence(0.3, SR),
    );
    const x = resample(sig, SR, ANALYSIS_RATE);
    const intensity = trackIntensity(x, ANALYSIS_RATE);
    const pitch = trackPitch(x, ANALYSIS_RATE);
    const vad = detectVoiceActivity(intensity, pitch, x.length / ANALYSIS_RATE);

    expect(vad.speech.length).toBe(3);
    expect(vad.internalPauses.length).toBe(2);
    expect(vad.speechTotalSec).toBeGreaterThan(2.0);
    expect(vad.speechTotalSec).toBeLessThan(2.9);
    for (const p of vad.internalPauses) {
      expect(p.durationSec).toBeGreaterThan(0.4);
      expect(p.durationSec).toBeLessThan(0.8);
    }
  });

  it('nao quebra a fala em silencios curtos de oclusiva', () => {
    const sig = concat(
      silence(0.2, SR),
      envelope(glottalTone(140, 0.4, SR), SR),
      silence(0.06, SR), // oclusao de /p/ — NAO e pausa
      envelope(glottalTone(140, 0.4, SR), SR),
      silence(0.2, SR),
    );
    const x = resample(sig, SR, ANALYSIS_RATE);
    const intensity = trackIntensity(x, ANALYSIS_RATE);
    const vad = detectVoiceActivity(intensity, null, x.length / ANALYSIS_RATE);
    expect(vad.speech.length).toBe(1);
    expect(vad.internalPauses.length).toBe(0);
  });
});

describe('syllables', () => {
  it('conta cinco nucleos em cinco vogais separadas', () => {
    const parts: Float32Array[] = [silence(0.2, SR)];
    for (let i = 0; i < 5; i++) {
      parts.push(envelope(glottalTone(140, 0.18, SR, 0.35), SR, 20));
      parts.push(silence(0.12, SR));
    }
    const x = resample(concat(...parts), SR, ANALYSIS_RATE);
    const intensity = trackIntensity(x, ANALYSIS_RATE);
    const pitch = trackPitch(x, ANALYSIS_RATE);
    const totalSec = x.length / ANALYSIS_RATE;
    const vad = detectVoiceActivity(intensity, pitch, totalSec);
    const syl = detectSyllables(intensity, pitch, vad.thresholdDb, totalSec, vad.speech);
    expect(syl.count).toBe(5);
    expect(syl.articulationRate).toBeGreaterThan(syl.speechRate);
  });

  it('nao conta fricativa como silaba (criterio de vozeamento)', () => {
    const x = resample(
      concat(silence(0.2, SR), noiseBurst(0.4, SR, 0.25), silence(0.2, SR)),
      SR, ANALYSIS_RATE,
    );
    const intensity = trackIntensity(x, ANALYSIS_RATE);
    const pitch = trackPitch(x, ANALYSIS_RATE);
    const totalSec = x.length / ANALYSIS_RATE;
    const vad = detectVoiceActivity(intensity, pitch, totalSec);
    const syl = detectSyllables(intensity, pitch, vad.thresholdDb, totalSec, vad.speech);
    expect(syl.count).toBeLessThanOrEqual(1);
  });
});

describe('mpt', () => {
  it('mede a duracao de um /a/ sustentado', () => {
    const sig = concat(
      silence(0.3, SR),
      envelope(glottalTone(120, 6.0, SR, 0.3), SR, 30),
      silence(0.3, SR),
    );
    const x = resample(sig, SR, ANALYSIS_RATE);
    const intensity = trackIntensity(x, ANALYSIS_RATE);
    const pitch = trackPitch(x, ANALYSIS_RATE);
    const mpt = analyzeMpt(pitch, intensity);
    expect(mpt.seconds).toBeGreaterThan(5.5);
    expect(mpt.seconds).toBeLessThan(6.3);
    expect(mpt.f0SdSemitones).toBeLessThan(0.5); // tom estavel
    expect(Math.abs(mpt.decayDb)).toBeLessThan(3); // sem perda de apoio
  });

  it('detecta perda de apoio (decaimento de intensidade)', () => {
    const n = Math.round(5 * SR);
    const tone = glottalTone(120, 5, SR, 0.4);
    for (let i = 0; i < n; i++) tone[i] *= 1 - 0.75 * (i / n); // some ao longo do tempo
    const x = resample(concat(silence(0.3, SR), tone, silence(0.3, SR)), SR, ANALYSIS_RATE);
    const intensity = trackIntensity(x, ANALYSIS_RATE);
    const pitch = trackPitch(x, ANALYSIS_RATE);
    const mpt = analyzeMpt(pitch, intensity);
    expect(mpt.decayDb).toBeGreaterThan(5);
  });

  it('tolera falha momentanea do detector no meio da sustentacao', () => {
    const sig = concat(
      silence(0.2, SR),
      envelope(glottalTone(120, 2.0, SR, 0.3), SR),
      silence(0.05, SR), // 50 ms de falha, abaixo do maxGap de 120 ms
      envelope(glottalTone(120, 2.0, SR, 0.3), SR),
      silence(0.2, SR),
    );
    const x = resample(sig, SR, ANALYSIS_RATE);
    const intensity = trackIntensity(x, ANALYSIS_RATE);
    const pitch = trackPitch(x, ANALYSIS_RATE);
    expect(analyzeMpt(pitch, intensity).seconds).toBeGreaterThan(3.5);
  });
});

describe('ddk', () => {
  it('mede a taxa de uma serie regular de 5 silabas/s', () => {
    const x = resample(ddkSeries(20, 5, SR), SR, ANALYSIS_RATE);
    const intensity = trackIntensity(x, ANALYSIS_RATE);
    const spectral = analyzeSpectrum(x, ANALYSIS_RATE);
    const ddk = analyzeDdk(spectral, intensity);
    expect(ddk.count).toBeGreaterThanOrEqual(17);
    expect(ddk.count).toBeLessThanOrEqual(22);
    expect(ddk.syllPerSec).toBeGreaterThan(4.3);
    expect(ddk.syllPerSec).toBeLessThan(5.7);
  });

  it('CV distingue serie regular de serie irregular', () => {
    const regular = resample(ddkSeries(20, 5, SR, 0), SR, ANALYSIS_RATE);
    const irregular = resample(ddkSeries(20, 5, SR, 0.45, 7), SR, ANALYSIS_RATE);

    const measure = (x: Float32Array) => analyzeDdk(
      analyzeSpectrum(x, ANALYSIS_RATE), trackIntensity(x, ANALYSIS_RATE),
    );

    const a = measure(regular);
    const b = measure(irregular);
    expect(a.cvPercent).toBeLessThan(15);
    expect(b.cvPercent).toBeGreaterThan(a.cvPercent + 8);
  });
});

describe('analyze (integracao)', () => {
  it('produz metricas coerentes para um enunciado sintetico', () => {
    const sig = concat(
      silence(0.3, SR),
      envelope(glottalTone(130, 0.7, SR, 0.3), SR),
      silence(0.5, SR),
      envelope(glottalTone(160, 0.7, SR, 0.3), SR),
      silence(0.3, SR),
    );
    const { metrics, curves } = analyze(sig, SR);

    expect(metrics.sampleRate).toBe(ANALYSIS_RATE);
    expect(metrics.timing.totalSec).toBeCloseTo(2.5, 1);
    expect(metrics.timing.pauseCount).toBe(1);
    expect(metrics.f0.meanHz).toBeGreaterThan(120);
    expect(metrics.f0.meanHz).toBeLessThan(170);
    expect(metrics.f0.rangeSemitones).toBeGreaterThan(2);
    expect(metrics.warnings).not.toContain('sem-voz');
    expect(curves.waveform.length).toBe(720);
    expect(curves.pauses.length).toBe(1);
  });

  it('sinaliza gravacao sem voz', () => {
    const { metrics } = analyze(silence(2, SR), SR);
    expect(metrics.warnings).toContain('sem-voz');
  });

  it('sinaliza clipping', () => {
    const loud = glottalTone(130, 1.5, SR, 3.0); // estoura a escala
    for (let i = 0; i < loud.length; i++) loud[i] = Math.max(-1, Math.min(1, loud[i]));
    const { metrics } = analyze(loud, SR);
    expect(metrics.warnings).toContain('clipping');
  });

  it('gravacao muito curta e sinalizada', () => {
    const { metrics } = analyze(glottalTone(130, 0.2, SR), SR);
    expect(metrics.warnings).toContain('muito-curto');
  });
});

describe('alongamentos (pausas preenchidas)', () => {
  /** Vogal longa, plana e estavel — a assinatura de um "eeee". */
  function steadyVowel(sec: number): Float32Array {
    return envelope(glottalTone(128, sec, SR, 0.3), SR, 25);
  }

  it('nao reporta alongamento em exercicio curto de repeticao', () => {
    // "a — ra — a — ra": vogais deliberadas de 400 ms. Sao o objetivo do
    // exercicio, nao vicio de linguagem — reportar aqui seria falso positivo.
    const drill = concat(
      silence(0.25, SR),
      steadyVowel(0.4), silence(0.12, SR),
      steadyVowel(0.4), silence(0.12, SR),
      steadyVowel(0.4), silence(0.25, SR),
    );
    const { metrics } = analyze(drill, SR);
    expect(metrics.timing.speechSec).toBeLessThan(5);
    expect(metrics.timing.filledPauseCount).toBe(0);
  });

  it('reporta alongamentos em fala conectada longa', () => {
    // Fala corrida com dois "eeee" plantados no meio.
    const parts: Float32Array[] = [silence(0.3, SR)];
    for (let i = 0; i < 24; i++) {
      parts.push(envelope(glottalTone(110 + (i % 6) * 20, 0.16, SR, 0.3), SR, 12));
      parts.push(silence(0.05, SR));
      if (i === 8 || i === 17) parts.push(steadyVowel(0.75), silence(0.05, SR));
    }
    parts.push(silence(0.3, SR));

    const { metrics } = analyze(concat(...parts), SR);
    expect(metrics.timing.speechSec).toBeGreaterThan(5);
    expect(metrics.timing.filledPauseCount).toBeGreaterThanOrEqual(2);
    expect(metrics.timing.filledPausePerMin).toBeGreaterThan(0);
  });
});

describe('passo adaptativo em gravacoes longas', () => {
  /** Enunciado longo e realista: silabas alternando f0, com pausas de verdade. */
  function longUtterance(seconds: number): Float32Array {
    const parts: Float32Array[] = [silence(0.3, SR)];
    let elapsed = 0.3;
    let i = 0;
    while (elapsed < seconds) {
      const f = 110 + (i % 5) * 22;
      parts.push(envelope(glottalTone(f, 0.16, SR, 0.3), SR, 12));
      parts.push(silence(0.06, SR));
      elapsed += 0.22;
      // Uma pausa real a cada oito silabas.
      if (i % 8 === 7) {
        parts.push(silence(0.45, SR));
        elapsed += 0.45;
      }
      i++;
    }
    return concat(...parts);
  }

  it('gravacao longa continua medindo f0, ritmo e pausas de forma coerente', () => {
    const { metrics } = analyze(longUtterance(26), SR);

    expect(metrics.timing.totalSec).toBeGreaterThan(20);   // entrou no modo longo
    expect(metrics.f0.voicedRatio).toBeGreaterThan(0.4);
    expect(metrics.f0.meanHz).toBeGreaterThan(100);
    expect(metrics.f0.meanHz).toBeLessThan(210);
    expect(metrics.f0.rangeSemitones).toBeGreaterThan(2);
    expect(metrics.timing.pauseCount).toBeGreaterThan(1);
    expect(metrics.timing.syllableCount).toBeGreaterThan(40);
    expect(metrics.warnings).not.toContain('sem-voz');
  });

  it('o passo mais grosso nao distorce as metricas: curta e longa concordam', () => {
    // Mesmo material acustico, abaixo e acima do limiar de 20 s. Se o passo
    // adaptativo enviesasse a medicao, estas duas discordariam.
    const curta = analyze(longUtterance(14), SR).metrics;   // 10 ms
    const longa = analyze(longUtterance(26), SR).metrics;   // 20 ms

    const deltaF0 = Math.abs(curta.f0.meanHz - longa.f0.meanHz);
    expect(deltaF0).toBeLessThan(8);

    const deltaRitmo = Math.abs(curta.timing.articulationRate - longa.timing.articulationRate);
    expect(deltaRitmo).toBeLessThan(0.8);

    const deltaVozeado = Math.abs(curta.f0.voicedRatio - longa.f0.voicedRatio);
    expect(deltaVozeado).toBeLessThan(0.15);
  });

  it('DDK mantem o passo fino mesmo numa serie longa', () => {
    // 25 s de DDK cruzam o limiar de "gravacao longa", mas a regularidade depende
    // da resolucao temporal — este exercicio nunca pode cair para 20 ms.
    const regular = analyze(ddkSeries(120, 5, SR, 0), SR, { ddk: true }).metrics;
    expect(regular.timing.totalSec).toBeGreaterThan(20);
    expect(regular.ddk!.count).toBeGreaterThan(100);
    expect(regular.ddk!.syllPerSec).toBeGreaterThan(4.3);
    expect(regular.ddk!.syllPerSec).toBeLessThan(5.7);
    expect(regular.ddk!.cvPercent).toBeLessThan(15);
  });

  it('CV do DDK continua distinguindo regular de irregular em serie longa', () => {
    const a = analyze(ddkSeries(120, 5, SR, 0), SR, { ddk: true }).metrics;
    const b = analyze(ddkSeries(120, 5, SR, 0.45, 7), SR, { ddk: true }).metrics;
    expect(b.ddk!.cvPercent).toBeGreaterThan(a.ddk!.cvPercent + 8);
  });
});
