/**
 * Problemas de fala: o que são, como reconhecer e o que treinar.
 *
 * Esta é a porta de entrada do app. A organização anterior era por técnica
 * (motricidade, agilidade, articulação...), que é como um fonoaudiólogo pensa —
 * não como alguém que chega ao app pensa. Quem chega pensa "eu troco o R".
 *
 * Regra de escrita para tudo que aparece aqui: o nome técnico aparece uma vez,
 * porque é útil saber como se chama, e todo o resto é português comum. Se uma
 * frase precisa de dicionário, ela está errada.
 */

import type { Track } from './types.ts';

export interface ConditionExample {
  /** Como a palavra deveria sair. */
  correct: string;
  /** Como costuma sair. */
  wrong: string;
}

export interface Condition {
  id: string;
  /** Como o app chama, em linguagem do dia a dia. É o título na tela. */
  plainName: string;
  /** Nome técnico. Aparece pequeno, como subtítulo. */
  clinicalName: string;
  /** Grupo maior a que pertence. */
  family: string;
  /** Uma linha, na lista. */
  summary: string;
  /** Explicação em parágrafos curtos. */
  explanation: string[];
  examples: ConditionExample[];
  /** Como saber se é o seu caso. */
  signs: string[];
  /** O que o treino resolve — e o que não resolve. */
  whatTrainingDoes: string;
  /** Quando procurar alguém de verdade. */
  seeProfessional: string;
  /** Trilhas de exercício que atendem este problema, em ordem de prioridade. */
  tracks: Track[];
}

export const CONDITIONS: Condition[] = [
  {
    id: 'rotacismo',
    plainName: 'Troca ou sumiço do R',
    clinicalName: 'Rotacismo',
    family: 'Dislalia',
    summary: 'O R sai errado, arrastado, ou some da palavra.',
    explanation: [
      'Dislalia é o nome geral para trocar, sumir com ou distorcer sons na fala. Quando isso acontece com o R, chama-se rotacismo.',
      'O R do português tem dois sons diferentes, e são eles que costumam dar trabalho. O R de "caro" é um toque rápido da ponta da língua no céu da boca. O R de "carro" é aquele som forte, mais para o fundo da garganta.',
      'A dificuldade quase sempre está no R de toque, principalmente quando ele vem grudado em outra consoante: tr, gr, pr, br, cr, dr, fr, vr. É aí que a língua precisa fazer duas coisas muito rápido, uma atrás da outra — e ela escorrega.',
    ],
    examples: [
      { correct: 'grande', wrong: 'gande' },
      { correct: 'prato', wrong: 'pato' },
      { correct: 'três', wrong: 'tês' },
      { correct: 'livro', wrong: 'livo' },
      { correct: 'brincar', wrong: 'bincar' },
    ],
    signs: [
      'O R some quando vem junto de outra letra: "gande" no lugar de "grande".',
      'Aparece uma vogal extra no meio, para dar tempo à língua: "guarande", "pirato".',
      'O R sai arrastado, parecido com o inglês, em vez de um toque rápido.',
      'Você troca a palavra por um sinônimo só para não precisar falar aquele R.',
      'A palavra sai certa devagar, mas erra quando você fala no ritmo normal.',
    ],
    whatTrainingDoes:
      'O treino serve para automatizar o movimento: fazer a língua acertar sem você precisar pensar. Funciona bem quando o problema é de coordenação e hábito, que é o caso mais comum em adulto. Comece devagar e só acelere quando sair certo — pressa aqui é o erro clássico de quem treina sozinho.',
    seeProfessional:
      'Se a ponta da língua não consegue subir até o céu da boca de jeito nenhum, ou se a língua tem forma de coração ao ser esticada, pode ser freio de língua curto. Isso é anatomia, não hábito, e nenhum exercício resolve. Um fonoaudiólogo avalia em uma consulta.',
    tracks: ['articulacao', 'motricidade', 'ddk'],
  },

  {
    id: 'sigmatismo',
    plainName: 'Ceceio: o S com a língua entre os dentes',
    clinicalName: 'Sigmatismo',
    family: 'Dislalia',
    summary: 'O S escapa pelos lados ou sai com a língua entre os dentes.',
    explanation: [
      'É a mesma família do problema do R — uma dislalia —, mas agora com os sons de S e Z.',
      'O que acontece: a língua vai longe demais para a frente e encosta ou passa entre os dentes. O S deixa de ser um assobio limpo e vira um som soprado, meio "th".',
      'Também acontece de o ar escapar pelos cantos da boca em vez de sair pelo meio. Aí o S sai molhado, arrastado.',
    ],
    examples: [
      { correct: 'sapo', wrong: 'thapo' },
      { correct: 'passo', wrong: 'patho' },
      { correct: 'doze', wrong: 'dothe' },
    ],
    signs: [
      'Dá para ver a ponta da língua aparecendo quando você fala S.',
      'O S sai soprado ou molhado, em vez de um assobio fino.',
      'O ar escapa pelos lados da boca.',
      'Palavras com muitos S seguidos ficam difíceis de entender.',
    ],
    whatTrainingDoes:
      'O trabalho é ensinar a língua a ficar atrás dos dentes e canalizar o ar pelo meio. Os exercícios de língua e de agilidade ajudam; o app ainda não tem uma trilha específica de S, então use estes como base.',
    seeProfessional:
      'Se a mordida for aberta (os dentes da frente não se encontram ao fechar a boca), a língua não tem onde se apoiar. Isso é questão de dentista ou ortodontista, e o treino sozinho não vai longe.',
    tracks: ['motricidade', 'ddk', 'oratoria'],
  },

  {
    id: 'fala-embolada',
    plainName: 'Fala rápida e embolada',
    clinicalName: 'Taquilalia',
    family: 'Ritmo da fala',
    summary: 'Você fala rápido demais e as palavras se atropelam.',
    explanation: [
      'Aqui os sons não estão errados: o problema é a velocidade. A boca corre mais do que consegue articular, e as sílabas se encavalam.',
      'Costuma vir junto com nervosismo e com falta de pausas. Quem fala assim quase não respira no meio da frase, e isso piora tudo: sem ar, a fala acelera ainda mais para terminar antes de acabar o fôlego.',
      'Uma faixa confortável para quem escuta fica entre 4 e 6 sílabas por segundo. O app mede isso a cada gravação.',
    ],
    examples: [
      { correct: 'para você entender', wrong: 'pacêntendê' },
      { correct: 'não é bem assim', wrong: 'nãébenassim' },
    ],
    signs: [
      'Pedem para você repetir com frequência.',
      'Você chega ao fim da frase sem ar.',
      'Suas frases quase não têm pausa entre elas.',
      'Gravando e ouvindo depois, você mesmo perde palavras.',
    ],
    whatTrainingDoes:
      'Duas frentes: fôlego, para você ter ar sobrando e não precisar correr; e pausas, para dar ao ouvinte tempo de acompanhar. É o tipo de coisa que melhora rápido, porque depende mais de consciência do que de músculo.',
    seeProfessional:
      'Se além de rápida a fala trava, repete sílabas ou emperra em sons, aí é outra coisa e vale avaliar.',
    tracks: ['respiracao', 'oratoria', 'ddk'],
  },

  {
    id: 'voz-fraca',
    plainName: 'Voz fraca, sem firmeza',
    clinicalName: 'Baixa projeção vocal',
    family: 'Voz',
    summary: 'Sua voz não alcança, some no fim da frase ou cansa rápido.',
    explanation: [
      'Projetar a voz não é gritar. É apoiar o som no ar que sai dos pulmões, de forma constante.',
      'Quem não apoia começa a frase bem e termina fraco, porque o ar acabou antes das palavras. Com o tempo, a garganta força para compensar e a voz cansa.',
      'O sinal mais claro disso é o fôlego: quanto tempo você segura um "aaaa" sem deixar cair. O app mede isso.',
    ],
    examples: [
      { correct: 'frase inteira com o mesmo volume', wrong: 'começo forte, fim sumindo' },
    ],
    signs: [
      'Pedem para você falar mais alto.',
      'O fim das frases sai mais fraco que o começo.',
      'A garganta arranha ou cansa depois de falar bastante.',
      'Em lugar com barulho, ninguém te escuta.',
    ],
    whatTrainingDoes:
      'Respiração pelo diafragma e sustentação de som. É a base de tudo em voz, e é onde o progresso aparece mais claro nos números — dá para ver o fôlego crescendo de semana em semana.',
    seeProfessional:
      'Rouquidão que dura mais de duas ou três semanas sem gripe merece consulta. Isso não é treino, é avaliação.',
    tracks: ['respiracao', 'oratoria'],
  },

  {
    id: 'travamento',
    plainName: 'Travar no começo das palavras',
    clinicalName: 'Disfluência',
    family: 'Ritmo da fala',
    summary: 'A palavra engasga na saída, ou a primeira sílaba se repete.',
    explanation: [
      'É diferente de trocar sons. Aqui você sabe exatamente o que quer falar, mas a palavra não sai — ou sai repetindo o começo.',
      'Costuma piorar com pressa, nervosismo e telefone, e melhorar quando você canta ou fala sozinho.',
      'Importante separar: travar por causa de um som difícil (o R, por exemplo) é outra história, e o treino do R resolve. Travar em qualquer palavra, independente do som, é disfluência.',
    ],
    examples: [
      { correct: 'quero falar', wrong: 'que-que-quero falar' },
      { correct: 'bom dia', wrong: '...(pausa travada)... bom dia' },
    ],
    signs: [
      'Repetição do primeiro som ou da primeira sílaba.',
      'A palavra fica presa e sai com esforço.',
      'Você troca palavras no meio da frase para desviar das difíceis.',
      'Piora ao telefone ou falando com desconhecidos.',
    ],
    whatTrainingDoes:
      'O app ajuda na parte de ritmo e respiração, que reduz a pressão sobre a fala. Mas seja franco consigo: disfluência tem terapia própria, com técnicas específicas, e um app não substitui isso.',
    seeProfessional:
      'Se o travamento atrapalha seu trabalho ou sua vida social, procure um fonoaudiólogo. Esse é o caso em que a ajuda profissional faz mais diferença, e mais rápido.',
    tracks: ['respiracao', 'oratoria', 'ddk'],
  },
];

export function getCondition(id: string): Condition | undefined {
  return CONDITIONS.find((c) => c.id === id);
}

/** Problema padrão do app. */
export const DEFAULT_CONDITION = 'rotacismo';
