/**
 * Catalogo de exercicios.
 *
 * E dado, nao logica: adicionar exercicio nao exige tocar em nenhuma funcao.
 * Fica em .ts em vez de .json so para ganhar checagem de tipos — a estrutura
 * continua sendo uma lista declarativa.
 *
 * A trilha `articulacao` segue a progressao de 10 niveis do DESIGN.md, secao 4.
 * A ordem importa mais que o volume: subir de nivel cedo demais e o erro classico
 * de quem treina sozinho, e por isso a progressao e automatica e conservadora
 * (ver src/engine/progression.ts).
 */

import type { Exercise, TrackInfo } from './types.ts';

export const TRACKS: TrackInfo[] = [
  {
    id: 'motricidade',
    name: 'Motricidade',
    description: 'Mobilidade, forca e precisao da lingua e dos labios.',
    maxLevel: 3,
  },
  {
    id: 'ddk',
    name: 'Agilidade (DDK)',
    description: 'Repeticao rapida de silabas. Mede velocidade e, sobretudo, regularidade.',
    maxLevel: 4,
  },
  {
    id: 'articulacao',
    name: 'Articulacao do R',
    description: 'Do tepe isolado ate a fala espontanea, em dez degraus.',
    maxLevel: 10,
  },
  {
    id: 'respiracao',
    name: 'Respiracao e apoio',
    description: 'A base de toda projecao vocal.',
    maxLevel: 4,
  },
  {
    id: 'oratoria',
    name: 'Oratoria',
    description: 'Projecao, prosodia, pausas e estrutura do discurso.',
    maxLevel: 6,
  },
];

export const EXERCISES: Exercise[] = [
  // ============================================================ MOTRICIDADE
  {
    id: 'mot-estalo',
    track: 'motricidade', kind: 'motricidade', level: 1,
    title: 'Estalo de lingua',
    prompt: 'Estale a lingua no ceu da boca, 20 vezes',
    hint: 'Sugue a lingua inteira contra o palato e solte de uma vez. O estalo deve ser seco e alto.',
    rubric: 'guiado', durationSec: 30, selfReport: true,
    tags: ['aquecimento'],
  },
  {
    id: 'mot-elevacao',
    track: 'motricidade', kind: 'motricidade', level: 1,
    title: 'Elevacao da ponta',
    prompt: 'Toque a ponta da lingua atras dos dentes de cima, segure 3 segundos, relaxe. 10 vezes',
    hint: 'Boca aberta, mandibula parada. So a lingua se move — se o queixo acompanha, e compensacao.',
    rubric: 'guiado', durationSec: 60, selfReport: true,
    tags: ['aquecimento', 'tepe'],
  },
  {
    id: 'mot-varredura',
    track: 'motricidade', kind: 'motricidade', level: 2,
    title: 'Varredura do palato',
    prompt: 'Deslize a ponta da lingua do ceu da boca ate a garganta e volte. 10 vezes',
    hint: 'Devagar, mantendo contato o tempo todo. Isso trabalha a extensao que o /r/ exige.',
    rubric: 'guiado', durationSec: 45, selfReport: true,
    tags: ['aquecimento'],
  },
  {
    id: 'mot-vibracao-labial',
    track: 'motricidade', kind: 'motricidade', level: 2,
    title: 'Vibracao de labios (brrr)',
    prompt: 'brrrrrrrrrr',
    hint: 'Solte o ar com os labios frouxos, como um motor. Aquece a voz sem forcar as pregas.',
    modelText: 'brrrrr',
    rubric: 'guiado', durationSec: 20,
    tags: ['aquecimento'],
  },
  {
    id: 'mot-resistencia',
    track: 'motricidade', kind: 'motricidade', level: 3,
    title: 'Resistencia contra a bochecha',
    prompt: 'Empurre a bochecha por dentro com a lingua, segure 5 segundos. 5 vezes de cada lado',
    hint: 'Forca sustentada, sem tremor. Trabalha a musculatura, nao a velocidade.',
    rubric: 'guiado', durationSec: 60, selfReport: true,
  },

  // ============================================================ DDK
  {
    id: 'ddk-pataka',
    track: 'ddk', kind: 'ddk', level: 1,
    title: 'pa-ta-ka (linha de base)',
    prompt: 'pa ta ka pa ta ka pa ta ka...',
    hint: 'O mais rapido que conseguir SEM perder a regularidade. Repita ate o tempo acabar.',
    modelText: 'pa ta ka, pa ta ka, pa ta ka',
    rubric: 'ddk', durationSec: 8,
    tags: ['linha-de-base'],
  },
  {
    id: 'ddk-la',
    track: 'ddk', kind: 'ddk', level: 1,
    title: 'la-la-la',
    prompt: 'la la la la la la la la...',
    hint: 'Isola a ponta da lingua. Se travar aqui, o problema e de mobilidade, nao de coordenacao.',
    modelText: 'la la la la la la',
    rubric: 'ddk', durationSec: 8,
  },
  {
    id: 'ddk-tada',
    track: 'ddk', kind: 'ddk', level: 2,
    title: 'ta-da-ta-da',
    prompt: 'ta da ta da ta da ta da...',
    hint: 'Alterna surda e sonora no mesmo ponto articulatorio. Exige controle fino de vozeamento.',
    modelText: 'ta da ta da ta da',
    rubric: 'ddk', durationSec: 8,
  },
  {
    id: 'ddk-pataka-ra',
    track: 'ddk', kind: 'ddk', level: 3,
    title: 'pa-ta-ka-ra',
    prompt: 'pa ta ka ra pa ta ka ra...',
    hint: 'Agora com o tepe na sequencia. E aqui que a irregularidade costuma aparecer.',
    modelText: 'pa ta ka ra, pa ta ka ra',
    rubric: 'ddk', durationSec: 8,
    targetPhonemes: ['ɾ'],
  },
  {
    id: 'ddk-tra-tre',
    track: 'ddk', kind: 'ddk', level: 4,
    title: 'tra-tre-tri',
    prompt: 'tra tre tri tra tre tri...',
    hint: 'Encontro consonantal em velocidade. O teste mais duro da trilha.',
    modelText: 'tra tre tri, tra tre tri',
    rubric: 'ddk', durationSec: 8,
    targetPhonemes: ['t', 'ɾ'], targetContext: 'onset-cluster',
  },

  // ============================================================ ARTICULACAO
  // Nivel 1 — tepe intervocalico isolado
  {
    id: 'art-l1-arara',
    track: 'articulacao', kind: 'repeticao', level: 1,
    title: 'Tepe isolado: a-r-a',
    prompt: 'ara  ere  iri  oro  uru',
    hint: 'Um toque unico e leve da ponta da lingua. Nao role, nao arraste — e um toque so.',
    modelText: 'ara, ere, iri, oro, uru',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['ɾ'], targetContext: 'intervocalico',
  },
  {
    id: 'art-l1-lento',
    track: 'articulacao', kind: 'repeticao', level: 1,
    title: 'Tepe em camera lenta',
    prompt: 'a — ra — a — ra — a — ra',
    hint: 'Bem devagar, sentindo o ponto exato onde a lingua toca. Velocidade vem depois.',
    modelText: 'a ra, a ra, a ra',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['ɾ'], targetContext: 'intervocalico',
  },

  // Nivel 2 — tepe intervocalico em palavra
  {
    id: 'art-l2-palavras',
    track: 'articulacao', kind: 'repeticao', level: 2,
    title: 'Palavras com R entre vogais',
    prompt: 'caro  pera  muro  hora  cara  duro  faca-cara',
    hint: 'Uma palavra por vez, com pausa entre elas. Prioridade e o toque limpo, nao a velocidade.',
    modelText: 'caro, pera, muro, hora, cara, duro',
    rubric: 'articulacao-basica', durationSec: 15,
    targetPhonemes: ['ɾ'], targetContext: 'intervocalico',
  },
  {
    id: 'art-l2-frase',
    track: 'articulacao', kind: 'leitura', level: 2,
    title: 'Frase com R intervocalico',
    prompt: 'A hora certa chegou para o Mario arrumar a cara.',
    modelText: 'A hora certa chegou para o Mario arrumar a cara.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetPhonemes: ['ɾ'], targetContext: 'intervocalico',
  },

  // Nivel 3 — pares minimos intervocalicos (tepe vs. vibrante)
  {
    id: 'art-l3-pares',
    track: 'articulacao', kind: 'par-minimo', level: 3,
    title: 'Caro / carro',
    prompt: 'caro — carro\nmora — morra\ncoro — corro',
    hint: 'O contraste e o objetivo. Um R = toque unico. Dois RR = fricativa forte na garganta.',
    modelText: 'caro, carro. mora, morra. coro, corro.',
    rubric: 'articulacao-basica', durationSec: 15,
    targetPhonemes: ['ɾ', 'x'], targetContext: 'intervocalico',
  },
  {
    id: 'art-l3-pares-2',
    track: 'articulacao', kind: 'par-minimo', level: 3,
    title: 'Era / erra',
    prompt: 'era — erra\nmuro — murro\npara — parra\nvara — varra',
    hint: 'Exagere a diferenca. Se voce nao ouve o contraste, o ouvinte tambem nao ouve.',
    modelText: 'era, erra. muro, murro. para, parra. vara, varra.',
    rubric: 'articulacao-basica', durationSec: 18,
    targetPhonemes: ['ɾ', 'x'], targetContext: 'intervocalico',
  },

  // Nivel 4 — encontro consonantal, silaba isolada
  {
    id: 'art-l4-pra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'pra-pre-pri-pro-pru',
    prompt: 'pra  pre  pri  pro  pru',
    hint: 'Sem vogal entre P e R. Se sair "pu-ra", o alvo virou tres silabas — desacelere.',
    modelText: 'pra, pre, pri, pro, pru',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['p', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l4-tra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'tra-tre-tri-tro-tru',
    prompt: 'tra  tre  tri  tro  tru',
    hint: 'T e R usam o mesmo ponto na boca. A lingua sai de um para o outro sem descer.',
    modelText: 'tra, tre, tri, tro, tru',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['t', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l4-gra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'gra-gre-gri-gro-gru',
    prompt: 'gra  gre  gri  gro  gru',
    hint: 'O mais dificil da serie: G e feito atras, R e feito na frente. O salto e longo.',
    modelText: 'gra, gre, gri, gro, gru',
    rubric: 'articulacao-basica', durationSec: 12,
    targetPhonemes: ['ɡ', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l4-bra-cra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'bra-bre / cra-cre / dra-dre',
    prompt: 'bra  bre  bri\ncra  cre  cri\ndra  dre  dri',
    modelText: 'bra bre bri, cra cre cri, dra dre dri',
    rubric: 'articulacao-basica', durationSec: 15,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l4-fra-vra',
    track: 'articulacao', kind: 'repeticao', level: 4,
    title: 'fra-fre / vra-vre',
    prompt: 'fra  fre  fri  fro  fru\nvra  vre  vri',
    modelText: 'fra fre fri fro fru, vra vre vri',
    rubric: 'articulacao-basica', durationSec: 15,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },

  // Nivel 5 — encontro em palavra
  {
    id: 'art-l5-palavras-pr-tr',
    track: 'articulacao', kind: 'repeticao', level: 5,
    title: 'Palavras com PR e TR',
    prompt: 'prato  preto  primo  problema  produto\ntrem  trigo  trabalho  trinta  truque',
    hint: 'Pausa entre palavras. Qualidade do encontro antes de qualquer velocidade.',
    modelText: 'prato, preto, primo, problema, produto. trem, trigo, trabalho, trinta, truque.',
    rubric: 'articulacao-basica', durationSec: 20,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l5-palavras-gr-cr',
    track: 'articulacao', kind: 'repeticao', level: 5,
    title: 'Palavras com GR e CR',
    prompt: 'grande  grupo  grama  grito  gravata\ncravo  cresce  crianca  criar  cristal',
    modelText: 'grande, grupo, grama, grito, gravata. cravo, cresce, crianca, criar, cristal.',
    rubric: 'articulacao-basica', durationSec: 20,
    targetPhonemes: ['ɡ', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l5-palavras-br-dr-fr-vr',
    track: 'articulacao', kind: 'repeticao', level: 5,
    title: 'Palavras com BR, DR, FR e VR',
    prompt: 'braco  brilho  brasa  breve\ndrible  drama  dragao\nfruta  frente  frio\nvidro  livro  palavra',
    modelText: 'braco, brilho, brasa, breve. drible, drama, dragao. fruta, frente, frio. vidro, livro, palavra.',
    rubric: 'articulacao-basica', durationSec: 25,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },

  // Nivel 6 — pares minimos de encontro: a cacada a omissao
  {
    id: 'art-l6-pares-p',
    track: 'articulacao', kind: 'par-minimo', level: 6,
    title: 'Prato / pato',
    prompt: 'prato — pato\nprego — pego\npreso — peso\nprata — pata',
    hint: 'Este e o exercicio mais importante do app. Se as duas palavras soarem iguais, o R sumiu.',
    modelText: 'prato, pato. prego, pego. preso, peso. prata, pata.',
    rubric: 'articulacao-basica', durationSec: 20,
    targetPhonemes: ['p', 'ɾ'], targetContext: 'onset-cluster',
    tags: ['linha-de-base'],
  },
  {
    id: 'art-l6-pares-t-c',
    track: 'articulacao', kind: 'par-minimo', level: 6,
    title: 'Trem / tem — cravo / cavo',
    prompt: 'trem — tem\ntrato — tato\ntrapo — tapo\ncravo — cavo',
    modelText: 'trem, tem. trato, tato. trapo, tapo. cravo, cavo.',
    rubric: 'articulacao-basica', durationSec: 20,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l6-pares-g-b-d',
    track: 'articulacao', kind: 'par-minimo', level: 6,
    title: 'Grama / gama — braco / baco',
    prompt: 'grama — gama\ngrato — gato\nbraco — baco\nbroca — boca\ndrama — dama',
    modelText: 'grama, gama. grato, gato. braco, baco. broca, boca. drama, dama.',
    rubric: 'articulacao-basica', durationSec: 22,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },

  // Nivel 7 — encontro em frase
  {
    id: 'art-l7-frase-1',
    track: 'articulacao', kind: 'leitura', level: 7,
    title: 'Frase com encontros',
    prompt: 'O trem grande trouxe tres presentes para o primo.',
    modelText: 'O trem grande trouxe tres presentes para o primo.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l7-frase-2',
    track: 'articulacao', kind: 'leitura', level: 7,
    title: 'Frase com GR e CR',
    prompt: 'A crianca gritou de alegria quando viu o grande cravo brilhando na grama.',
    modelText: 'A crianca gritou de alegria quando viu o grande cravo brilhando na grama.',
    rubric: 'leitura-fluente', durationSec: 15,
    targetPhonemes: ['ɡ', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l7-frase-3',
    track: 'articulacao', kind: 'leitura', level: 7,
    title: 'Frase densa em R',
    prompt: 'Preciso providenciar tres livros pretos para a professora prometida.',
    modelText: 'Preciso providenciar tres livros pretos para a professora prometida.',
    rubric: 'leitura-fluente', durationSec: 15,
    targetPhonemes: ['ɾ'], targetContext: 'onset-cluster',
  },

  // Nivel 8 — trava-linguas cronometrados
  {
    id: 'art-l8-tigres',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'Tres tigres tristes',
    prompt: 'Tres pratos de trigo para tres tigres tristes.',
    hint: 'Comece devagar e limpo. Velocidade sem precisao nao treina nada — reforca o erro.',
    modelText: 'Tres pratos de trigo para tres tigres tristes.',
    rubric: 'leitura-fluente', durationSec: 15,
    targetPhonemes: ['t', 'ɾ'], targetContext: 'onset-cluster',
    tags: ['linha-de-base'],
  },
  {
    id: 'art-l8-rato',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'O rato roeu',
    prompt: 'O rato roeu a roupa do rei de Roma.',
    modelText: 'O rato roeu a roupa do rei de Roma.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetPhonemes: ['x'],
  },
  {
    id: 'art-l8-pedro',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'Pedro pregou',
    prompt: 'Pedro pregou um prego na porta preta.',
    modelText: 'Pedro pregou um prego na porta preta.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetPhonemes: ['p', 'ɾ'], targetContext: 'onset-cluster',
  },
  {
    id: 'art-l8-aranha',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'A aranha arranha a ra',
    prompt: 'A aranha arranha a ra. A ra arranha a aranha.',
    hint: 'Contraste tepe e vibrante em velocidade — o teste mais fino do nivel.',
    modelText: 'A aranha arranha a ra. A ra arranha a aranha.',
    rubric: 'leitura-fluente', durationSec: 15,
    targetPhonemes: ['ɾ', 'x'],
  },
  {
    id: 'art-l8-trigemeos',
    track: 'articulacao', kind: 'trava-lingua', level: 8,
    title: 'Trinta e tres trigemeos',
    prompt: 'Trinta e tres trigemeos entraram em trote, trotaram trinta e tres trigemeos.',
    modelText: 'Trinta e tres trigemeos entraram em trote.',
    rubric: 'leitura-fluente', durationSec: 18,
    targetPhonemes: ['t', 'ɾ'], targetContext: 'onset-cluster',
  },

  // Nivel 9 — R em coda (respeita o sotaque, ver ADR-002)
  {
    id: 'art-l9-coda',
    track: 'articulacao', kind: 'repeticao', level: 9,
    title: 'R no fim da silaba',
    prompt: 'porta  carta  verde  sorte  perto  forte  curto',
    hint: 'Aqui NAO existe um som "certo" unico: a realizacao varia por regiao. O app usa o alvo que voce escolheu em Ajustes.',
    modelText: 'porta, carta, verde, sorte, perto, forte, curto',
    rubric: 'articulacao-basica', durationSec: 18,
    targetContext: 'coda',
  },
  {
    id: 'art-l9-coda-frase',
    track: 'articulacao', kind: 'leitura', level: 9,
    title: 'Coda em frase',
    prompt: 'Por sorte a porta forte do quarto estava aberta.',
    modelText: 'Por sorte a porta forte do quarto estava aberta.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetContext: 'coda',
  },
  {
    id: 'art-l9-infinitivo',
    track: 'articulacao', kind: 'leitura', level: 9,
    title: 'Infinitivos',
    prompt: 'Preciso falar, escrever, produzir, trabalhar e prosperar.',
    hint: 'O R final de infinitivo e o que mais some na fala rapida. Marque cada um.',
    modelText: 'Preciso falar, escrever, produzir, trabalhar e prosperar.',
    rubric: 'leitura-fluente', durationSec: 12,
    targetContext: 'coda',
  },

  // Nivel 10 — fala espontanea com densidade alta de roticos
  {
    id: 'art-l10-improviso',
    track: 'articulacao', kind: 'improviso', level: 10,
    title: 'Improviso com R',
    prompt: 'Fale 60 segundos sobre: "o problema mais grave do trabalho remoto"',
    hint: 'Tema escolhido pela densidade de R. Nao leia — improvise. O alvo e manter a articulacao sob carga cognitiva.',
    rubric: 'improviso', durationSec: 60,
    targetPhonemes: ['ɾ'],
  },
  {
    id: 'art-l10-improviso-2',
    track: 'articulacao', kind: 'improviso', level: 10,
    title: 'Improviso: prioridades',
    prompt: 'Fale 60 segundos sobre: "tres prioridades para os proximos tres anos"',
    rubric: 'improviso', durationSec: 60,
    targetPhonemes: ['ɾ'],
  },

  // ============================================================ RESPIRACAO
  {
    id: 'resp-diafragma',
    track: 'respiracao', kind: 'respiracao', level: 1,
    title: 'Respiracao costodiafragmatica',
    prompt: 'Inspire em 4 — segure 4 — expire em 8. Repita 5 vezes',
    hint: 'Mao na barriga: ela sobe na inspiracao. Se so o peito sobe, a respiracao esta alta demais.',
    rubric: 'guiado', durationSec: 80, selfReport: true,
    tags: ['aquecimento'],
  },
  {
    id: 'resp-tmf-a',
    track: 'respiracao', kind: 'sustentacao', level: 2,
    title: 'TMF — sustentar /a/',
    prompt: 'aaaaaaaaaaaaaaaaaaaa',
    hint: 'Inspire fundo e sustente o /a/ o maximo que conseguir, em volume constante. Nao force o fim.',
    modelText: 'a',
    rubric: 'tmf', durationSec: 30,
    tags: ['linha-de-base'],
  },
  {
    id: 'resp-tmf-s',
    track: 'respiracao', kind: 'sustentacao', level: 2,
    title: 'Sustentar /s/',
    prompt: 'ssssssssssssssssssss',
    hint: 'So ar, sem voz. Comparar /s/ com /a/ mostra se o problema e de folego ou de pregas vocais.',
    rubric: 'tmf', durationSec: 30,
  },
  {
    id: 'resp-contagem',
    track: 'respiracao', kind: 'leitura', level: 3,
    title: 'Contar numa expiracao',
    prompt: 'Conte de 1 ate onde o ar permitir, em volume constante',
    hint: 'Sem acelerar no fim. Acelerar e o sinal de que o apoio acabou.',
    rubric: 'leitura-fluente', durationSec: 30,
  },
  {
    id: 'resp-frase-longa',
    track: 'respiracao', kind: 'leitura', level: 4,
    title: 'Frase longa numa respiracao',
    prompt: 'Quando o trabalho parece grande demais, o proximo passo pequeno e sempre a resposta certa, porque o progresso real nunca vem de um salto, e sim da repeticao paciente.',
    hint: 'Uma unica respiracao, do inicio ao fim, sem perder volume.',
    rubric: 'leitura-fluente', durationSec: 25,
  },

  // ============================================================ ORATORIA
  {
    id: 'ora-humming',
    track: 'oratoria', kind: 'sustentacao', level: 1,
    title: 'Ressonancia (humming)',
    prompt: 'mmmmmmmmmmmmmmm',
    hint: 'Boca fechada, sinta a vibracao no rosto. Aquece a voz e treina projecao sem esforco de garganta.',
    rubric: 'tmf', durationSec: 20,
    tags: ['aquecimento'],
  },
  {
    id: 'ora-articulacao-exagerada',
    track: 'oratoria', kind: 'leitura', level: 2,
    title: 'Articulacao exagerada',
    prompt: 'A clareza da fala nao vem do volume, vem da precisao de cada consoante.',
    hint: 'Exagere MUITO cada consoante, como se estivesse ensinando a ler labios. Depois repita normal — a diferenca fica.',
    modelText: 'A clareza da fala nao vem do volume, vem da precisao de cada consoante.',
    rubric: 'leitura-fluente', durationSec: 15,
  },
  {
    id: 'ora-leitura-expressiva',
    track: 'oratoria', kind: 'leitura', level: 3,
    title: 'Leitura expressiva',
    prompt: 'Nao foi o talento que separou os dois. Foi a constancia. Um treinou quando quis; o outro treinou quando nao quis.',
    hint: 'Varie o tom. Se a curva de pitch sair reta, a fala soou monotona — e o app vai apontar.',
    modelText: 'Nao foi o talento que separou os dois. Foi a constancia.',
    rubric: 'prosodia', durationSec: 20,
    tags: ['linha-de-base'],
  },
  {
    id: 'ora-pausas',
    track: 'oratoria', kind: 'leitura', level: 4,
    title: 'Pausas intencionais',
    prompt: 'Existe uma diferenca [pausa] entre falar rapido [pausa] e falar bem. [pausa longa] A pausa e o que da peso ao que veio antes.',
    hint: 'Segure cada pausa marcada por 1 segundo inteiro. Vai parecer eterno para voce e natural para quem ouve.',
    rubric: 'prosodia', durationSec: 25,
  },
  {
    id: 'ora-projecao',
    track: 'oratoria', kind: 'leitura', level: 4,
    title: 'Projecao sem gritar',
    prompt: 'Imagine que a ultima fileira precisa ouvir cada palavra desta frase com a mesma clareza da primeira.',
    hint: 'Projete com apoio do diafragma, nao com a garganta. Se raspar, esta forcando o lugar errado.',
    rubric: 'prosodia', durationSec: 15,
  },
  {
    id: 'ora-prep',
    track: 'oratoria', kind: 'improviso', level: 5,
    title: 'Estrutura PREP',
    prompt: 'Improvise 60s usando PREP: Ponto — Razao — Exemplo — Ponto.\nTema: "vale a pena aprender em publico"',
    hint: 'A estrutura e a muleta que substitui o "ééé". Saber para onde vai elimina a hesitacao.',
    rubric: 'improviso', durationSec: 60,
  },
  {
    id: 'ora-storytelling',
    track: 'oratoria', kind: 'improviso', level: 5,
    title: 'Historia em 90 segundos',
    prompt: 'Conte uma historia real sua em 90s: situacao, obstaculo, virada, licao.',
    rubric: 'improviso', durationSec: 90,
  },
  {
    id: 'ora-improviso-livre',
    track: 'oratoria', kind: 'improviso', level: 6,
    title: 'Improviso frio',
    prompt: 'Fale 90 segundos sobre o primeiro objeto que voce enxergar agora.',
    hint: 'Sem preparo. O objetivo e treinar a fluencia sob pressao, nao produzir um bom discurso.',
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

/** Exercicios da linha de base diaria — sempre os mesmos, para gerar serie comparavel. */
export function baselineExercises(): Exercise[] {
  return EXERCISES.filter((e) => e.tags?.includes('linha-de-base'));
}

export function warmupExercises(): Exercise[] {
  return EXERCISES.filter((e) => e.tags?.includes('aquecimento'));
}
