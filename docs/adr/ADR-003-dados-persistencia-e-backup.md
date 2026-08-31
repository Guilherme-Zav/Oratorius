# ADR-003: Dados, persistência e backup

**Status:** Proposto
**Data:** 2026-08-31
**Decisor:** Guilherme
**Depende de:** [ADR-001](./ADR-001-plataforma-alvo.md)

## Contexto

O valor do Oratorius ao longo do tempo é a **série histórica**: ver que o TMF subiu de
9 s para 17 s, que a taxa de acerto do `/ɾ/` em `gr` foi de 40% para 85%, que a
monotonia caiu. Perder esse histórico esvazia o app.

Ao mesmo tempo, a Opção A do ADR-001 (PWA) coloca os dados dentro do sandbox de
armazenamento do Safari, que é o ponto mais frágil de toda a arquitetura. O Safari
pode despejar dados de sites; web apps instalados na tela de início têm política mais
permissiva, mas **não é uma garantia contratual**.

Volumes esperados (uso pessoal, ~15 min/dia):

- Metadados: ~30 registros de tentativa por dia × 1–3 KB = trivial (< 40 MB em 3 anos).
- Áudio: WAV 16 kHz mono 16-bit = 32 KB/s. 10 min/dia ≈ **19 MB/dia ≈ 7 GB/ano.**
  Este é o problema real.

## Decisão

**Separar dados por criticidade e tratá-los com políticas diferentes.**

| Classe | O quê | Onde | Retenção | Backup |
|---|---|---|---|---|
| **Crítico** | Métricas, scores, histórico de sessões, configurações, estado de progressão | IndexedDB (via Dexie) | **Para sempre** | Export automático + lembrete semanal |
| **Volumoso** | Gravações de áudio | OPFS (Origin Private File System) | **Rolling 30 dias** + gravações "fixadas" | Manual, sob demanda |
| **Imutável** | Catálogo de exercícios, textos, listas de pares mínimos | Bundle do app (JSON versionado no Git) | N/A | Git |
| **Derivado** | Modelo ONNX, vozes | Cache API (service worker) | Descartável | Re-download |

Regras:

1. Chamar `navigator.storage.persist()` na primeira execução e **exibir um aviso
   permanente na tela de Ajustes** se retornar `false`.
2. Áudio nunca é pré-requisito de nenhuma métrica. Todo número exibido é calculado no
   momento da gravação e persistido como metadado. **Apagar o áudio nunca apaga progresso.**
3. Retenção rolante: ao passar de 2 GB de OPFS, apagar as gravações não fixadas mais
   antigas. Você pode "fixar" uma gravação como marco de comparação (ex.: "linha de base,
   dia 1") e ela nunca é apagada.
4. Export completo em um arquivo `.json` (métricas + config) via `showSaveFilePicker`
   ou download simples para o app Arquivos / iCloud Drive. Import restaura tudo.
5. O app pede o backup a cada 7 dias de uso e mostra a data do último backup na tela inicial.

## Modelo de dados

```ts
type Exercise = {                 // imutável, vem do bundle JSON
  id: string;
  track: 'articulacao' | 'oratoria' | 'respiracao' | 'motricidade';
  type: 'sustentacao' | 'ddk' | 'leitura' | 'par-minimo'
      | 'trava-lingua' | 'improviso' | 'motricidade';
  level: 1 | 2 | 3 | 4 | 5;
  prompt: string;                 // texto a ler / instrução
  targetPhonemes?: string[];      // ex.: ['ɡ','ɾ'] — foco do scoring
  targetContext?: 'onset-cluster' | 'coda' | 'intervocalico';
  rubric: RubricRef;              // quais métricas contam e com que peso
  durationSec?: number;
};

type Attempt = {                  // crítico — nunca apagar
  id: string;
  exerciseId: string;
  sessionId: string;
  at: string;                     // ISO 8601
  audioRef?: string;              // caminho OPFS; pode ser null (áudio expirado)
  pinned: boolean;
  metrics: Metrics;
  phonemeScores?: PhonemeScore[];
  score: number;                  // 0–100, pela rubrica do exercício
  flags: string[];                // ex.: ['omissao-tepe','epentese','monotonia']
};

type Metrics = {
  durationSec: number;
  f0: { meanHz: number; sdSemitones: number; rangeSemitones: number; voicedRatio: number };
  intensity: { meanDb: number; sdDb: number; peakDb: number };
  timing: { speechRateSyllPerSec: number; articulationRate: number;
            pauseCount: number; pauseTotalSec: number; filledPauseCount: number };
  voiceQuality?: { jitterPct: number; shimmerPct: number; hnrDb: number };
  mpt?: number;                   // tempo máximo de fonação
  ddk?: { syllPerSec: number; cvPercent: number };  // cv = regularidade
};

type PhonemeScore = {
  phoneme: string;                // IPA
  startMs: number; endMs: number;
  gop: number;
  perceived: string;              // o que o modelo de fato ouviu
  verdict: 'ok' | 'substituicao' | 'omissao' | 'epentese' | 'distorcao';
};

type Session = { id: string; startedAt: string; endedAt?: string;
                 attemptIds: string[]; plannedTrack: string };

type Settings = {
  codaRhoticTarget: 'tepe' | 'fricativa' | 'retroflexo';  // respeita seu sotaque
  strictness: 1 | 2 | 3;
  dailyGoalMin: number;
  micCalibration: { noiseFloorDb: number; refLevelDb: number };
  lastBackupAt?: string;
};
```

## Opções consideradas para o armazenamento de áudio

### Opção A: OPFS com retenção rolante — **ESCOLHIDA**

| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa-média |
| Performance | **Melhor** — API de arquivos síncrona em worker, sem serialização |
| Limite | Compartilha a cota de origem; adequado com política de retenção |

**Prós:** feito exatamente para blobs grandes; escrita em worker sem travar a UI; separa
claramente o volumoso do crítico.
**Contras:** menos maduro; despejo apaga OPFS junto com IndexedDB (mitigado por o áudio ser descartável por design).

### Opção B: Tudo em IndexedDB (áudio como Blob)

**Prós:** uma API só, transações atômicas entre metadado e áudio.
**Contras:** blobs grandes em IndexedDB no Safari são historicamente problemáticos;
degrada a performance das consultas de histórico, que é a operação mais frequente do app.

### Opção C: Não guardar áudio; só métricas

**Prós:** simplicidade máxima, problema de armazenamento evaporado.
**Contras:** **elimina a funcionalidade mais motivadora do app** — ouvir a gravação de
hoje ao lado da de 3 meses atrás. Para treino de fala, essa comparação A/B é grande parte
do valor terapêutico. Descartada, exceto como modo de emergência sob pressão de cota.

## Análise de trade-offs

O trade-off é **fidelidade histórica vs. cota de armazenamento**, e a resolução está em
notar que os dois tipos de dado têm perfis opostos: métricas são minúsculas e insubstituíveis;
áudio é enorme e recalculável apenas em parte. Tratá-los como uma coisa só força uma
escolha ruim entre "guardo tudo e estouro" e "apago tudo e perco o progresso".

Separando-os, a política fica óbvia: **métricas são sagradas e nunca expiram; áudio é
cache, com exceções que você marca à mão.**

O risco residual — despejo do Safari levando as métricas — não é resolvível dentro da
plataforma. É resolvido *fora* dela, com export para arquivo. Daí a decisão de tornar
o backup uma parte visível e insistente da UI, e não uma opção escondida em Ajustes.

## Consequências

**Fica mais fácil**
- Manter a base de metadados pequena e rápida mesmo depois de anos.
- Exportar um relatório de evolução para levar ao fonoaudiólogo.
- Migrar para nativo depois: o export JSON é o formato de migração.

**Fica mais difícil**
- Duas camadas de armazenamento para manter em sincronia (referências órfãs quando o
  áudio expira → toda leitura de `audioRef` precisa tolerar ausência).
- O usuário (você) carrega a responsabilidade do backup. Precisa ser difícil de esquecer.

**Vamos precisar revisitar**
- Se ocorrer despejo real de dados → é o gatilho nº 3 de migração para nativo do ADR-001.
- Se 30 dias de áudio se mostrarem pouco para a comparação de progresso → guardar,
  além do rolling, uma gravação "melhor da semana" por exercício, permanentemente.

## Itens de ação

1. [ ] Implementar `persist()` na inicialização + indicador de estado em Ajustes.
2. [ ] Implementar export/import JSON completo com número de versão do schema.
3. [ ] Implementar a rotina de retenção (rodar ao abrir o app; nunca durante uma gravação).
4. [ ] Card de "último backup há N dias" na tela inicial, com destaque a partir de 7 dias.
5. [ ] Testar o fluxo de export → apagar dados do site → import, no próprio iPhone, **antes**
       de acumular histórico que valha a pena perder.
