/**
 * Captura de microfone.
 *
 * Decisao critica de qualidade de medicao: TODO processamento automatico do
 * sistema e desligado (echoCancellation, noiseSuppression, autoGainControl).
 *
 * O AGC e o mais nocivo: ele iguala o volume ao longo do tempo, o que destroi
 * justamente a metrica de projecao vocal e mascara a perda de apoio no fim de uma
 * sustentacao. A supressao de ruido corta transientes de baixa energia — que e
 * exatamente o que um tepe /r/ e. Com esses filtros ligados, o app mediria o
 * processamento da Apple, nao a sua voz.
 */

import { yinPeriod, DEFAULT_PITCH_OPTIONS } from '../dsp/pitch.ts';

export interface LiveLevel {
  /** RMS instantaneo, 0..1. */
  rms: number;
  peak: number;
  /**
   * Nivel 0..1 ja escalado para desenhar a barra, com referencia automatica.
   * Use este na UI; `rms` cru fica quase sempre perto de zero sem ganho do sistema.
   */
  display: number;
  /** f0 estimado ao vivo, 0 se nao vozeado. */
  f0: number;
  elapsedSec: number;
}

export interface Recording {
  pcm: Float32Array;
  sampleRate: number;
  durationSec: number;
}

export type LevelListener = (level: LiveLevel) => void;

const WORKLET_URL = new URL('./worklets/pcm-recorder.js', document.baseURI).href;

/** Taxa alvo do rastreamento de pitch ao vivo — decimar corta o custo em ~9x. */
const LIVE_PITCH_RATE = 16000;

export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  private chunks: Float32Array[] = [];
  private totalSamples = 0;
  private recording = false;
  private startedAt = 0;

  /**
   * Janela deslizante ja decimada, usada so para o pitch ao vivo.
   *
   * E um buffer CIRCULAR, nao um array que desliza. A versao anterior fazia
   * `copyWithin(0, 1)` a cada amostra decimada: 1024 movimentacoes por amostra,
   * ~16 milhoes de operacoes por segundo na thread principal, no meio da
   * gravacao. Era a causa dos engasgos na captacao.
   */
  private liveWindow = new Float32Array(1024);
  private liveWrite = 0;
  private liveOrdered = new Float32Array(1024);
  private liveDecimation = 3;
  private decimAccumulator = 0;
  private decimCount = 0;

  private listener: LevelListener | null = null;
  /** Resolvida quando o worklet confirma que esvaziou o buffer. */
  private stopAck: (() => void) | null = null;

  /** Pico decaindo, so para o medidor de nivel se auto-ajustar na tela. */
  private displayPeak = 0.02;

  get isRecording(): boolean {
    return this.recording;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  /**
   * Pede permissao e prepara o grafo de audio. Separado de `start()` porque no
   * iOS o AudioContext so pode ser criado dentro de um gesto do usuario, e a
   * primeira chamada e lenta (carrega o worklet) — fazer isso ao apertar
   * "gravar" custaria meio segundo do enunciado.
   */
  async prepare(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });

    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    await this.ctx.audioWorklet.addModule(WORKLET_URL);

    this.liveDecimation = Math.max(1, Math.round(this.ctx.sampleRate / LIVE_PITCH_RATE));
    this.liveWindow = new Float32Array(1024);

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'pcm-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { chunkSize: 2048 },
    });
    this.node.port.onmessage = (event) => this.onWorkletMessage(event.data);
    this.source.connect(this.node);
  }

  onLevel(listener: LevelListener | null): void {
    this.listener = listener;
  }

  async start(): Promise<void> {
    await this.prepare();
    this.chunks = [];
    this.totalSamples = 0;
    this.liveWindow.fill(0);
    this.liveWrite = 0;
    this.decimAccumulator = 0;
    this.decimCount = 0;
    this.displayPeak = 0.02;
    this.startedAt = performance.now();
    this.recording = true;
    this.node?.port.postMessage('start');
  }

  async stop(): Promise<Recording> {
    if (!this.recording) {
      return { pcm: new Float32Array(0), sampleRate: this.sampleRate, durationSec: 0 };
    }
    this.recording = false;

    // Espera o worklet confirmar que esvaziou o buffer, em vez de dormir um
    // tempo fixo. O bloco final e parcial (ate 2048 amostras, ~43 ms) e so e
    // enviado no flush — com espera fixa, o fim da frase podia sumir.
    const flushed = new Promise<void>((resolve) => {
      this.stopAck = resolve;
      // Rede de seguranca: se a mensagem se perder, nao travamos a UI para sempre.
      setTimeout(resolve, 400);
    });
    this.node?.port.postMessage('stop');
    await flushed;
    this.stopAck = null;

    const pcm = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const c of this.chunks) {
      pcm.set(c, offset);
      offset += c.length;
    }
    this.chunks = [];

    const sampleRate = this.sampleRate;
    return { pcm, sampleRate, durationSec: pcm.length / sampleRate };
  }

  /** Libera microfone e contexto. Importante: o indicador laranja do iOS so some aqui. */
  async release(): Promise<void> {
    this.recording = false;
    this.listener = null;
    try {
      this.node?.port.postMessage('stop');
      this.source?.disconnect();
      this.node?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    } catch {
      // Liberar recursos nunca deve derrubar a UI.
    }
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.source = null;
  }

  private onWorkletMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const data = msg as { type?: string; data?: Float32Array };

    if (data.type === 'stopped') {
      this.stopAck?.();
      return;
    }
    if (data.type !== 'pcm' || !data.data) return;

    const chunk = data.data;
    this.chunks.push(chunk);
    this.totalSamples += chunk.length;
    this.updateLive(chunk);
  }

  private updateLive(chunk: Float32Array): void {
    if (!this.listener) return;

    const n = this.liveWindow.length;
    let sum = 0;
    let peak = 0;

    for (let i = 0; i < chunk.length; i++) {
      const v = chunk[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;

      // Decimacao por media movel — funciona como um passa-baixa rudimentar,
      // suficiente porque so precisamos da periodicidade, nao do timbre.
      this.decimAccumulator += v;
      if (++this.decimCount === this.liveDecimation) {
        this.liveWindow[this.liveWrite] = this.decimAccumulator / this.liveDecimation;
        this.liveWrite = (this.liveWrite + 1) % n;
        this.decimAccumulator = 0;
        this.decimCount = 0;
      }
    }

    const rms = Math.sqrt(sum / chunk.length);

    // O medidor se auto-ajusta: com o ganho automatico do sistema desligado, um
    // pico de 0,05 e uma fala perfeitamente normal. Uma barra fixa de 0 a 1
    // ficaria praticamente parada e passaria a impressao de que o microfone
    // esta morto — que foi exatamente o que aconteceu.
    if (peak > this.displayPeak) this.displayPeak = peak;
    else this.displayPeak = Math.max(0.02, this.displayPeak * 0.995);

    let f0 = 0;
    // Limiar relativo ao proprio nivel da gravacao, nao um valor absoluto.
    if (rms > this.displayPeak * 0.08) {
      // Desenrola o buffer circular para a ordem cronologica que o YIN espera.
      const ordered = this.liveOrdered;
      const head = n - this.liveWrite;
      ordered.set(this.liveWindow.subarray(this.liveWrite), 0);
      ordered.set(this.liveWindow.subarray(0, this.liveWrite), head);

      const rate = this.sampleRate / this.liveDecimation;
      const { period } = yinPeriod(ordered, rate, {
        ...DEFAULT_PITCH_OPTIONS,
        threshold: 0.2,
        silenceRms: 0,
      });
      if (period > 0) {
        const hz = rate / period;
        if (hz >= DEFAULT_PITCH_OPTIONS.fmin && hz <= DEFAULT_PITCH_OPTIONS.fmax) f0 = hz;
      }
    }

    this.listener({
      rms,
      peak,
      /** 0..1 ja escalado para a barra na tela. */
      display: Math.min(1, rms / (this.displayPeak * 0.75)),
      f0,
      elapsedSec: (performance.now() - this.startedAt) / 1000,
    });
  }
}

/** Diagnostico do ambiente, exibido em Ajustes. */
export function micSupport(): { ok: boolean; reason?: string } {
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: 'O microfone só funciona em endereço seguro (https). Abra o app pelo endereço oficial.',
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'Este navegador não deixa o app usar o microfone.' };
  }
  if (typeof AudioWorkletNode === 'undefined') {
    return { ok: false, reason: 'Este navegador é antigo demais para o app. Use o Safari atualizado.' };
  }
  return { ok: true };
}
