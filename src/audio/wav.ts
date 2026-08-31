/**
 * Codificacao e decodificacao de WAV PCM 16-bit mono.
 *
 * Por que WAV e nao o MediaRecorder: no iOS o MediaRecorder produz MP4/AAC, um
 * codec com perdas que altera exatamente o que medimos (transientes, ruido de
 * fricativa, envelope). Guardamos WAV a 16 kHz — 32 KB/s, gerenciavel com a
 * politica de retencao do ADR-003 — e mantemos o sinal identico ao analisado.
 */

export interface DecodedWav {
  pcm: Float32Array;
  sampleRate: number;
}

export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);        // tamanho do bloco fmt
  view.setUint16(20, 1, true);         // PCM
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true);              // block align
  view.setUint16(34, 16, true);        // bits por amostra
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    // Clamp antes de escalar: valores fora de [-1,1] dariam wrap-around, que soa
    // como estalo violento em vez de saturacao.
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function decodeWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  if (view.getUint32(0, false) !== 0x52494646) throw new Error('Nao e um arquivo RIFF');

  let offset = 12;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let channels = 1;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3),
    );
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2); // chunks sao alinhados em 2 bytes
  }

  if (dataOffset < 0) throw new Error('Chunk "data" nao encontrado');
  if (bitsPerSample !== 16) throw new Error(`Esperava 16 bits, encontrou ${bitsPerSample}`);

  const frames = Math.floor(dataSize / 2 / channels);
  const pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += view.getInt16(dataOffset + (i * channels + c) * 2, true) / 0x8000;
    }
    pcm[i] = sum / channels;
  }

  return { pcm, sampleRate };
}
