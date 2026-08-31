/**
 * Geradores de sinal sintetico com verdade conhecida.
 *
 * Isto e o que torna a Camada 1 verificavel no Windows, sem iPhone: se o detector
 * de f0 nao acha 120 Hz num sinal que TEM 120 Hz, nao adianta testar no aparelho.
 */

/** Serra com harmonicos — aproxima grosseiramente o pulso glotal. */
export function glottalTone(
  freq: number,
  durationSec: number,
  sampleRate: number,
  amplitude = 0.3,
  harmonics = 12,
): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (let h = 1; h <= harmonics; h++) {
      if (h * freq > sampleRate / 2) break;
      v += Math.sin(2 * Math.PI * h * freq * t) / h;
    }
    out[i] = (v / Math.log(harmonics + 1)) * amplitude;
  }
  return out;
}

/** Tom com f0 variando linearmente — testa o rastreamento, nao so a deteccao. */
export function glide(
  fromHz: number,
  toHz: number,
  durationSec: number,
  sampleRate: number,
  amplitude = 0.3,
): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = fromHz + ((toHz - fromHz) * i) / n;
    phase += (2 * Math.PI * f) / sampleRate;
    out[i] = Math.sin(phase) * amplitude + Math.sin(2 * phase) * amplitude * 0.4;
  }
  return out;
}

export function silence(durationSec: number, sampleRate: number, noise = 0.0002): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * noise;
  return out;
}

/** Ruido de banda larga — aproxima uma fricativa tipo /s/. */
export function noiseBurst(
  durationSec: number,
  sampleRate: number,
  amplitude = 0.15,
): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * amplitude;
  return out;
}

export function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Envelope de ataque/decaimento, para nao gerar cliques nas bordas. */
export function envelope(x: Float32Array, sampleRate: number, rampMs = 15): Float32Array {
  const ramp = Math.max(1, Math.round((rampMs / 1000) * sampleRate));
  const out = Float32Array.from(x);
  for (let i = 0; i < Math.min(ramp, out.length); i++) {
    const g = i / ramp;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}

/**
 * Serie DDK sintetica: `count` silabas a `rateHz`, cada uma com silencio de
 * oclusao seguido de explosao e vogal. `jitterRatio` desregula os intervalos,
 * o que permite testar se o CV realmente sobe quando o ritmo fica irregular.
 */
export function ddkSeries(
  count: number,
  rateHz: number,
  sampleRate: number,
  jitterRatio = 0,
  seed = 1,
): Float32Array {
  const period = 1 / rateHz;
  const parts: Float32Array[] = [silence(0.15, sampleRate)];
  let rng = seed;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) % 2147483648;
    return rng / 2147483648;
  };
  for (let i = 0; i < count; i++) {
    const jitter = jitterRatio > 0 ? (rand() * 2 - 1) * jitterRatio * period : 0;
    const total = Math.max(0.05, period + jitter);
    const closure = total * 0.35;
    const burst = 0.008;
    const vowel = Math.max(0.02, total - closure - burst);
    parts.push(
      silence(closure, sampleRate, 0.0001),
      noiseBurst(burst, sampleRate, 0.35),
      envelope(glottalTone(130, vowel, sampleRate, 0.3), sampleRate, 5),
    );
  }
  parts.push(silence(0.15, sampleRate));
  return concat(...parts);
}
