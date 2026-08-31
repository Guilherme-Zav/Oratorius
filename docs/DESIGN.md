# Oratorius — Design do sistema

> App pessoal de treino de oratória e articulação, rodando localmente no iPhone 13.
> Decisões formais em [`docs/adr/`](./adr/). Este documento é a visão de conjunto.

---

## 1. Requisitos

### Funcionais

| # | Requisito | Onde é atendido |
|---|---|---|
| RF1 | Gravar pelo microfone e reproduzir | Camada de captura |
| RF2 | Avaliar se a pronúncia bateu com o alvo | ADR-002, Camadas 2 e 3 |
| RF3 | Analisar o tom da voz (pitch, volume, ritmo, pausas) | ADR-002, Camada 1 |
| RF4 | Exercícios de oratória | Trilhas `oratoria`, `respiracao` |
| RF5 | Exercícios para o travamento em `r`/`tr`/`gr` | Trilhas `articulacao`, `motricidade` |
| RF6 | Acompanhar evolução ao longo do tempo | ADR-003 + tela Progresso |
| RF7 | Interface intuitiva e funcional | Seção 5 |

### Não-funcionais

| # | Requisito | Alvo |
|---|---|---|
| RNF1 | Funciona offline | 100% após o primeiro carregamento |
| RNF2 | Feedback rápido o bastante para não quebrar o ritmo do treino | Camada 1: < 300 ms. Camada 3: < 5 s |
| RNF3 | Desenvolvível a partir de Windows 11 | Ver ADR-001 |
| RNF4 | Uma sessão de treino cabe em 10–15 min | Motor de sessão |
| RNF5 | Nenhum áudio sai do aparelho | Sem backend |
| RNF6 | Zero custo recorrente | Hospedagem estática gratuita |

### Fora de escopo (explicitamente)

Multiusuário, contas, sincronização em nuvem, App Store, diagnóstico clínico,
suporte a Android, tempo real com a tela apagada.

---

## 2. Restrições que moldaram a arquitetura

1. **Máquina de desenvolvimento é Windows.** Sem Xcode → PWA (ADR-001).
2. **iPhone 13 não roda Apple Intelligence.** Sem LLM on-device da Apple → o feedback
   textual é gerado por **regras + templates** sobre as métricas, não por um modelo
   generativo. Consequência positiva: feedback determinístico, reproduzível e auditável.
3. **ASR corrige a pronúncia.** Não serve para avaliá-la (ADR-002).
4. **O texto-alvo é conhecido na maioria dos exercícios.** Alinhamento forçado no lugar
   de reconhecimento aberto — mais simples e mais preciso.
5. **O `/r/` de coda varia legitimamente por região.** O scorer é configurável e não trata
   sotaque como erro.

---

## 2.1 Status da implementação

**Fases 0 e 1 construídas.** 68 testes passando, build limpo, app verificado
ponta a ponta no navegador.

| Camada (ADR-002) | Estado |
|---|---|
| **Camada 1 — DSP determinístico** | ✅ completa: f0 (YIN), intensidade, VAD, sílabas, pausas, alongamentos, jitter/shimmer/HNR, DDK, TMF |
| **Camada 2 — alinhamento forçado** | ⬜ não iniciada (Fase 2) |
| **Camada 3 — fonemas + GOP** | ⬜ não iniciada (Fase 3, precede-a a Fase 0.5) |

Três decisões que só apareceram ao construir:

1. **Stack sem dependências** ([ADR-004](./adr/ADR-004-stack-sem-dependencias.md)) —
   o Windows deste ambiente bloqueia binários nativos, o que derruba Vite, esbuild
   e o TypeScript 7. O app passou a ter zero dependências de runtime.
2. **Análise em Web Worker.** Um improviso de 90 s leva vários segundos de DSP.
   Na thread principal isso congelaria a tela inteira. Medido no navegador: a
   sobreposição real entre worker e main thread dá 1,56x — é paralelismo de
   verdade, não uma promessa adiada.
3. **Passo temporal adaptativo.** Acima de 20 s, o rastreamento de f0 cai de 10 ms
   para 20 ms de passo. As métricas de fala longa (variação de tom, ritmo,
   alongamentos) são estatísticas sobre a gravação inteira — 50 pontos/s dizem o
   mesmo que 100 e custam metade. Exercícios curtos e **DDK** mantêm 10 ms: a
   regularidade do DDK depende da resolução temporal. Há teste travando que
   gravação curta e longa concordam nas métricas.

Uma correção de falso positivo que veio do teste ponta a ponta: numa série lenta
de tepes (`a — ra — a — ra`), vogais deliberadas de 400 ms têm exatamente a
assinatura de um alongamento ("eeee"). O detector agora só roda em fala conectada
(≥ 5 s de fonação). Acusar vício de linguagem onde ele não existe corrói a
confiança no feedback — e a confiança é o insumo do treino.

## 3. Arquitetura de módulos

```
oratorius/
├─ src/
│  ├─ audio/
│  │  ├─ capture.ts             # getUserMedia + constraints (AGC/NS/AEC OFF)
│  │  ├─ worklets/
│  │  │  ├─ pcm-tap.worklet.ts  # PCM Float32 → SharedArrayBuffer (ring buffer)
│  │  │  └─ live-meter.worklet.ts # f0 + RMS em tempo real p/ biofeedback
│  │  ├─ resample.ts            # 48k → 16k p/ o modelo
│  │  └─ wav.ts                 # encode WAV 16 kHz mono 16-bit
│  │
│  ├─ dsp/                      # CAMADA 1 — sem dependências, testável isoladamente
│  │  ├─ pitch.ts               # YIN / pYIN
│  │  ├─ intensity.ts           # RMS → dBFS, envelope
│  │  ├─ vad.ts                 # segmentação voz/silêncio, pausas
│  │  ├─ syllables.ts           # núcleos silábicos → taxa de fala
│  │  ├─ filled-pause.ts        # "éééé"/"hmmm" sem ASR
│  │  ├─ voice-quality.ts       # jitter, shimmer, HNR
│  │  ├─ ddk.ts                 # onsets de pa-ta-ka, regularidade
│  │  └─ mpt.ts                 # tempo máximo de fonação
│  │
│  ├─ phonetics/                # CAMADAS 2 e 3
│  │  ├─ g2p-ptbr.ts            # grafema → fonema (IPA), regras + exceções
│  │  ├─ model.ts               # onnxruntime-web: carregar, WebGPU→WASM fallback
│  │  ├─ align.ts               # alinhamento forçado CTC (Viterbi)
│  │  ├─ gop.ts                 # Goodness of Pronunciation
│  │  └─ rhotic.ts              # detector especializado de tepe/omissão/epêntese
│  │
│  ├─ scoring/
│  │  ├─ rubrics.ts             # peso das métricas por tipo de exercício
│  │  ├─ score.ts               # métricas → nota 0–100 + flags
│  │  └─ feedback.ts            # flags → frases em pt-BR (templates, determinístico)
│  │
│  ├─ content/
│  │  ├─ exercises/*.json       # catálogo versionado (Seção 4)
│  │  └─ loader.ts
│  │
│  ├─ engine/
│  │  ├─ session.ts             # monta o treino do dia
│  │  ├─ progression.ts         # dificuldade adaptativa, desbloqueio de níveis
│  │  └─ scheduler.ts           # repetição espaçada dos fonemas que você erra
│  │
│  ├─ data/
│  │  ├─ db.ts                  # Dexie / IndexedDB
│  │  ├─ audio-store.ts         # OPFS + retenção rolante
│  │  └─ backup.ts              # export/import JSON
│  │
│  ├─ ui/                       # TypeScript puro (ver ADR-004)
│  └─ workers/
│     ├─ analysis.worker.ts     # Camada 1 pós-gravação
│     ├─ client.ts              # fila + queda para execução síncrona
│     └─ phoneme.worker.ts      # Camadas 2 e 3 (ONNX) — Fase 3
│
├─ docs/
└─ tools/                       # scripts de calibração e conversão de modelo
```

### Princípios de fronteira

- `dsp/` e `phonetics/` são **funções puras sobre `Float32Array`**. Sem DOM, sem IO.
  Testáveis no Node, no Windows, sem iPhone. É onde mora o risco e é onde ficam os testes.
- `ui/` nunca chama `dsp/` diretamente — sempre via worker, para não travar a interface
  durante a gravação.
- `content/` é dado, não código. Adicionar exercícios não exige tocar em lógica.
- `scoring/feedback.ts` é a **única** camada que produz texto para o usuário. Trocar o tom
  do feedback é editar um arquivo.

---

## 4. Motor de exercícios

### Trilhas

**A. Motricidade orofacial** — mobilidade e força da língua.
Estalos, elevação da ponta ao palato, varredura do palato, vibração de lábios e língua,
resistência contra a bochecha.
*Avaliação: cronometrada e por autorrelato + contagem de repetições. Áudio só nos que produzem som (estalo, vibração).*

**B. Diadococinesia (DDK)** — agilidade e **regularidade**.
`pa-ta-ka` acelerando, `la-la-la`, `ta-da-ta-da`, `pa-ta-ka-ra`.
*Avaliação objetiva: sílabas/s e coeficiente de variação do intervalo entre onsets. O CV
é a métrica interessante — mede se a língua está travando de forma irregular.*

**C. Articulação — o tepe `/ɾ/`, em progressão estrita.**
Esta é a trilha central do projeto. A progressão importa mais que o conteúdo:

| Nível | Alvo | Exemplos |
|---|---|---|
| 1 | `/ɾ/` intervocálico isolado | ara, ere, iri, oro, uru |
| 2 | `/ɾ/` intervocálico em palavra | caro, pera, muro, cara, hora |
| 3 | Pares mínimos intervocálicos | caro/carro, mora/morra, coro/corro, era/erra, muro/murro |
| 4 | Encontro consonantal, sílaba isolada | pra-pre-pri-pro-pru, tra-tre-tri-tro-tru, gra-gre-gri-gro-gru |
| 5 | Encontro em palavra | prato, trem, grande, cravo, brasa, fruta, drible, vidro |
| 6 | Pares mínimos de encontro (caça à omissão) | prato/pato, trem/tem, cravo/cavo, grama/gama, brasa/basa |
| 7 | Encontro em frase | "o trem grande trouxe três presentes" |
| 8 | Trava-línguas cronometrados | "três pratos de trigo para três tigres tristes" |
| 9 | `/ɾ/` em coda | porta, verde, sorte, carta *(alvo conforme seu sotaque — ver ADR-002)* |
| 10 | Fala espontânea com densidade alta de róticos | improviso sobre tema sorteado |

**D. Respiração e apoio** — base de tudo em oratória.
Respiração costodiafragmática (guiada, com contagem), `/s/` sustentado, `/a/` sustentado (TMF),
contagem numa expiração, frases longas em uma só respiração.
*Avaliação: TMF em segundos, estabilidade de intensidade ao longo da sustentação (queda no fim = falta de apoio).*

**E. Oratória** — projeção, prosódia, estrutura.
Humming/ressonância, leitura expressiva com alvo de variação de pitch, articulação exagerada
com *bite block* (rolha entre os dentes), leitura com pausas marcadas, improviso cronometrado
(1/2/3 min), estruturas PREP e STAR, storytelling.
*Avaliação: faixa de f0 em semitons (anti-monotonia), variação de intensidade, taxa de
articulação, número/duração de pausas, contagem de pausas preenchidas ("é", "tipo", "né").*

### Sessão diária (10–15 min, montada pelo `engine/session.ts`)

```
1. Aquecimento          2 min   Respiração + humming + motricidade
2. Foco articulatório   5 min   Nível atual da Trilha C + revisão espaçada dos erros
3. DDK                  1 min   Medição objetiva do dia (sempre o mesmo, p/ comparabilidade)
4. Oratória             4 min   Leitura expressiva ou improviso
5. Fechamento           1 min   Relatório do dia + comparação com a semana
```

### Progressão

- Sobe de nível ao atingir ≥ 85% de acerto no alvo em 3 sessões consecutivas.
- Fonemas e contextos errados entram numa fila de **repetição espaçada** (1, 3, 7, 14 dias).
- Um exercício "linha de base" fixo (DDK + TMF + uma frase padrão) roda **todo dia**,
  sem adaptação, para gerar uma série temporal comparável. Isto é o que você leva ao fonoaudiólogo.

---

## 5. UX — cinco telas

**1. Início.** Botão grande "Treinar hoje" (a única ação primária), sequência de dias
(streak), gráfico compacto da métrica da semana, aviso de backup se > 7 dias.

**2. Exercício.** Instrução em texto grande. Botão ▶︎ **Ouvir o modelo**
(`speechSynthesis` pt-BR). Botão de gravar ocupando o polegar. Durante a gravação:
medidor de nível e contorno de pitch ao vivo (biofeedback — o retorno visual imediato
é boa parte do efeito terapêutico). Ao soltar: análise → feedback.

**3. Feedback.** Uma frase clara no topo ("Você omitiu o **r** em *grande*"), não uma nota
solta. Abaixo: waveform com o contorno de f0 sobreposto; a palavra-alvo quebrada em chips
coloridos por fonema (verde/amarelo/vermelho); A/B para ouvir sua gravação contra o modelo
e contra a sua melhor tentativa anterior. Ação primária: **Tentar de novo**.

**4. Progresso.** Uma métrica por gráfico, sem dashboard denso. TMF, DDK (sílabas/s e CV),
acerto do `/ɾ/` por contexto (`onset` / `coda` / `intervocálico`), faixa de f0, pausas
preenchidas por minuto. Botão "Exportar relatório".

**5. Ajustes.** Alvo de coda (sotaque), rigor do scoring, meta diária, calibração de
microfone, estado de armazenamento e persistência, backup/restauração.

### Regras de interface

- Uma ação primária por tela.
- Nunca fazer o usuário esperar em silêncio: a Camada 1 responde em < 300 ms e já mostra
  algo enquanto a Camada 3 processa.
- Feedback sempre **acionável e específico**: nomear o fonema e a palavra, nunca "sua
  pronúncia foi 72%".
- Nunca marcar variação regional legítima como erro.
- Modo mãos-livres: a sessão avança sozinha após cada tentativa, para você treinar em pé,
  em frente ao espelho, sem tocar na tela.

---

## 6. Roadmap

| Fase | Duração | Entrega | Critério de conclusão |
|---|---|---|---|
| **0 — Prova de plataforma** | 3–5 dias | PWA vazia instalada no iPhone: grava, mostra waveform, reproduz, persiste | Todos os itens de ação do ADR-001 verificados no aparelho |
| **0.5 — Spike de fonemas** | 2–3 dias | Notebook/script que testa se o modelo separa `grande` de `gande` nas suas gravações | Separação clara nos 20 pares. **Se falhar, replanejar a Camada 3 antes de investir nela** |
| **1 — Camada DSP + oratória** | 2–3 sem | Trilhas D e E funcionando; TMF, DDK, f0, pausas, biofeedback ao vivo; tela de Progresso | App já útil todo dia, sem nenhum modelo de ML |
| **2 — Alinhamento** | 2–3 sem | Camada 2; trilhas C níveis 1–3, trava-línguas com detecção de palavra errada/omitida | Leitura dirigida avaliada corretamente |
| **3 — Fonemas + GOP** | 3–4 sem | Camada 3, detector de rótico, chips por fonema, trilha C completa (níveis 4–10) | Concordância aceitável com sua própria rotulagem manual do conjunto de calibração |
| **4 — Polimento** | 1–2 sem | Progressão adaptativa, repetição espaçada, relatório exportável, streaks | — |

A Fase 1 é o **MVP real**: um app que você usa de verdade, todo dia, sem depender do
componente mais arriscado do projeto.

---

## 7. Riscos

| Risco | Impacto | Prob. | Mitigação |
|---|---|---|---|
| **Tepe dura 15–35 ms; framing de 20 ms pode não resolvê-lo** | Alto — inviabiliza o diagnóstico central | Média | Fase 0.5 antes de investir; se falhar, usar janela de 10 ms ou detector dedicado de DSP (Camada 1) para o rótico |
| Modelo multilíngue de fonemas fraco em pt-BR | Alto | Média | Fase 0.5; alternativa: modelo pt-BR em nível de caractere |
| Safari despeja os dados | Alto | Baixa-média | ADR-003: backup insistente na UI; métricas separadas do áudio |
| Feedback mal calibrado → você deixa de confiar no app | **Alto** | Média | Conjunto de calibração rotulado por você; rigor ajustável; na dúvida, o app cala em vez de acusar erro |
| Escopo cresce e o app nunca fica pronto | Alto | **Alta** | Fase 1 é entregável e útil sozinha; nada da Fase 3 bloqueia o uso diário |
| Latência de inferência insuportável | Médio | Baixa | int8 + WebGPU; análise assíncrona com feedback da Camada 1 imediato |
| AGC do iOS distorce medidas de intensidade | Médio | Média | Constraints desligando AGC + calibração de referência em Ajustes; se falhar, reportar intensidade só relativa (dentro da mesma gravação) |
| Tratar seu sotaque como defeito | Médio | Média | Alvo de coda configurável; rigor concentrado em omissão/epêntese |

---

## 8. Ressalva

O Oratorius **não é dispositivo médico** e não diagnostica nem trata anquiloglossia
("língua presa" anatômica, por frênulo curto). Se a dificuldade com róticos tiver origem
anatômica, nenhum exercício a resolve — a avaliação é de fonoaudiólogo, e a conduta pode
ser cirúrgica (frenotomia). O papel do app é: **treinar** o que é treinável (coordenação,
automatização, prosódia, confiança) e **medir objetivamente** a evolução, gerando um
relatório que vale a pena levar a um profissional.

---

## Índice de decisões

- [ADR-001 — Plataforma-alvo e distribuição](./adr/ADR-001-plataforma-alvo.md)
- [ADR-002 — Motor de análise de fala](./adr/ADR-002-motor-de-analise-de-fala.md)
- [ADR-003 — Dados, persistência e backup](./adr/ADR-003-dados-persistencia-e-backup.md)
- [ADR-004 — Stack sem dependências e sem bundler](./adr/ADR-004-stack-sem-dependencias.md)
