# ADR-002: Motor de análise de fala (pronúncia + prosódia)

**Status:** Proposto
**Data:** 2026-08-31
**Decisor:** Guilherme
**Depende de:** [ADR-001](./ADR-001-plataforma-alvo.md)

## Contexto

O núcleo do Oratorius é responder a duas perguntas depois de cada gravação:

1. **"Falei certo?"** — a pronúncia bateu com o alvo, especialmente o tepe `/ɾ/` em
   `tr`, `gr`, `pr`, `br`, `cr`, `dr`, `fr`, `vr` e em coda (`porta`, `verde`).
2. **"Falei bem?"** — tom, ritmo, pausas, projeção, monotonia, vícios de linguagem.

São problemas **diferentes** e não devem compartilhar uma solução. A tentação natural
é "jogar tudo num modelo de ASR e comparar o texto", e isso falha por um motivo
específico e importante:

> **ASR moderno é treinado para ser robusto a variação de pronúncia.** Whisper e afins
> *corrigem* o que você fala — se você diz "gande" em vez de "grande", o modelo de
> linguagem interno restaura "grande" pelo contexto. Um sistema de ASR bom é um
> avaliador de pronúncia ruim, precisamente porque é bom.

Portanto o motor precisa operar em nível **acústico-fonético**, não lexical.

Segunda observação estruturante:

> **Na maioria dos exercícios, o texto-alvo é conhecido de antemão** (você lê
> "o rato roeu a roupa do rei de Roma" porque o app pediu). Isso substitui o problema
> difícil de *reconhecimento* pelo problema mais fácil de **alinhamento forçado +
> verificação**. Só o modo improviso precisa de reconhecimento aberto.

## Decisão

Adotar um motor em **três camadas independentes**, com degradação graciosa: cada
camada entrega valor sozinha, e as camadas superiores são opcionais e adicionadas por fase.

```
                       PCM 48 kHz mono (AudioWorklet, sem AGC/NS/AEC)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
            │  CAMADA 1     │   │  CAMADA 2     │   │  CAMADA 3     │
            │  DSP          │   │  Alinhamento  │   │  Fonemas      │
            │  determinístico│   │  forçado CTC  │   │  + GOP        │
            └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
                    │                   │                   │
              f0, dB, TMF,        onde cada palavra    score por fonema,
              taxa de fala,       começa e termina;    substituição/omissão,
              pausas, jitter,     o que faltou/sobrou  detector de rótico
              shimmer, HNR, DDK
                    └───────────────────┼───────────────────┘
                                        ▼
                              Agregador de feedback
                         (regras + rubricas por exercício)
                                        ▼
                          UI: nota, gráfico, chips por fonema,
                              comparação A/B com a voz-modelo
```

### Camada 1 — DSP determinístico (offline, instantâneo, sem modelo)

Roda num `AudioWorklet` (tempo real, para biofeedback) e num `Web Worker`
(pós-gravação, para o relatório).

| Métrica | Algoritmo | Serve para |
|---|---|---|
| f0 (pitch) | YIN / pYIN via autocorrelação de diferença normalizada | tom, monotonia, entonação |
| Faixa de f0 em semitons, desvio-padrão | derivado do contorno de f0 | detectar fala monótona |
| Intensidade (RMS → dBFS) | janela de 20 ms | projeção, variação de volume |
| TMF (tempo máximo de fonação) | duração de f0 contínuo em `/a/` sustentado | apoio respiratório |
| Taxa de fala e taxa de articulação | detecção de núcleos silábicos (picos de intensidade + vozeamento) | ritmo; "falo rápido demais?" |
| Pausas: número, duração, distribuição | limiar de energia + duração mínima 250 ms | pausas intencionais vs. travadas |
| Pausas **preenchidas** ("éééé", "hmmm") | segmento vozeado, longo, com baixa variação espectral (ΔMFCC ≈ 0) | vícios de linguagem — **sem precisar de ASR** |
| Jitter, shimmer, HNR | perturbação período a período do f0 e da amplitude | qualidade vocal, tensão, fadiga |
| DDK (`pa-ta-ka`) | detecção de onsets → sílabas/s e coeficiente de variação do intervalo | agilidade e **regularidade** da língua |

Esta camada sozinha já cobre **100% do requisito "tom da minha voz"** e boa parte do
treino de oratória. É determinística, auditável e não depende de modelo nenhum.

### Camada 2 — Alinhamento forçado CTC (texto-alvo conhecido)

Modelo acústico CTC em ONNX produz, por frame de 20 ms, uma distribuição sobre
símbolos fonéticos. Com o texto-alvo convertido em fonemas por um **G2P de pt-BR**
(regras determinísticas — a ortografia do português é bastante regular), aplica-se
alinhamento forçado (Viterbi sobre a treliça CTC) para obter:

- Fronteiras temporais de cada palavra e cada fonema.
- Palavras omitidas, inseridas ou trocadas (**completude**).
- Duração de cada fonema → detecção de hesitação e alongamento anormal.

### Camada 3 — GOP (Goodness of Pronunciation) + detector de rótico

Sobre a mesma saída de posteriores da Camada 2:

```
GOP(p) = log P(p | áudio do segmento alinhado)  −  max  log P(q | mesmo segmento)
                                                  q ∈ fonemas
```

Um GOP muito negativo significa: "o modelo ouviu outra coisa com mais confiança do que
o fonema que deveria estar aqui". O `argmax` concorrente diz **o que** ele ouviu — que
é exatamente o diagnóstico útil.

Sobre isso, um **detector especializado de róticos**, porque é o alvo clínico do projeto:

| Realização | Assinatura acústica | Classificação |
|---|---|---|
| Tepe `[ɾ]` correto | oclusão muito curta (15–35 ms), queda abrupta de energia, F3 estável | ✅ alvo |
| Aproximante `[ɹ]` (r "americano") | F3 muito baixo (< ~2000 Hz), sem oclusão | ⚠️ substituição |
| Vibrante múltipla `[r]` | 2+ oclusões periódicas | ⚠️ (aceitável em alguns contextos) |
| Fricativa `[x]`/`[h]` em posição de tepe | ruído aperiódico, alta ZCR | ⚠️ substituição |
| **Omissão** ("gande" ← "grande") | ausência de qualquer evento entre a oclusiva e a vogal | ❌ o erro principal a caçar |
| Epêntese ("gurande") | vogal inserida entre consoante e tepe | ⚠️ muito comum e específico do pt-BR |

**Nota importante sobre dialeto:** em pt-BR, o `/r/` em coda (`porta`, `verde`) é
realizado legitimamente como `[x]`, `[h]`, `[ɾ]` ou retroflexo `[ɻ]` conforme a região.
O app **não pode** marcar sua variante regional como erro. A realização-alvo de coda é
**configurável** e default = a sua. O treino foca no que é de fato o problema: o tepe em
**encontro consonantal** (`CR`), onde a omissão e a epêntese são desvios reais, não variação.

## Opções consideradas

### Opção A: Três camadas com CTC de fonemas em ONNX — **ESCOLHIDA**

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Alta** (mas faseável — Camada 1 sozinha já é útil) |
| Custo | US$ 0 (modelos abertos) |
| Precisão de pronúncia | **Alta** — nível de fonema, com diagnóstico do que foi dito no lugar |
| Latência | 2–5 s por enunciado (WASM int8); < 1 s (WebGPU) |
| Tamanho | ~90–300 MB de modelo, baixado uma vez |
| Offline | **Total** após o primeiro download |

**Prós:** é a técnica que os treinadores de pronúncia sérios de fato usam; entrega
diagnóstico acionável ("você omitiu o `ɾ` em `grande`"), não uma nota opaca; a Camada 1
funciona no dia 1 sem nenhum modelo.
**Contras:** a Camada 3 é a parte cara em esforço; exige um G2P de pt-BR e conversão/
quantização do modelo; calibração dos limiares de GOP precisa da sua própria voz.

### Opção B: ASR (Whisper via transformers.js) + comparação de texto

| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa |
| Custo | US$ 0 |
| Precisão de pronúncia | **Baixa — inadequada** |
| Latência | 3–15 s |

**Prós:** trivial de implementar; boa transcrição em pt-BR; único caminho para o modo improviso.
**Contras:** **falha no requisito central.** O modelo de linguagem interno do Whisper
corrige a sua pronúncia antes de você ver o resultado. Ele diria que "gande" está certo.
Além disso alucina em áudio curto ou silêncio.
**Papel final:** rebaixada de solução principal para *componente opcional do modo improviso*.

### Opção C: API de nuvem (Azure Speech Pronunciation Assessment)

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Muito baixa** |
| Custo | Tier gratuito limitado; depois por hora de áudio |
| Precisão | **Muito alta** — scores de acurácia, fluência, completude e prosódia em nível de fonema, com pt-BR suportado |
| Offline | **Nenhum** |
| Privacidade | Sua voz sai do aparelho |

**Prós:** de longe o melhor resultado com o menor esforço. Resolve o problema em um dia.
**Contras:** contradiz o requisito explícito de rodar localmente; sem internet, sem treino;
sua voz vai para um terceiro; cria dependência de fornecedor e de chave de API embutida num app cliente.
**Uso recomendado:** **não como runtime, mas como referência de calibração** — gravar
30–50 enunciados seus, medir com a Azure e usar os scores para calibrar os limiares do
motor local. Excelente uso pontual, sem virar dependência.

### Opção D: Só heurísticas de DSP, sem ML

| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa |
| Precisão de prosódia | **Alta** |
| Precisão de pronúncia | **Média em contextos muito restritos, baixa no geral** |

**Prós:** zero modelo, zero download, instantâneo, totalmente auditável.
**Contras:** funciona para "houve ou não um tepe entre `/g/` e `/ɾ/`?" em palavra isolada
e falha em fala contínua. Não escala para o catálogo completo.
**Papel final:** é a Camada 1, mantida.

## Análise de trade-offs

O trade-off principal é **esforço de implementação vs. capacidade de diagnóstico**.

A escolha por camadas resolve isso ao recusar o dilema: a Camada 1 (barata, determinística)
entrega o eixo "tom da voz" por inteiro e uma fatia grande do eixo oratória já na Fase 1,
enquanto a Camada 3 (cara) é adicionada depois, quando o hábito de uso já existe. **Nenhuma
camada bloqueia o app de ser útil.**

O segundo trade-off é **precisão vs. privacidade/offline** (A vs. C). Aqui o requisito
foi dado: rodar localmente. Mas vale registrar o que se paga por isso: a Azure entrega hoje,
pronto, um scoring provavelmente melhor que o que este motor vai alcançar. A mitigação
(usar a nuvem só para *calibrar* o motor local, offline, uma vez) captura a maior parte
do benefício sem a dependência.

O terceiro é **precisão vs. justiça dialetal**. Um scorer estrito reprova sotaque legítimo,
e um app que te diz que você está errado quando você está certo destrói a confiança na
ferramenta inteira. Por isso o alvo de coda é configurável e o rigor se concentra onde há
desvio real (omissão e epêntese em encontro consonantal).

## Consequências

**Fica mais fácil**
- Entregar valor real em semanas, não em meses.
- Explicar o feedback: cada nota rastreia até uma métrica nomeada, não a uma caixa-preta.
- Levar dados objetivos a um fonoaudiólogo (TMF, DDK, taxa de acerto do `/ɾ/` por contexto
  ao longo do tempo são medidas que um profissional reconhece).
- Trocar o modelo da Camada 3 depois sem tocar nas Camadas 1 e 2.

**Fica mais difícil**
- Calibração. Os limiares de GOP e do detector de rótico **precisam** ser ajustados com
  gravações suas, incluindo erros propositais. Sem isso o feedback será ruído.
- Manter o G2P de pt-BR correto para casos irregulares (nasalização, ditongos, `x`, `ch`, dígrafos).
- O tamanho do bundle e o primeiro carregamento do modelo.

**Vamos precisar revisitar**
- Se o modelo multilíngue de fonemas se mostrar fraco em pt-BR — alternativa é usar um
  modelo de ASR pt-BR em nível de caractere e adaptar o alinhamento.
- Se o GOP se mostrar instável para segmentos curtos como o tepe (que dura 15–35 ms, ~1–2
  frames a 20 ms) — pode exigir janela de 10 ms ou features de resolução maior
  especificamente para róticos. **Este é o principal risco técnico do projeto.**

## Itens de ação

1. [ ] **Spike de viabilidade (fazer antes de comprometer com a Camada 3):** gravar 20
       pares "certo/errado" seus (`grande`/`gande`, `prato`/`pato`, `trem`/`tem`,
       `cravo`/`cavo`, `brasa`/`basa`) e verificar se o modelo de fonemas escolhido
       separa as duas classes. Se não separar, a Camada 3 precisa de outra abordagem.
2. [ ] Escolher e quantizar (int8) o modelo CTC de fonemas; medir tamanho e latência no iPhone 13.
3. [ ] Implementar o G2P pt-BR com testes unitários cobrindo dígrafos, nasais, ditongos e todos os encontros com `r`.
4. [ ] Implementar Camada 1 completa com testes contra sinais sintéticos de f0 e amplitude conhecidos.
5. [ ] Validar a resolução temporal: confirmar se um tepe de 20 ms é detectável no framing escolhido.
6. [ ] Definir o conjunto de calibração: 40 enunciados seus, rotulados manualmente por você, versionados no repositório.
7. [ ] Registrar em `docs/DISCLAIMER.md` que o app não é dispositivo médico nem diagnostica anquiloglossia.
