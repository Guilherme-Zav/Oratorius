# ADR-001: Plataforma-alvo e distribuição do Oratorius

**Status:** Proposto
**Data:** 2026-08-31
**Decisor:** Guilherme (uso pessoal, único usuário)

## Contexto

O Oratorius é um app de uso pessoal para treino de oratória e de articulação
(dificuldade com róticos: `/ɾ/` em encontros consonantais — `tr`, `gr`, `pr`, `br`,
`cr`, `dr`, `fr`, `vr` — e em coda). Precisa capturar microfone, analisar pronúncia
e prosódia, e rodar no iPhone 13.

Forças em jogo:

| Força | Detalhe |
|---|---|
| **Máquina de desenvolvimento é Windows 11** | Xcode só roda em macOS. Sem Mac, não há build nativo local. |
| **Dispositivo-alvo: iPhone 13 (A15)** | Suporta iOS 26. **Não** suporta Apple Intelligence / Foundation Models (exige A17 Pro+). Descartado usar LLM on-device da Apple para gerar feedback. |
| **Usuário único** | Zero necessidade de backend, contas, multi-tenant, App Store, LGPD de terceiros. |
| **Áudio é o núcleo do produto** | Precisa de PCM cru, sem AGC/supressão de ruído, para medir intensidade e formantes de forma confiável. |
| **Iteração rápida importa mais que polimento** | O valor está em treinar todo dia, não em ter uma UI de App Store. |
| **Custo** | Projeto pessoal. Conta Apple Developer = US$ 99/ano. |

## Decisão

**Construir o Oratorius como uma PWA (Progressive Web App) instalada na tela de
início do iPhone**, escrita em TypeScript, com todo o processamento de áudio e
inferência de ML rodando no próprio dispositivo (AudioWorklet + WebAssembly/WebGPU).

Migrar para Swift nativo apenas se um dos gatilhos da seção "Gatilhos de migração"
for atingido.

## Opções consideradas

### Opção A: PWA (Vite + TypeScript + React), instalada via "Adicionar à Tela de Início" — **ESCOLHIDA**

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Baixa** — um único stack, sem toolchain nativa |
| Custo | **US$ 0** — hospedagem estática gratuita, sem conta de desenvolvedor |
| Desbloqueio no Windows | **Total** — desenvolvimento, build e deploy 100% no Windows |
| Ciclo de iteração | **Segundos** — `git push` → deploy → recarrega no iPhone |
| Qualidade de áudio | **Boa** — `AudioWorklet` entrega PCM Float32 em tempo real; constraints permitem desligar AGC/NS/AEC |
| ML on-device | **Viável** — `onnxruntime-web` com WebGPU (Safari 26) e fallback WASM SIMD+threads |
| Longevidade da instalação | **Permanente** — não expira |

**Prós**
- Elimina completamente a dependência de macOS — o maior bloqueio do projeto.
- Sem certificados, sem provisioning, sem re-assinatura. O ícone fica na tela para sempre.
- `speechSynthesis` com voz pt-BR nativa do iOS, grátis, para gerar o *modelo alvo*
  que você imita (par "ouvir → repetir → comparar").
- Todo o pipeline de análise (DSP + ONNX) é código portável: se um dia migrar para
  nativo, a lógica de scoring é reescrita, mas o *algoritmo já está validado*.
- Backup e exportação triviais (arquivo JSON/CSV para o Files).

**Contras**
- `getUserMedia` exige contexto seguro (HTTPS ou localhost). Não dá para abrir por
  IP da LAN em HTTP — precisa de deploy HTTPS ou túnel. *(mitigado: Cloudflare Pages / Vercel, grátis)*
- Sem gravação em segundo plano ou com a tela apagada. *(irrelevante: os exercícios são de sessão ativa)*
- `MediaRecorder` no iOS produz MP4/AAC, não WebM/Opus. *(mitigado: capturamos PCM cru no AudioWorklet e codificamos WAV nós mesmos — que é o que o modelo precisa de qualquer forma)*
- Risco de despejo de dados pelo Safari em sites pouco usados. *(mitigado: web app na tela de início tem política mais permissiva + `navigator.storage.persist()` + backup manual — ver ADR-003)*
- Inferência do modelo de fonemas é mais lenta que Core ML no Neural Engine.
  *(aceitável: análise é por enunciado, pós-gravação, não em tempo real)*

### Opção B: Swift + SwiftUI nativo

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Alta** |
| Custo | **US$ 0–99/ano + custo de um Mac** (Mac mini ~R$ 5.000, ou aluguel de Mac na nuvem ~US$ 25–70/mês) |
| Desbloqueio no Windows | **Nenhum** — bloqueia o projeto hoje |
| Ciclo de iteração | Bom *com* Mac; impossível sem |
| Qualidade de áudio | **Excelente** — AVAudioEngine, controle total de sessão |
| ML on-device | **Excelente** — Core ML no Neural Engine, 5–10× mais rápido |

**Prós:** melhor performance, `Speech.framework` on-device pt-BR grátis, Accelerate/vDSP para DSP, acesso a `AVAudioSession` (categoria `.measurement`, que desativa o processamento do sistema).
**Contras:** exige Mac. Com Apple ID grátis, o app **expira em 7 dias** e precisa ser reinstalado pelo Xcode — inviável para um hábito diário. Com conta paga (US$ 99/ano), 1 ano.

### Opção C: React Native / Expo + EAS Build (build na nuvem)

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Média-alta** |
| Custo | **US$ 99/ano** (obrigatório: TestFlight/ad-hoc exigem conta paga) |
| Desbloqueio no Windows | **Parcial** — builds na nuvem, mas depurar código nativo sem Mac é doloroso |
| Ciclo de iteração | Minutos por build nativo |

**Prós:** acesso a APIs nativas (ASR on-device da Apple via módulo da comunidade), builds a partir do Windows.
**Contras:** paga o preço da complexidade nativa sem ganhar a ergonomia do Xcode. Todo módulo customizado de DSP/Core ML vira uma caixa-preta que você não consegue depurar localmente. Pior dos dois mundos para um projeto solo.

### Opção D: Flutter + Codemagic

Mesmas restrições da Opção C, com um ecossistema de áudio/ML mais fraco que RN.
Descartada sem análise adicional.

## Análise de trade-offs

O trade-off central é **qualidade máxima de análise acústica** (B) contra
**existir de fato** (A).

A Opção B é tecnicamente superior em todos os eixos de engenharia, e é irrelevante:
ela exige uma compra de hardware ou assinatura mensal antes da primeira linha de código.
Para um app de uso pessoal cujo valor depende de *consistência de uso diário*, o maior
risco não é a precisão do scoring — é o projeto nunca sair do papel, ou o app expirar
em 7 dias e quebrar o hábito.

A questão decisiva é: **a plataforma web consegue medir o que precisa ser medido?**

- **Prosódia / "tom da voz"** (f0, intensidade, taxa de fala, pausas, jitter/shimmer):
  sim, integralmente. É DSP puro sobre PCM, e o `AudioWorklet` entrega PCM cru. Zero perda vs. nativo.
- **Pronúncia em nível de fonema:** sim. O modelo acústico (wav2vec2 CTC de fonemas)
  roda em ONNX Runtime Web. Mais lento que Core ML, mas a análise acontece *depois* da
  gravação — 2–5s de espera num enunciado de 5s é perfeitamente utilizável.
- **Transcrição livre:** este é o único ponto fraco real. Mas — ver ADR-002 — a maior
  parte dos exercícios é de **leitura dirigida**, onde o texto-alvo é conhecido. Isso
  transforma o problema de *reconhecimento* em *alinhamento forçado + verificação*,
  que é mais fácil, mais rápido e mais preciso do que ASR aberto.

Ou seja: a perda real da Opção A fica restrita ao modo improviso, e mesmo lá existe
saída acústica (detecção de pausas preenchidas sem ASR).

**A perda de qualidade é pequena e localizada; o ganho de viabilidade é total.**

## Consequências

**Fica mais fácil**
- Começar hoje, no Windows, sem comprar nada.
- Iterar em conteúdo de exercícios (JSON) sem rebuild.
- Reaproveitar a lógica de scoring caso migre para nativo depois.
- Fazer backup, exportar relatórios e versionar o conteúdo em Git.

**Fica mais difícil**
- Performance de inferência: precisa de quantização int8 e de gerenciar o carregamento
  do modelo (~100–300 MB, baixado uma vez e cacheado).
- Confiabilidade de armazenamento: precisa de estratégia explícita de backup (ADR-003).
- Controle da cadeia de áudio do iOS: dá para desativar AGC via constraints, mas sem a
  garantia forte do modo `.measurement` do `AVAudioSession`. **Exige calibração empírica.**

**Vamos precisar revisitar**
- Se a latência da inferência de fonemas passar de ~8s por enunciado no iPhone 13.
- Se o Safari despejar dados apesar da persistência.
- Se algum exercício exigir biofeedback visual de pitch em tempo real com <50 ms de
  latência (provavelmente ainda ok no AudioWorklet, mas precisa ser medido).

## Gatilhos de migração para Swift nativo

Migrar apenas se **um destes** for verdade, e apenas depois de já ter um Mac:

1. Inferência de fonemas > 8 s por enunciado após quantização e WebGPU.
2. Necessidade comprovada de captura em segundo plano ou com tela apagada.
3. Perda de dados recorrente por despejo do Safari, apesar das mitigações.
4. Decisão de publicar na App Store (fora do escopo atual).

## Itens de ação

1. [ ] **Validar no iPhone 13 antes de escrever qualquer feature**: PWA mínima que
       abre o mic com `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }`,
       grava 5 s, mostra a waveform e reproduz. É o teste de fumaça de toda a decisão.
2. [ ] Confirmar `navigator.gpu` disponível no Safari do iOS 26 do aparelho; medir tempo
       de um forward pass do modelo de fonemas em WebGPU vs. WASM SIMD.
3. [ ] Provisionar hospedagem estática HTTPS gratuita (Cloudflare Pages) e configurar
       deploy automático.
4. [ ] Verificar que `navigator.storage.persist()` retorna `true` no web app instalado.
5. [ ] Confirmar disponibilidade de voz pt-BR em `speechSynthesis.getVoices()` no aparelho.
6. [ ] Medir o piso de ruído do ambiente de treino habitual e o ganho do mic interno,
       para calibrar os limiares de detecção de voz e as métricas de intensidade.
