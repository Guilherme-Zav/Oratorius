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
import { yinPeriod, DEFAULT_PITCH_OPTIONS } from "../dsp/pitch.js";
const WORKLET_URL = new URL('./worklets/pcm-recorder.js', document.baseURI).href;
/** Taxa alvo do rastreamento de pitch ao vivo — decimar corta o custo em ~9x. */
const LIVE_PITCH_RATE = 16000;
export class MicRecorder {
    ctx = null;
    stream = null;
    node = null;
    source = null;
    chunks = [];
    totalSamples = 0;
    recording = false;
    startedAt = 0;
    /** Janela deslizante ja decimada, usada so para o pitch ao vivo. */
    liveWindow = new Float32Array(1024);
    liveDecimation = 3;
    decimAccumulator = 0;
    decimCount = 0;
    listener = null;
    get isRecording() {
        return this.recording;
    }
    get sampleRate() {
        return this.ctx?.sampleRate ?? 48000;
    }
    /**
     * Pede permissao e prepara o grafo de audio. Separado de `start()` porque no
     * iOS o AudioContext so pode ser criado dentro de um gesto do usuario, e a
     * primeira chamada e lenta (carrega o worklet) — fazer isso ao apertar
     * "gravar" custaria meio segundo do enunciado.
     */
    async prepare() {
        if (this.ctx && this.ctx.state !== 'closed') {
            if (this.ctx.state === 'suspended')
                await this.ctx.resume();
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
        if (this.ctx.state === 'suspended')
            await this.ctx.resume();
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
    onLevel(listener) {
        this.listener = listener;
    }
    async start() {
        await this.prepare();
        this.chunks = [];
        this.totalSamples = 0;
        this.liveWindow.fill(0);
        this.decimAccumulator = 0;
        this.decimCount = 0;
        this.startedAt = performance.now();
        this.recording = true;
        this.node?.port.postMessage('start');
    }
    async stop() {
        if (!this.recording) {
            return { pcm: new Float32Array(0), sampleRate: this.sampleRate, durationSec: 0 };
        }
        this.recording = false;
        this.node?.port.postMessage('stop');
        // Espera o ultimo bloco parcial chegar do worklet.
        await new Promise((resolve) => setTimeout(resolve, 60));
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
    async release() {
        this.recording = false;
        this.listener = null;
        try {
            this.node?.port.postMessage('stop');
            this.source?.disconnect();
            this.node?.disconnect();
            this.stream?.getTracks().forEach((t) => t.stop());
            if (this.ctx && this.ctx.state !== 'closed')
                await this.ctx.close();
        }
        catch {
            // Liberar recursos nunca deve derrubar a UI.
        }
        this.ctx = null;
        this.stream = null;
        this.node = null;
        this.source = null;
    }
    onWorkletMessage(msg) {
        if (!msg || typeof msg !== 'object')
            return;
        const data = msg;
        if (data.type !== 'pcm' || !data.data)
            return;
        const chunk = data.data;
        this.chunks.push(chunk);
        this.totalSamples += chunk.length;
        this.updateLive(chunk);
    }
    updateLive(chunk) {
        if (!this.listener)
            return;
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < chunk.length; i++) {
            const v = chunk[i];
            sum += v * v;
            const a = v < 0 ? -v : v;
            if (a > peak)
                peak = a;
            // Decimacao por media movel — funciona como um passa-baixa rudimentar,
            // suficiente porque so precisamos da periodicidade, nao do timbre.
            this.decimAccumulator += v;
            if (++this.decimCount === this.liveDecimation) {
                this.liveWindow.copyWithin(0, 1);
                this.liveWindow[this.liveWindow.length - 1] = this.decimAccumulator / this.liveDecimation;
                this.decimAccumulator = 0;
                this.decimCount = 0;
            }
        }
        const rms = Math.sqrt(sum / chunk.length);
        let f0 = 0;
        if (rms > 0.004) {
            const rate = this.sampleRate / this.liveDecimation;
            const { period } = yinPeriod(this.liveWindow, rate, {
                ...DEFAULT_PITCH_OPTIONS,
                threshold: 0.2,
            });
            if (period > 0) {
                const hz = rate / period;
                if (hz >= DEFAULT_PITCH_OPTIONS.fmin && hz <= DEFAULT_PITCH_OPTIONS.fmax)
                    f0 = hz;
            }
        }
        this.listener({
            rms,
            peak,
            f0,
            elapsedSec: (performance.now() - this.startedAt) / 1000,
        });
    }
}
/** Diagnostico do ambiente, exibido em Ajustes. */
export function micSupport() {
    if (!window.isSecureContext) {
        return { ok: false, reason: 'Contexto inseguro: o microfone exige HTTPS ou localhost.' };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        return { ok: false, reason: 'Este navegador nao expoe getUserMedia.' };
    }
    if (typeof AudioWorkletNode === 'undefined') {
        return { ok: false, reason: 'AudioWorklet indisponivel neste navegador.' };
    }
    return { ok: true };
}
//# sourceMappingURL=capture.js.map