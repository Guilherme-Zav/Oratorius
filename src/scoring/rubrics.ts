/**
 * Rubricas: quais metricas contam, em que faixa, e com que peso.
 *
 * Tudo declarativo de proposito. Calibrar o app depois de gravar a sua propria
 * voz vira editar numeros aqui, sem tocar em logica — que e exatamente o item
 * "conjunto de calibracao" do ADR-002.
 *
 * Cada criterio pontua 0..1 por uma funcao de rampa: abaixo de `bad` vale 0,
 * acima de `good` vale 1, e no meio interpola. `direction` diz de que lado esta
 * o bom (algumas metricas sao melhores quando menores — CV do DDK, por exemplo).
 */

import type { Metrics } from '../dsp/types.ts';
import type { RubricId } from '../content/types.ts';

export type Direction = 'higher' | 'lower' | 'window';

export interface Criterion {
  id: string;
  label: string;
  weight: number;
  direction: Direction;
  /** Valor que ainda vale 0. */
  bad: number;
  /** Valor a partir do qual vale 1. */
  good: number;
  /** Para `window`: limites externos aceitaveis. */
  windowLow?: number;
  windowHigh?: number;
  /** Extrai o valor bruto das metricas. `null` = criterio nao aplicavel a esta gravacao. */
  extract: (m: Metrics) => number | null;
  /** Frase mostrada quando o criterio vai mal. */
  advice: string;
  /** Frase mostrada quando o criterio vai muito bem. */
  praise?: string;
}

export interface Rubric {
  id: RubricId;
  criteria: Criterion[];
}

function ramp(value: number, bad: number, good: number): number {
  if (good === bad) return value >= good ? 1 : 0;
  const t = (value - bad) / (good - bad);
  return Math.max(0, Math.min(1, t));
}

/** Pontua um criterio isolado, 0..1. */
export function scoreCriterion(c: Criterion, value: number): number {
  switch (c.direction) {
    case 'higher':
      return ramp(value, c.bad, c.good);
    case 'lower':
      return ramp(value, c.bad, c.good); // aqui `bad` > `good` numericamente
    case 'window': {
      const low = c.windowLow ?? c.bad;
      const high = c.windowHigh ?? c.good;
      if (value >= c.bad && value <= c.good) return 1;
      if (value < c.bad) return ramp(value, low, c.bad);
      return ramp(value, high, c.good);
    }
  }
}

// --------------------------------------------------------------- criterios

const articulationRate: Criterion = {
  id: 'ritmo',
  label: 'Ritmo',
  weight: 1,
  direction: 'window',
  bad: 3.8, good: 6.0,          // faixa confortavel: 3,8 a 6,0 silabas/s
  windowLow: 2.0, windowHigh: 8.5,
  extract: (m) => (m.timing.syllableCount >= 4 ? m.timing.articulationRate : null),
  advice: 'Ajuste o ritmo: acima de 6 silabas/s a articulacao comeca a se perder; abaixo de 4 soa arrastado.',
  praise: 'Ritmo em faixa confortavel de escuta.',
};

const pitchVariation: Criterion = {
  id: 'entonacao',
  label: 'Entonacao',
  weight: 1,
  direction: 'higher',
  bad: 1.0, good: 3.0,           // desvio do contorno em semitons
  extract: (m) => (m.f0.voicedRatio > 0.25 ? m.f0.sdSemitones : null),
  advice: 'A curva de tom saiu quase reta — a fala soou monotona. Suba no inicio das frases e desca no fim.',
  praise: 'Boa variacao de tom: a fala teve relevo.',
};

const intensityVariation: Criterion = {
  id: 'dinamica',
  label: 'Dinamica',
  weight: 0.6,
  direction: 'higher',
  bad: 2.0, good: 6.0,
  extract: (m) => (m.timing.speechSec > 1 ? m.intensity.sdDb : null),
  advice: 'O volume ficou constante do inicio ao fim. Variar intensidade e o que marca o que importa.',
};

const filledPauses: Criterion = {
  id: 'alongamentos',
  label: 'Alongamentos',
  weight: 1,
  direction: 'lower',
  bad: 12, good: 2,              // por minuto de fala
  extract: (m) => (m.timing.speechSec > 5 ? m.timing.filledPausePerMin : null),
  advice: 'Muitos alongamentos ("eeee", "hmmm"). Troque cada um por uma pausa em silencio — soa como confianca, nao como duvida.',
  praise: 'Quase nenhum alongamento.',
};

const pauseUse: Criterion = {
  id: 'pausas',
  label: 'Pausas',
  weight: 0.8,
  direction: 'window',
  bad: 0.08, good: 0.30,         // fracao do tempo total em pausa
  windowLow: 0, windowHigh: 0.55,
  extract: (m) => (m.timing.totalSec > 8 ? m.timing.pauseTotalSec / m.timing.totalSec : null),
  advice: 'Poucas pausas: a fala ficou corrida. Silencio de um segundo depois de uma frase forte vale mais que qualquer enfase.',
  praise: 'Bom uso de pausas.',
};

const fluency: Criterion = {
  id: 'fluencia',
  label: 'Fluencia',
  weight: 1,
  direction: 'lower',
  bad: 1.5, good: 0.4,           // maior pausa interna, em segundos
  extract: (m) => (m.timing.speechSec > 2 ? m.timing.longestPauseSec : null),
  advice: 'Houve uma parada longa no meio — sinal de travamento. Desacelere o comeco: a maioria dos travamentos vem de comecar rapido demais.',
};

const mptSeconds: Criterion = {
  id: 'tmf',
  label: 'Tempo de fonacao',
  weight: 2,
  direction: 'higher',
  bad: 6, good: 20,
  extract: (m) => m.mpt?.seconds ?? null,
  advice: 'Sustentacao curta. Trabalhe a respiracao costodiafragmatica antes de tentar aumentar o tempo.',
  praise: 'Otimo tempo de sustentacao.',
};

const mptStability: Criterion = {
  id: 'estabilidade',
  label: 'Estabilidade do tom',
  weight: 1,
  direction: 'lower',
  bad: 2.5, good: 0.6,           // desvio de f0 em semitons durante a sustentacao
  extract: (m) => m.mpt?.f0SdSemitones ?? null,
  advice: 'O tom oscilou durante a sustentacao. Mire um som unico e continuo, sem procurar a nota.',
};

const mptSupport: Criterion = {
  id: 'apoio',
  label: 'Apoio',
  weight: 1.2,
  direction: 'lower',
  bad: 12, good: 3,              // queda de dB entre o primeiro e o ultimo terco
  extract: (m) => m.mpt?.decayDb ?? null,
  advice: 'O volume caiu bastante no fim — o ar acabou antes do som. Pare a sustentacao um pouco antes do limite.',
  praise: 'Volume manteve-se firme ate o fim.',
};

const ddkRate: Criterion = {
  id: 'velocidade',
  label: 'Velocidade',
  weight: 1,
  direction: 'higher',
  bad: 3.0, good: 6.0,           // silabas/s
  extract: (m) => m.ddk?.syllPerSec ?? null,
  advice: 'Velocidade abaixo do esperado. Ganhe regularidade primeiro; velocidade vem depois, sozinha.',
};

const ddkRegularity: Criterion = {
  id: 'regularidade',
  label: 'Regularidade',
  weight: 2,                     // pesa o dobro: e a metrica que revela travamento
  direction: 'lower',
  bad: 30, good: 8,              // coeficiente de variacao, %
  extract: (m) => (m.ddk && m.ddk.count >= 6 ? m.ddk.cvPercent : null),
  advice: 'O ritmo saiu irregular — algumas silabas travaram. Reduza a velocidade ate a serie ficar perfeitamente regular.',
  praise: 'Serie muito regular. E este o objetivo do exercicio, mais que a velocidade.',
};

const clarity: Criterion = {
  id: 'clareza',
  label: 'Clareza do sinal',
  weight: 0.5,
  direction: 'higher',
  bad: 12, good: 25,             // SNR em dB
  extract: (m) => m.intensity.snrDb,
  advice: 'Sinal proximo do ruido de fundo. Chegue mais perto do microfone ou grave num lugar mais silencioso.',
};

// --------------------------------------------------------------- rubricas

export const RUBRICS: Record<RubricId, Rubric> = {
  tmf: {
    id: 'tmf',
    criteria: [mptSeconds, mptSupport, mptStability, clarity],
  },
  ddk: {
    id: 'ddk',
    criteria: [ddkRegularity, ddkRate, clarity],
  },
  'articulacao-basica': {
    id: 'articulacao-basica',
    criteria: [fluency, articulationRate, clarity],
  },
  'leitura-fluente': {
    id: 'leitura-fluente',
    criteria: [articulationRate, fluency, pitchVariation, clarity],
  },
  prosodia: {
    id: 'prosodia',
    criteria: [pitchVariation, intensityVariation, pauseUse, articulationRate, clarity],
  },
  improviso: {
    id: 'improviso',
    criteria: [filledPauses, pauseUse, articulationRate, pitchVariation, fluency],
  },
  guiado: {
    id: 'guiado',
    criteria: [],
  },
};

export function getRubric(id: RubricId): Rubric {
  return RUBRICS[id];
}
