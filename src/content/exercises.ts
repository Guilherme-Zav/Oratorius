/**
 * Catálogo de exercícios.
 *
 * É dado, não lógica: adicionar exercício não exige tocar em nenhuma função.
 * Fica em .ts em vez de .json só para ganhar checagem de tipos — a estrutura
 * continua sendo uma lista declarativa.
 *
 * Regra de escrita, valendo para todo texto daqui:
 *
 *   1. Português com acento. É a língua do app.
 *   2. Nada de termo técnico no título ou no comando. "Tepe", "diadococinesia",
 *      "encontro consonantal" e "costodiafragmática" são nomes corretos e
 *      inúteis para quem só quer treinar. Viraram "R de toque", "agilidade",
 *      "R grudado em outra letra" e "respirar pela barriga".
 *   3. A dica diz O QUE FAZER, não o que está acontecendo. "A língua sai de um
 *      ponto para o outro sem descer" serve; "exige controle fino de vozeamento"
 *      não serve para nada.
 *
 * A trilha de articulação segue a progressão de dez degraus do DESIGN.md. A
 * ordem importa mais que o volume: subir cedo demais é o erro clássico de quem
 * treina sozinho, e por isso a progressão é automática e conservadora.
 */

import type { Exercise, TrackInfo } from './types.ts';

export const TRACKS: TrackInfo[] = [
  {
    id: 'motricidade',
    name: 'Aquecimento da língua',
    description: 'Solta e fortalece a língua antes do treino. Leva dois minutos.',
    maxLevel: 3,
  },
  {
    id: 'ddk',
    name: 'Agilidade',
    description: 'Repetir sílabas rápido, sem perder o compasso. Mede se a língua trava.',
    maxLevel: 4,
  },
  {
    id: 'articulacao',
    name: 'O som do R',
    description: 'De um R sozinho até a conversa solta, em dez degraus.',
    maxLevel: 10,
  },
  {
    id: 'respiracao',
    name: 'Fôlego',
    description: 'Ar sobrando é o que sustenta a voz até o fim da frase.',
    maxLevel: 4,
  },
  {
    id: 'oratoria',
    name: 'Falar bem',
    description: 'Clareza, ritmo, pausas e firmeza na hora de falar com alguém.',
    maxLevel: 6,
  },
];

export const EXERCISES: Exercise[] = [
  // ======================================================= AQUECIMENTO
  {
    id: 'mot-estalo',
    track: 'motricidade', kind: 'motricidade', level: 1,
    title: 'Estalo de língua',
    prompt: 'Estale a língua no céu da boca, 20 vezes',
    hint: 'Grude a língua inteira no céu da boca e solte de uma vez. O estalo tem que sair seco e alto.',
    rubric: 'guiado', durationSec: 30, selfReport: true,
    tags: ['aquecimento'],
  },
  {
    id: 'mot-elevacao',
    track: 'motricidade', kind: 'motricidade', level: 1,
    title: 'Levantar a ponta da língua',
    prompt: 'Encoste a ponta da língua atrás dos dentes de cima, segure 3 segundos, solte. 10 vezes',
    hint: 'Boca aberta e queixo parado. Só a língua se mexe — se o queixo ajuda, o exercício perde o efeito.',
    rubric: 'guiado', durationSec: 60, selfReport: true,
    tags: ['aquecimento', 'r'],
  },
  {
    id: 'mot-varredura',
    track: 'motricidade', kind: 'motricidade', level: 2,
    title: 'Passear pelo céu da boca',
    prompt: 'Deslize a ponta da língua do céu da boca até o fundo e volte. 10 vezes',
    hint: 'Devagar, sem tirar a língua do teto em nenhum momento. Ganha o alcance que o R precisa.',
    rubric: 'guiado', durationSec: 45, selfReport: true,
    tags: ['aquecimento'],
  },
  {
    id: 'mot-vibracao-labial',
    track: 'motricidade', kind: 'motricidade', level: 2,
    title: 'Vibrar os lábios (brrr)',
    prompt: 'brrrrrrrrrr',
    hint: 'Solte o ar com os lábios frouxos, como um motor de brinquedo. Aquece a voz sem forçar a garganta.',
    modelText: 'brrrrr',
    rubric: 'guiado', durationSec: 20,
    tags: ['aquecimento'],
  },
  {
    id: 'mot-resistencia',
    track: 'motricidade', kind: 'motricidade', level: 3,
    title: 'Empurrar a bochecha',
    prompt: 'Empurre a bochecha por dentro com a língua e segure 5 segundos. 5 vezes de cada lado',
    hint: 'Força firme e parada, sem tremer. Aqui é força, não velocidade.',
    rubric: 'guiado', durationSec: 60, selfReport: true,
  },

  // ======================================================= AGILIDADE
  {
    id: 'ddk-pataka',
    track: 'ddk', kind: 'ddk', level: 1,
    title: 'pa-ta-ka',
    prompt: 'pa ta ka pa ta ka pa ta ka...',
    hint: 'O mais rápido que der, mas SEM perder o compasso. Este exercício é o mesmo todo dia: é ele que mostra sua evolução.',
    modelText: 'pa ta ka, pa ta ka, pa ta ka',
    rubric: 'ddk', durationSec: 8,
    tags: ['linha-de-base'],
  },
  {
    id: 'ddk-la',
    track: 'ddk', kind: 'ddk', level: 1,
    title: 'la-la-la',
    prompt: 'la la la la la la la la...',
    hint: 'Só a ponta da língua trabalha. Se travar já aqui, faça o aquecimento antes.',
    modelText: 'la la la la la la',
    rubric: 'ddk', durationSec: 8,
  },
  {
    id: 'ddk-tada',
    track: 'ddk', kind: 'ddk', level: 2,
    title: 'ta-da-ta-da',
    prompt: 'ta da ta da ta da ta da...',
    hint: 'A língua fica no mesmo lugar; o que muda é a voz ligar ou não. Mantenha o ritmo igual.',
    modelText: 'ta da ta da ta da',
    rubric: 'ddk', durationSec: 8,
  },
  {
    id: 'ddk-pataka-ra',
    track: 'ddk', kind: 'ddk', level: 3,
    title: 'pa-ta-ka-ra',
    prompt: 'pa ta ka ra pa ta ka ra...',
    hint: 'Agora com o R no meio. É aqui que o compasso costuma desandar — e é isso que queremos medir.',
    modelText: 'pa ta ka ra, pa ta ka ra',
    rubric: 'ddk', durationSec: 8,
    targetPhonemes: ['ɾ'],
  },
  {
    id: 'ddk-tra-tre',
    track: 'ddk', kind: 'ddk', level: 4,
    title: 'tra-tre-tri',
    prompt: 'tra tre tri tra tre tri...',
    hint: 'R grudado no T, em velocidade. O exercício mais duro desta trilha.',
    modelText: 'tra tre tri, tra tre tri',
    rubric: 'ddk', durationSec: 8,
    targetPhonemes: ['t', 'ɾ'], targetContext: 'onset-cluster',
  },

  // ======================================================= O SOM DO R
  // Degrau 1 — o R sozinho, entre vogais
  {
    id: 'art-l1-arara',
    track: 'articulacao', kind: 'repeticao', level: 1,
    title: 'O R entre vogais',
    prompt: 'ara   ere   iri   oro   uru',
    hint: 'Um toque só, leve, da ponta da língua no céu da boca. Não role e não arraste: é um toque e pronto.',
    modelText: 'ara, ere, iri, oro, uru',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['ɾ'], targetContext: 'intervocalico',
  },
  {
    id: 'art-l1-lento',
    track: 'articulacao', kind: 'repeticao', level: 1,
    title: 'O R em câmera lenta',
    prompt: 'a — ra — a — ra — a — ra',
    hint: 'Bem devagar, prestando atenção no ponto exato em que a língua encosta. A velocidade vem depois; agora não.',
    modelText: 'a ra, a ra, a ra',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['ɾ'], targetContext: 'intervocalico',
  },

  // Degrau 2 — o R entre vogais, dentro da palavra
  {
    id: 'art-l2-palavras',
    track: 'articulacao', kind: 'repeticao', level: 2,
    title: 'Palavras com R no meio',
    prompt: 'caro   pera   muro   hora   cara   duro',
    hint: 'Uma palavra de cada vez, com pausa entre elas. O que vale é o toque sair limpo, não sair rápido.',
    modelText: 'caro, pera, muro, hora, cara, duro',
    rubric: 'articulacao-basica', durationSec: 15,
    targetPhonemes: ['ɾ'], targetContext: 'intervocalico',
  },
  {
    id: 'art-l2-frase',
    track: 'articulacao', kind: 'leitura', level: 2,
    title: 'Frase com R no meio',
    prompt: 'A hora certa chegou para o Mário arrumar a cara.',
    modelText: 'A hora certa chegou para o Mário arrumar a cara.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetPhonemes: ['ɾ'], targetContext: 'intervocalico',
  },

  // Degrau 3 — um R contra dois RR
  {
    id: 'art-l3-pares',
    track: 'articulacao', kind: 'par-minimo', level: 3,
    title: 'caro / carro',
    prompt: 'caro — carro\nmora — morra\ncoro — corro',
    hint: 'A diferença é o exercício. Um R é um toque rapidinho na frente da boca. Dois RR é um som forte, lá no fundo.',
    modelText: 'caro, carro. mora, morra. coro, corro.',
    rubric: 'articulacao-basica', durationSec: 15,
    targetPhonemes: ['ɾ', 'x'], targetContext: 'intervocalico',
  },
  {
    id: 'art-l3-pares-2',
    track: 'articulacao', kind: 'par-minimo', level: 3,
    title: 'era / erra',
    prompt: 'era — erra\nmuro — murro\npara — parra\nvara — varra',
    hint: 'Exagere a diferença. Se você não ouvir as duas palavras diferentes, quem te escuta também não vai ouvir.',
    modelText: 'era, erra. muro, murro. para, parra. vara, varra.',
    rubric: 'articulacao-basica', durationSec: 18,
    targetPhonemes: ['ɾ', 'x'], targetContext: 'intervocalico',
  },

  // Degrau 4 — o R grudado em outra letra, em sílaba solta
  {
    id: 'art-l4-pra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'pra-pre-pri-pro-pru',
    hint: 'Nada de vogal entre o P e o R. Se sair "pu-ra", virou palavra de três pedaços: vá mais devagar.',
    prompt: 'pra   pre   pri   pro   pru',
    modelText: 'pra, pre, pri, pro, pru',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['p', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l4-tra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'tra-tre-tri-tro-tru',
    prompt: 'tra   tre   tri   tro   tru',
    hint: 'O T e o R nascem quase no mesmo lugar. A língua vai de um para o outro sem descer no caminho.',
    modelText: 'tra, tre, tri, tro, tru',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['t', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l4-gra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'gra-gre-gri-gro-gru',
    prompt: 'gra   gre   gri   gro   gru',
    hint: 'O mais difícil do degrau: o G nasce lá atrás e o R lá na frente. O salto é grande, então comece lento.',
    modelText: 'gra, gre, gri, gro, gru',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['ɡ', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l4-bra-cra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'bra / cra / dra',
    prompt: 'bra   bre   bri\ncra   cre   cri\ndra   dre   dri',
    hint: 'Uma linha de cada vez, com pausa entre elas.',
    modelText: 'bra bre bri, cra cre cri, dra dre dri',
    rubric: 'articulacao-basica', durationSec: 15,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l4-fra-vra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'fra / vra',
    prompt: 'fra   fre   fri   fro   fru\nvra   vre   vri',
    hint: 'Aqui o ar já está saindo quando o R chega. Não interrompa o sopro no meio.',
    modelText: 'fra fre fri fro fru, vra vre vri',
    rubric: 'articulacao-basica', durationSec: 15,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },

  // Degrau 5 — o R grudado, dentro da palavra
  {
    id: 'art-l5-palavras-pr-tr',
    track: 'articulacao', kind: 'repeticao', level: 5,
    title: 'Palavras com PR e TR',
    prompt: 'prato   preto   primo   problema   produto\ntrem   trigo   trabalho   trinta   truque',
    hint: 'Pausa entre as palavras. O R sair inteiro vale mais do que terminar a lista rápido.',
    modelText: 'prato, preto, primo, problema, produto. trem, trigo, trabalho, trinta, truque.',
    rubric: 'articulacao-basica', durationSec: 20,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l5-palavras-gr-cr',
    track: 'articulacao', kind: 'repeticao', level: 5,
    title: 'Palavras com GR e CR',
    prompt: 'grande   grupo   grama   grito   gravata\ncravo   cresce   criança   criar   cristal',
    hint: 'Se "grande" sair "gande", pare e volte uma linha por vez, bem devagar.',
    modelText: 'grande, grupo, grama, grito, gravata. cravo, cresce, criança, criar, cristal.',
    rubric: 'articulacao-basica', durationSec: 20,
    targetPhonemes: ['ɡ', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l5-palavras-br-dr-fr-vr',
    track: 'articulacao', kind: 'repeticao', level: 5,
    title: 'Palavras com BR, DR, FR e VR',
    prompt: 'braço   brilho   brasa   breve\ndrible   drama   dragão\nfruta   frente   frio\nvidro   livro   palavra',
    hint: 'Quatro grupos. Respire entre um e outro.',
    modelText: 'braço, brilho, brasa, breve. drible, drama, dragão. fruta, frente, frio. vidro, livro, palavra.',
    rubric: 'articulacao-basica', durationSec: 25,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },

  // Degrau 6 — com R e sem R: a caça ao R que some
  {
    id: 'art-l6-pares-p',
    track: 'articulacao', kind: 'par-minimo', level: 6,
    title: 'prato / pato',
    prompt: 'prato — pato\nprego — pego\npreso — peso\nprata — pata',
    hint: 'Este é o exercício mais importante do app. São palavras diferentes: se as duas saírem iguais, o R sumiu.',
    modelText: 'prato, pato. prego, pego. preso, peso. prata, pata.',
    rubric: 'articulacao-basica', durationSec: 20,
    targetPhonemes: ['p', 'ɾ'], targetContext: 'onset-cluster',
    tags: ['linha-de-base'],
  },
  {
    id: 'art-l6-pares-t-c',
    track: 'articulacao', kind: 'par-minimo', level: 6,
    title: 'trem / tem — cravo / cavo',
    prompt: 'trem — tem\ntrato — tato\ntrapo — tapo\ncravo — cavo',
    hint: 'Fale as duas seguidas e escute a diferença. Se não houver diferença, desacelere.',
    modelText: 'trem, tem. trato, tato. trapo, tapo. cravo, cavo.',
    rubric: 'articulacao-basica', durationSec: 20,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l6-pares-g-b-d',
    track: 'articulacao', kind: 'par-minimo', level: 6,
    title: 'grama / gama — braço / baço',
    prompt: 'grama — gama\ngrato — gato\nbraço — baço\nbroca — boca\ndrama — dama',
    hint: 'São todas palavras de verdade, com sentidos diferentes. É esse contraste que ensina a boca.',
    modelText: 'grama, gama. grato, gato. braço, baço. broca, boca. drama, dama.',
    rubric: 'articulacao-basica', durationSec: 22,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },

  // Degrau 7 — dentro da frase
  {
    id: 'art-l7-frase-1',
    track: 'articulacao', kind: 'leitura', level: 7,
    title: 'Frase com vários R',
    prompt: 'O trem grande trouxe três presentes para o primo.',
    hint: 'Leia no ritmo de uma conversa normal, sem correr.',
    modelText: 'O trem grande trouxe três presentes para o primo.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l7-frase-2',
    track: 'articulacao', kind: 'leitura', level: 7,
    title: 'Frase com GR e CR',
    prompt: 'A criança gritou de alegria quando viu o grande cravo brilhando na grama.',
    modelText: 'A criança gritou de alegria quando viu o grande cravo brilhando na grama.',
    rubric: 'leitura-fluente', durationSec: 15,
    targetPhonemes: ['ɡ', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l7-frase-3',
    track: 'articulacao', kind: 'leitura', level: 7,
    title: 'Frase cheia de R',
    prompt: 'Preciso providenciar três livros pretos para a professora.',
    hint: 'Frase difícil de propósito. Se travar, leia em pedaços e depois junte.',
    modelText: 'Preciso providenciar três livros pretos para a professora.',
    rubric: 'leitura-fluente', durationSec: 15,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },

  // Degrau 8 — trava-línguas
  {
    id: 'art-l8-tigres',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'Três tigres tristes',
    prompt: 'Três pratos de trigo para três tigres tristes.',
    hint: 'Comece devagar e limpo. Repetir rápido e errado não treina nada: só fixa o erro.',
    modelText: 'Três pratos de trigo para três tigres tristes.',
    rubric: 'leitura-fluente', durationSec: 15,
    targetPhonemes: ['t', 'ɾ'], targetContext: 'onset-cluster',
    tags: ['linha-de-base'],
  },
  {
    id: 'art-l8-rato',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'O rato roeu',
    prompt: 'O rato roeu a roupa do rei de Roma.',
    hint: 'Aqui o R é o forte, do começo da palavra. Bem diferente do R de "caro".',
    modelText: 'O rato roeu a roupa do rei de Roma.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetPhonemes: ['x'],
  },
  {
    id: 'art-l8-pedro',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'Pedro pregou um prego',
    prompt: 'Pedro pregou um prego na porta preta.',
    modelText: 'Pedro pregou um prego na porta preta.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetPhonemes: ['p', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l8-aranha',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'A aranha arranha a rã',
    prompt: 'A aranha arranha a rã. A rã arranha a aranha.',
    hint: 'Mistura o R de toque com o R forte, em velocidade. O teste mais fino do degrau.',
    modelText: 'A aranha arranha a rã. A rã arranha a aranha.',
    rubric: 'leitura-fluente', durationSec: 15,
    targetPhonemes: ['ɾ', 'x'],
  },
  {
    id: 'art-l8-trigemeos',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'Trinta e três trigêmeos',
    prompt: 'Trinta e três trigêmeos entraram em trote, trotaram trinta e três trigêmeos.',
    modelText: 'Trinta e três trigêmeos entraram em trote.',
    rubric: 'leitura-fluente', durationSec: 18,
    targetPhonemes: ['t', 'ɾ'], targetContext: 'onset-cluster',
  },

  // Degrau 9 — o R no fim da sílaba
  {
    id: 'art-l9-coda',
    track: 'articulacao', kind: 'repeticao', level: 9,
    title: 'R no fim da sílaba',
    prompt: 'porta   carta   verde   sorte   perto   forte   curto',
    hint: 'Este R muda de região para região, e nenhuma versão é errada. O app usa o sotaque que você escolheu em Ajustes.',
    modelText: 'porta, carta, verde, sorte, perto, forte, curto',
    rubric: 'articulacao-basica', durationSec: 18,
    targetContext: 'coda',
  },
  {
    id: 'art-l9-coda-frase',
    track: 'articulacao', kind: 'leitura', level: 9,
    title: 'R no fim, dentro da frase',
    prompt: 'Por sorte a porta forte do quarto estava aberta.',
    modelText: 'Por sorte a porta forte do quarto estava aberta.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetContext: 'coda',
  },
  {
    id: 'art-l9-infinitivo',
    track: 'articulacao', kind: 'leitura', level: 9,
    title: 'Verbos terminados em R',
    prompt: 'Preciso falar, escrever, produzir, trabalhar e prosperar.',
    hint: 'O R do fim dos verbos é o que mais some na conversa rápida. Marque cada um.',
    modelText: 'Preciso falar, escrever, produzir, trabalhar e prosperar.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetContext: 'coda',
  },

  // Degrau 10 — conversa solta
  {
    id: 'art-l10-improviso',
    track: 'articulacao', kind: 'improviso', level: 10,
    title: 'Falar solto sobre um tema',
    prompt: 'Fale 60 segundos sobre: o maior problema do trabalho remoto',
    hint: 'Tema escolhido por ter muitos R. Não leia nada: fale de cabeça. O desafio é manter o R certo enquanto você pensa no assunto.',
    rubric: 'improviso', durationSec: 60,
    targetPhonemes: ['ɾ'],
  },
  {
    id: 'art-l10-improviso-2',
    track: 'articulacao', kind: 'improviso', level: 10,
    title: 'Falar solto: prioridades',
    prompt: 'Fale 60 segundos sobre: três prioridades suas para os próximos três anos',
    hint: 'De cabeça, sem preparar antes.',
    rubric: 'improviso', durationSec: 60,
    targetPhonemes: ['ɾ'],
  },

  // ======================================================= FÔLEGO
  {
    id: 'resp-diafragma',
    track: 'respiracao', kind: 'respiracao', level: 1,
    title: 'Respirar pela barriga',
    prompt: 'Puxe o ar contando até 4 — segure contando até 4 — solte contando até 8. Repita 5 vezes',
    hint: 'Mão na barriga: ela tem que subir quando você puxa o ar. Se só o peito sobe, a respiração está alta demais.',
    rubric: 'guiado', durationSec: 80, selfReport: true,
    tags: ['aquecimento'],
  },
  {
    id: 'resp-tmf-a',
    track: 'respiracao', kind: 'sustentacao', level: 2,
    title: 'Segurar o "aaa"',
    prompt: 'aaaaaaaaaaaaaaaaaaaa',
    hint: 'Puxe bastante ar e segure o "a" o máximo que conseguir, sempre no mesmo volume. Não force no fim.',
    modelText: 'a',
    rubric: 'tmf', durationSec: 30,
    tags: ['linha-de-base'],
  },
  {
    id: 'resp-tmf-s',
    track: 'respiracao', kind: 'sustentacao', level: 2,
    title: 'Segurar o "sss"',
    prompt: 'ssssssssssssssssssss',
    hint: 'Só ar, sem voz. Se o "sss" durar bem mais que o "aaa", o fôlego está bom e o ajuste é na voz.',
    rubric: 'tmf', durationSec: 30,
  },
  {
    id: 'resp-contagem',
    track: 'respiracao', kind: 'leitura', level: 3,
    title: 'Contar sem respirar',
    prompt: 'Conte a partir do 1 até onde o ar deixar, sempre no mesmo volume',
    hint: 'Sem acelerar no fim. Acelerar é o sinal de que o ar acabou.',
    rubric: 'leitura-fluente', durationSec: 30,
  },
  {
    id: 'resp-frase-longa',
    track: 'respiracao', kind: 'leitura', level: 4,
    title: 'Frase longa numa respiração só',
    prompt: 'Quando o trabalho parece grande demais, o próximo passo pequeno é sempre a resposta certa, porque o progresso real nunca vem de um salto, e sim da repetição paciente.',
    hint: 'Do começo ao fim com um fôlego só, sem deixar o volume cair no caminho.',
    rubric: 'leitura-fluente', durationSec: 25,
  },

  // ======================================================= FALAR BEM
  {
    id: 'ora-humming',
    track: 'oratoria', kind: 'sustentacao', level: 1,
    title: 'Aquecer a voz com "mmm"',
    prompt: 'mmmmmmmmmmmmmmm',
    hint: 'Boca fechada. Você tem que sentir uma coceirinha no nariz e no rosto — é a voz ressoando no lugar certo.',
    rubric: 'tmf', durationSec: 20,
    tags: ['aquecimento'],
  },
  {
    id: 'ora-articulacao-exagerada',
    track: 'oratoria', kind: 'leitura', level: 2,
    title: 'Falar exagerando cada letra',
    prompt: 'A clareza da fala não vem do volume, vem da precisão de cada consoante.',
    hint: 'Exagere MUITO cada letra, como se alguém fosse ler seus lábios. Depois leia normal: a diferença fica.',
    modelText: 'A clareza da fala não vem do volume, vem da precisão de cada consoante.',
    rubric: 'leitura-fluente', durationSec: 15,
  },
  {
    id: 'ora-leitura-expressiva',
    track: 'oratoria', kind: 'leitura', level: 3,
    title: 'Ler com emoção',
    prompt: 'Não foi o talento que separou os dois. Foi a constância. Um treinou quando quis; o outro treinou quando não quis.',
    hint: 'Suba e desça o tom de voz de propósito. Se sair tudo no mesmo tom, o app vai avisar que ficou monótono.',
    modelText: 'Não foi o talento que separou os dois. Foi a constância.',
    rubric: 'prosodia', durationSec: 20,
    tags: ['linha-de-base'],
  },
  {
    id: 'ora-pausas',
    track: 'oratoria', kind: 'leitura', level: 4,
    title: 'Usar pausas de propósito',
    prompt: 'Existe uma diferença [pausa] entre falar rápido [pausa] e falar bem. [pausa longa] A pausa é o que dá peso ao que veio antes.',
    hint: 'Segure cada pausa marcada por 1 segundo inteiro. Vai parecer uma eternidade para você e natural para quem ouve.',
    rubric: 'prosodia', durationSec: 25,
  },
  {
    id: 'ora-projecao',
    track: 'oratoria', kind: 'leitura', level: 4,
    title: 'Falar alto sem gritar',
    prompt: 'Imagine que a última fileira precisa ouvir cada palavra desta frase com a mesma clareza da primeira.',
    hint: 'A força vem da barriga, não da garganta. Se raspar ou arranhar, você está forçando o lugar errado.',
    rubric: 'prosodia', durationSec: 15,
  },
  {
    id: 'ora-prep',
    track: 'oratoria', kind: 'improviso', level: 5,
    title: 'Responder com começo, meio e fim',
    prompt: 'Fale 60 segundos sobre "vale a pena aprender em público", nesta ordem:\n1. sua opinião\n2. o motivo\n3. um exemplo\n4. repita a opinião',
    hint: 'Seguir uma ordem pronta é o que tira o "ééé" da fala: quando você sabe para onde vai, não precisa gaguejar pensando.',
    rubric: 'improviso', durationSec: 60,
  },
  {
    id: 'ora-storytelling',
    track: 'oratoria', kind: 'improviso', level: 5,
    title: 'Contar uma história em 90 segundos',
    prompt: 'Conte uma história de verdade que aconteceu com você:\n1. como era a situação\n2. o que deu errado\n3. o que mudou\n4. o que você aprendeu',
    hint: 'História real. Inventar cansa mais e treina menos.',
    rubric: 'improviso', durationSec: 90,
  },
  {
    id: 'ora-improviso-livre',
    track: 'oratoria', kind: 'improviso', level: 6,
    title: 'Falar sem preparo nenhum',
    prompt: 'Fale 90 segundos sobre o primeiro objeto que você enxergar agora.',
    hint: 'Sem pensar antes. O objetivo não é fazer um bom discurso: é aguentar falar sob pressão sem travar.',
    rubric: 'improviso', durationSec: 90,
  },
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export function exercisesByTrack(track: string): Exercise[] {
  return EXERCISES.filter((e) => e.track === track).sort((a, b) => a.level - b.level);
}

export function exercisesAtLevel(track: string, level: number): Exercise[] {
  return EXERCISES.filter((e) => e.track === track && e.level === level);
}

/** Exercícios de soltar o corpo, para abrir a sessão. */
export function warmupExercises(): Exercise[] {
  return EXERCISES.filter((e) => e.tags?.includes('aquecimento'));
}

/**
 * Os exercícios fixos, iguais todo dia.
 *
 * São eles que tornam a evolução comparável: se o exercício muda, a comparação
 * entre segunda e sexta não quer dizer nada. É esta série que vale levar a um
 * fonoaudiólogo.
 */
export function baselineExercises(): Exercise[] {
  return EXERCISES.filter((e) => e.tags?.includes('linha-de-base'));
}

/** Exercícios ligados a um problema de fala, na ordem das trilhas dele. */
export function exercisesForTracks(tracks: readonly string[]): Exercise[] {
  return tracks.flatMap((t) => exercisesByTrack(t));
}
