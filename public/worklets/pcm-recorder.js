/**
 * AudioWorklet de captura.
 *
 * Nao faz analise: so acumula PCM cru e entrega em blocos para a thread principal.
 * Toda a inteligencia fica em src/dsp, que roda tanto no navegador quanto no Node
 * (e por isso e testavel). Duplicar DSP aqui criaria duas verdades.
 *
 * Os blocos sao transferidos (zero-copy) para nao gerar pressao de GC durante a
 * gravacao — GC no meio de uma gravacao produz glitch audivel.
 */
class PcmRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.chunkSize = opts.chunkSize || 2048;
    this.buffer = new Float32Array(this.chunkSize);
    this.offset = 0;
    this.recording = false;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg === 'start') {
        this.offset = 0;
        this.recording = true;
      } else if (msg === 'stop') {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  flush() {
    if (this.offset === 0) return;
    const out = this.buffer.slice(0, this.offset);
    this.offset = 0;
    this.port.postMessage({ type: 'pcm', data: out }, [out.buffer]);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    if (this.recording) {
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.offset++] = channel[i];
        if (this.offset === this.chunkSize) this.flush();
      }
    }
    return true;
  }
}

registerProcessor('pcm-recorder', PcmRecorder);
