/** Tipos do catalogo de exercicios. */

export type Track =
  | 'motricidade'   // mobilidade e forca da lingua
  | 'ddk'           // diadococinesia — agilidade e regularidade
  | 'articulacao'   // o tepe /r/, em progressao
  | 'respiracao'    // apoio respiratorio
  | 'oratoria';     // projecao, prosodia, estrutura

export type ExerciseKind =
  | 'sustentacao'   // /a/ ou /s/ sustentado -> TMF
  | 'ddk'           // repeticao rapida -> taxa e regularidade
  | 'repeticao'     // silabas/palavras isoladas
  | 'par-minimo'    // contraste com/sem o alvo
  | 'leitura'       // frase ou texto lido
  | 'trava-lingua'  // leitura cronometrada
  | 'improviso'     // fala espontanea
  | 'motricidade'   // exercicio motor, com ou sem som
  | 'respiracao';   // guiado por tempo, sem scoring acustico

/** Qual rubrica de pontuacao se aplica (ver src/scoring/rubrics.ts). */
export type RubricId =
  | 'tmf'
  | 'ddk'
  | 'articulacao-basica'
  | 'leitura-fluente'
  | 'prosodia'
  | 'improviso'
  | 'guiado';

export interface Exercise {
  id: string;
  track: Track;
  kind: ExerciseKind;
  /** 1..10 dentro da trilha. A trilha de articulacao usa os 10 niveis do DESIGN.md. */
  level: number;
  title: string;
  /** O que aparece grande na tela — o texto a ler ou a instrucao a seguir. */
  prompt: string;
  /** Instrucao curta de como executar. Fica abaixo do prompt. */
  hint?: string;
  /** Texto passado ao speechSynthesis. Default: `prompt`. */
  modelText?: string;
  rubric: RubricId;
  /** Duracao alvo/limite em segundos. */
  durationSec?: number;
  /** Fonemas-alvo em IPA, para a Fase 3 e para os textos de feedback. */
  targetPhonemes?: string[];
  targetContext?: 'onset-cluster' | 'coda' | 'intervocalico';
  /** Nao pontua acusticamente — so registra que foi feito. */
  selfReport?: boolean;
  tags?: string[];
}

export interface TrackInfo {
  id: Track;
  name: string;
  description: string;
  maxLevel: number;
}
