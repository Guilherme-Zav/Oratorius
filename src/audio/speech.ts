/**
 * Voz-modelo via speechSynthesis.
 *
 * Nao e so conveniencia: ouvir o alvo imediatamente antes de produzi-lo e o
 * mecanismo central de qualquer treino de articulacao. O par "ouvir -> repetir ->
 * comparar" faz mais pela automatizacao do /r/ do que qualquer nota numerica.
 *
 * O iOS entrega vozes pt-BR nativas, offline e sem custo.
 */

export interface VoiceInfo {
  name: string;
  lang: string;
  localService: boolean;
}

let cachedVoices: SpeechSynthesisVoice[] = [];

/**
 * O iOS popula a lista de vozes de forma assincrona e, na primeira chamada,
 * costuma devolver array vazio. Esperamos o evento `voiceschanged`.
 */
export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);

  const immediate = speechSynthesis.getVoices();
  if (immediate.length > 0) {
    cachedVoices = immediate;
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', done);
      clearTimeout(timer);
      cachedVoices = speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
    const timer = setTimeout(done, timeoutMs);
    speechSynthesis.addEventListener('voiceschanged', done);
  });
}

export function pickPortugueseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  return (
    voices.find((v) => v.lang.toLowerCase() === 'pt-br' && v.localService) ??
    voices.find((v) => v.lang.toLowerCase() === 'pt-br') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
    null
  );
}

export interface SpeakOptions {
  /** 0.4 e util para ouvir a articulacao do encontro consonantal em camera lenta. */
  rate?: number;
  pitch?: number;
}

export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();

  const voices = cachedVoices.length ? cachedVoices : await loadVoices();
  const voice = pickPortugueseVoice(voices);

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) voice.lang && (utterance.lang = voice.lang);
    if (voice) utterance.voice = voice;
    else utterance.lang = 'pt-BR';
    utterance.rate = options.rate ?? 0.9;
    utterance.pitch = options.pitch ?? 1;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    // Rede de seguranca: o iOS ocasionalmente nao dispara `onend`.
    setTimeout(finish, Math.max(4000, text.length * 180));

    speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export function describeVoices(voices: SpeechSynthesisVoice[]): VoiceInfo[] {
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith('pt'))
    .map((v) => ({ name: v.name, lang: v.lang, localService: v.localService }));
}
