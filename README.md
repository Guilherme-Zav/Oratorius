# Oratorius

Treino pessoal de oratória e articulação, rodando inteiramente no iPhone.
Nenhum áudio sai do aparelho, não há backend, não há conta, não há custo.

Decisões de arquitetura em [`docs/`](docs/DESIGN.md).

---

## Começar (2 minutos)

```bash
npm install
```

```bash
npm run build
```

```bash
npm run serve
```

Abre em `http://localhost:5173`. No desktop o microfone já funciona (`localhost`
é contexto seguro).

**Para usar no iPhone, veja [Publicar](#publicar) — `http://` num IP de rede não
funciona**, porque o Safari exige contexto seguro para liberar o microfone.

## Comandos

| Comando | O que faz |
|---|---|
| `npm test` | Roda os 62 testes (DSP, scoring, progressão, sessão) |
| `npm run typecheck` | Checagem de tipos, sem emitir |
| `npm run build` | `tsc` → `dist/app/` + copia `public/` → `dist/` + valida |
| `npm run serve` | Servidor estático local em `dist/` |
| `npm run dev` | build + serve |
| `npm run icons` | Regenera os ícones PNG |

---

## Por que sem bundler

O projeto tem **zero dependências de runtime** e uma única dependência de
desenvolvimento (`typescript`). Sem React, sem Vite, sem Dexie, sem `node_modules`
em produção.

Três razões, em ordem de peso:

1. **Este ambiente Windows tem Smart App Control ativo**, que bloqueia binários
   nativos não assinados. Vite 8 (rolldown), esbuild e o compilador nativo do
   TypeScript 7 são todos bloqueados. Um projeto com bundler simplesmente não roda
   aqui. A alternativa seria desativar uma proteção do sistema — que não é o preço
   certo a pagar por um app pessoal.
2. **O app precisa continuar funcionando daqui a anos**, sem manutenção. Toda
   dependência é uma chance futura de quebra. O Safari carrega ES modules
   nativamente; para um app deste tamanho, bundling não compra nada.
3. **O ciclo fica trivial**: `tsc` transpila, `cp` copia, pronto. Sem cache
   corrompido, sem plugin incompatível.

O `tsc` usa `rewriteRelativeImportExtensions`, então o código-fonte importa
`./frames.ts` (o que o Node 24 executa direto, sem compilar — é assim que os
testes rodam) e o emitido vira `./frames.js` (o que o navegador carrega).

---

## Arquitetura em uma tela

```
PCM cru (48 kHz, AGC/NS/AEC desligados)
        │
        ├── ao vivo ──→ nível + f0 → biofeedback na tela durante a gravação
        │
        └── pós-gravação ──→ src/dsp/analyze.ts
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
        f0 (YIN)            energia / VAD          espectro (FFT)
        TMF, jitter         pausas, sílabas        alongamentos, DDK
              └─────────────────────┼─────────────────────┘
                                    ▼
                         src/scoring/  (rubricas → nota + frases)
                                    ▼
                         src/ui/  (nota, gráfico, medidas, A/B)
```

Detalhe importante: **tudo em `src/dsp/` e `src/scoring/` é função pura sobre
`Float32Array`** — sem DOM, sem IO. É por isso que dá para testar no Windows, sem
iPhone, e é onde estão os 62 testes.

```
src/
  audio/      captura (getUserMedia + AudioWorklet), WAV, voz-modelo (TTS)
  dsp/        f0, intensidade, VAD, sílabas, FFT, DDK, TMF, qualidade vocal
  scoring/    rubricas declarativas → nota, critérios e feedback em pt-BR
  content/    catálogo de exercícios (dado, não lógica)
  engine/     sessão do dia, progressão de nível, repetição espaçada
  data/       IndexedDB (métricas) + OPFS (áudio), backup, retenção
  ui/         5 telas em TypeScript puro
public/       index.html, styles.css, service worker, worklet, ícones
```

---

## Publicar

Precisa de HTTPS. Qualquer host estático gratuito serve; a pasta a publicar é `dist/`.

**Cloudflare Pages** (recomendado — não precisa de conta paga nem de CLI):

1. Crie um repositório no GitHub com este projeto.
2. Em Cloudflare Pages → *Create a project* → conecte o repositório.
3. Build command: `npm run build` · Build output directory: `dist`
4. Deploy. A URL sai em `https://<nome>.pages.dev`.

Alternativas equivalentes: Netlify (arraste a pasta `dist/`), Vercel, GitHub Pages.

### Instalar no iPhone

1. Abra a URL HTTPS no **Safari** (precisa ser Safari — outros navegadores no iOS
   não instalam PWA).
2. Botão de compartilhar → **Adicionar à Tela de Início**.
3. Abra pelo ícone, não pelo Safari. Em modo standalone o app ocupa a tela toda e
   tem tratamento de armazenamento mais favorável.
4. Na primeira gravação, aceite a permissão do microfone.
5. Vá em **Ajustes → Diagnóstico** e confira que está tudo verde.

O ícone não expira. Não há re-assinatura semanal, não há conta de desenvolvedor,
não há TestFlight.

---

## Antes de confiar nos números

Duas coisas a fazer na primeira semana:

**1. Calibre o ambiente.** Grave sempre na mesma distância do microfone, no mesmo
cômodo. As medidas de intensidade são relativas (dBFS, não dB SPL) — comparar
gravações feitas a 10 cm e a 1 m não significa nada. Use o microfone interno do
iPhone, não AirPods: o Bluetooth limita a banda e destrói as fricativas.

**2. Estabeleça a linha de base.** Os exercícios marcados como linha de base
(TMF, `pa-ta-ka`, `prato/pato`, leitura expressiva) rodam **todo dia, sem
adaptação**. São eles que geram a série temporal comparável em
**Progresso → Exportar relatório**.

---

## Limites conhecidos

Estão documentados porque saber o que a ferramenta *não* mede é parte de usá-la bem.

| Limite | Detalhe |
|---|---|
| **Não avalia fonema** | Esta é a Fase 1. O app mede prosódia, ritmo, pausas, TMF e regularidade de DDK — não verifica se o `/ɾ/` de "grande" saiu. Isso é a Camada 3 do [ADR-002](docs/adr/ADR-002-motor-de-analise-de-fala.md), ainda não construída. Hoje os pares mínimos treinam pelo par ouvir/repetir/comparar, não por nota automática. |
| **Vícios lexicais** | Detecta alongamentos ("éééé", "hmmm") pelo som. **Não** detecta "tipo", "né", "então" — isso exige transcrição. |
| **Jitter/shimmer aproximados** | Medidos a 16 kHz com interpolação sub-amostra. Servem para tendência na sua própria voz, não para comparar com valores de literatura clínica. |
| **Intensidade é relativa** | dBFS, não dB SPL. Sem calibração com sonômetro não existe volume absoluto. |
| **Sem gravação em segundo plano** | Limitação da plataforma web. Irrelevante para exercícios de sessão ativa. |
| **Espera após improvisos longos** | A análise roda em Web Worker (a tela não congela), mas leva alguns segundos numa gravação de 60–90 s. **O tempo no iPhone 13 ainda não foi medido** — as medições feitas aqui são de desktop e ficaram ruidosas demais para extrapolar. Verifique no aparelho; se incomodar, o passo de f0 em gravações longas ainda tem folga para subir. |
| **Dados podem ser despejados** | O Safari pode apagar dados de sites. O app pede armazenamento persistente e insiste no backup — **exporte de vez em quando**. |

---

## Aviso

O Oratorius **não é dispositivo médico**, não diagnostica e não trata
anquiloglossia ("língua presa" por frênulo curto). Se a dificuldade com o `/r/`
tiver causa anatômica, nenhum exercício resolve — a avaliação é de fonoaudiólogo,
e a conduta pode ser cirúrgica.

O que este app faz: **treinar** o que é treinável (coordenação, automatização,
prosódia, confiança) e **medir** a evolução de forma objetiva, produzindo um
relatório que vale a pena levar a um profissional.
