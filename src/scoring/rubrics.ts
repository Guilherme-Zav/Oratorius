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
  advice: 'A velocidade saiu fora da faixa boa de escuta. Rápido demais embola as palavras; devagar demais cansa. Mire o ritmo de uma conversa tranquila.',
  praise: 'Velocidade boa: dá para acompanhar sem esforço.',
};

const pitchVariation: Criterion = {
  id: 'entonacao',
  label: 'Tom de voz',
  weight: 1,
  direction: 'higher',
  bad: 1.0, good: 3.0,           // desvio do contorno em semitons
  extract: (m) => (m.f0.voicedRatio > 0.25 ? m.f0.sdSemitones : null),
  advice: 'A voz ficou no mesmo tom do começo ao fim, e isso soa monótono. Suba um pouco no início das frases e desça no fim.',
  praise: 'Boa variação de tom: a fala teve vida.',
};

const intensityVariation: Criterion = {
  id: 'dinamica',
  label: 'Variação de volume',
  weight: 0.6,
  direction: 'higher',
  bad: 2.0, good: 6.0,
  extract: (m) => (m.timing.speechSec > 1 ? m.intensity.sdDb : null),
  advice: 'O volume ficou sempre igual. Falar um pouco mais forte no que importa é o que destaca a ideia.',
};

const filledPauses: Criterion = {
  id: 'alongamentos',
  label: 'Sons esticados',
  weight: 1,
  direction: 'lower',
  bad: 12, good: 2,              // por minuto de fala
  extract: (m) => (m.timing.speechSec > 5 ? m.timing.filledPausePerMin : null),
  advice: 'Muitos "eeee" e "hmmm" no meio da fala. Troque cada um por um segundo de silêncio: soa seguro, e não inseguro.',
  praise: 'Quase nenhum "eeee". Ficou limpo.',
};

const pauseUse: Criterion = {
  id: 'pausas',
  label: 'Pausas',
  weight: 0.8,
  direction: 'window',
  bad: 0.08, good: 0.30,         // fracao do tempo total em pausa
  windowLow: 0, windowHigh: 0.55,
  extract: (m) => (m.timing.totalSec > 8 ? m.timing.pauseTotalSec / m.timing.totalSec : null),
  advice: 'Faltaram pausas: a fala saiu corrida. Um segundo de silêncio depois de uma frase importante vale mais do que falar mais alto.',
  praise: 'Bom uso das pausas.',
};

const fluency: Criterion = {
  id: 'fluencia',
  label: 'Fluência',
  weight: 1,
  direction: 'lower',
  bad: 1.5, good: 0.4,           // maior pausa interna, em segundos
  extract: (m) => (m.timing.speechSec > 2 ? m.timing.longestPauseSec : null),
  advice: 'Teve uma parada longa no meio, como se a fala tivesse travado. Comece mais devagar: quase todo travamento vem de começar rápido demais.',
};

const mptSeconds: Criterion = {
  id: 'tmf',
  label: 'Fôlego',
  weight: 2,
  direction: 'higher',
  bad: 6, good: 20,
  extract: (m) => m.mpt?.seconds ?? null,
  advice: 'O som durou pouco. Antes de tentar segurar mais tempo, treine respirar pela barriga — é de lá que vem o fôlego.',
  praise: 'Ótimo fôlego.',
};

const mptStability: Criterion = {
  id: 'estabilidade',
  label: 'Firmeza do som',
  weight: 1,
  direction: 'lower',
  bad: 2.5, good: 0.6,           // desvio de f0 em semitons durante a sustentacao
  extract: (m) => m.mpt?.f0SdSemitones ?? null,
  advice: 'O som ficou balançando de tom. Escolha um tom só e segure ele, sem ficar procurando.',
};

const mptSupport: Criterion = {
  id: 'apoio',
  label: 'Força do ar',
  weight: 1.2,
  direction: 'lower',
  bad: 12, good: 3,              // queda de dB entre o primeiro e o ultimo terco
  extract: (m) => m.mpt?.decayDb ?? null,
  advice: 'O volume caiu muito no fim: o ar acabou antes do som. Pare um pouco antes de chegar no limite.',
  praise: 'O volume se manteve firme até o fim.',
};

const ddkRate: Criterion = {
  id: 'velocidade',
  label: 'Velocidade',
  weight: 1,
  direction: 'higher',
  bad: 3.0, good: 6.0,           // silabas/s
  extract: (m) => m.ddk?.syllPerSec ?? null,
  advice: 'Deu para ir mais rápido. Mas primeiro acerte o compasso: a velocidade vem sozinha depois.',
};

const ddkRegularity: Criterion = {
  id: 'regularidade',
  label: 'Compasso',
  weight: 2,                     // pesa o dobro: e a metrica que revela travamento
  direction: 'lower',
  bad: 30, good: 8,              // coeficiente de variacao, %
  extract: (m) => (m.ddk && m.ddk.count >= 6 ? m.ddk.cvPercent : null),
  advice: 'O compasso saiu irregular: algumas sílabas travaram no caminho. Vá mais devagar até sair tudo no mesmo intervalo.',
  praise: 'Compasso bem regular. É isso que o exercício mede, mais do que a velocidade.',
};

const clarity: Criterion = {
  id: 'clareza',
  label: 'Qualidade da gravação',
  weight: 0.5,
  direction: 'higher',
  bad: 12, good: 25,             // SNR em dB
  extract: (m) => m.intensity.snrDb,
  advice: 'Tem bastante barulho de fundo junto com a sua voz. Chegue mais perto do microfone ou grave num lugar mais quieto.',
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
