# ADR-004: Stack sem dependências e sem bundler

**Status:** Aceito (implementado)
**Data:** 2026-08-31
**Decisor:** Guilherme
**Depende de:** [ADR-001](./ADR-001-plataforma-alvo.md)

## Contexto

O ADR-001 escolheu PWA e assumiu o stack convencional: Vite + React + TypeScript,
com Dexie para IndexedDB. Ao montar o projeto, três fatos apareceram:

1. **Node.js não estava instalado** na máquina. Instalado via `winget` (v24.19.0).
2. **O Windows deste ambiente tem Application Control / Smart App Control ativo**,
   que bloqueia binários nativos não assinados. O erro concreto:

   ```
   Cannot find native binding … @rolldown/binding-win32-x64-msvc
   Uma política de Controle de Aplicativo bloqueou este arquivo.
   ```

   Isso derruba **Vite 8** (usa rolldown, nativo), **esbuild** (binário) e o
   **TypeScript 7** (compilador nativo em Go). Reinstalar não resolve — não é o
   bug conhecido de optional deps do npm, é política de sistema.
3. **O Node 24 executa TypeScript nativamente** (type stripping) e traz um test
   runner embutido (`node --test`).

A saída óbvia seria desativar a proteção do sistema. Não é o preço certo a pagar
por um app pessoal.

## Decisão

**Zero dependências de runtime e nenhum bundler.** Uma única dependência de
desenvolvimento: `typescript@5.9` (compilador em JavaScript puro, sem binário).

| Peça | Convencional | Aqui |
|---|---|---|
| Framework de UI | React | TypeScript + ~90 linhas de helpers de DOM |
| Bundler | Vite | nenhum — o Safari carrega ES modules nativamente |
| Compilador | tsc nativo / esbuild | `typescript@5.9` (JS puro) |
| Testes | Vitest | `node --test` + ~110 linhas de matchers |
| IndexedDB | Dexie | ~120 linhas escritas à mão |
| Gráficos | Recharts / D3 | SVG escrito à mão |
| Ícones | sharp / canvas | codificador PNG com `node:zlib` (~70 linhas) |

A peça que faz isso funcionar é `rewriteRelativeImportExtensions` do TS 5.7+:
o código-fonte importa `./frames.ts` — que o **Node executa direto**, sem
compilar, e é assim que os testes rodam — e o `tsc` emite `./frames.js`, que é o
que o **navegador carrega**. Uma fonte, dois consumidores, nenhum bundler.

## Opções consideradas

### Opção A: Zero dependências, sem bundler — **ESCOLHIDA**

| Dimensão | Avaliação |
|---|---|
| Funciona neste ambiente | **Sim** |
| Custo de escrita | +~400 linhas (DOM, IDB, matchers, gráficos, PNG) |
| Risco de quebra futura | **Mínimo** — nada para atualizar |
| Tamanho | 196 KB de JS não minificado, 38 módulos |
| Velocidade de build | ~2 s |

**Prós:** roda aqui; sobrevive a anos sem manutenção; `npm install` baixa um pacote;
nada de `node_modules` em produção; depurar é ler o mesmo arquivo que roda.
**Contras:** as ~400 linhas escritas à mão são código nosso para manter; sem
minificação nem tree-shaking (irrelevante em 196 KB para um app pessoal); sem o
ecossistema de plugins.

### Opção B: Desativar o Application Control

**Prós:** libera o stack convencional imediatamente.
**Contras:** desativa uma proteção do sistema inteiro, permanentemente, para
conveniência de um projeto pessoal. Desproporcional. **Descartada por princípio,
não por dificuldade.**

### Opção C: Vite 5/6 (rollup com fallback WASM)

**Prós:** mantém o ecossistema.
**Contras:** rollup também prefere binding nativo; o caminho WASM é lento e mal
suportado. Trocaria um bloqueio duro por um frágil, e ainda amarraria o projeto a
versões antigas por motivo alheio ao produto.

### Opção D: React via ESM vendorizado

**Prós:** mantém o modelo de componentes.
**Contras:** React não publica build ESM pronto para navegador; vendorizar exige
justamente o bundler que não roda. Circular.

## Análise de trade-offs

O trade-off é **conveniência de ecossistema vs. autonomia**.

Para a maior parte dos projetos, o ecossistema vence com folga — ninguém deveria
reescrever React. Mas as condições aqui são atípicas e todas apontam na mesma
direção: um único usuário, cinco telas, nenhuma rota, nenhum estado compartilhado
complexo, um ambiente que bloqueia binários, e um requisito explícito de
**funcionar por anos sem manutenção**. Nessas condições, React resolveria um
problema que este app não tem, ao custo de um bundler que este ambiente não roda.

O que se perde de verdade é a ergonomia: sem JSX, sem hot reload, sem devtools de
componente. O que se ganha: o app não tem como quebrar por atualização de
dependência, porque não há dependência.

**A parte que importa não mudou.** Todo o valor do produto está em `src/dsp/` e
`src/scoring/` — funções puras sobre `Float32Array`, sem DOM e sem IO, que seriam
escritas exatamente do mesmo jeito com ou sem React. A decisão só afetou a casca.

## Consequências

**Fica mais fácil**
- Rodar os testes: `node --test`, sem transpilação, sem watcher, sem config.
- Publicar: copiar `dist/` para qualquer host estático.
- Migrar para Swift depois (gatilhos do ADR-001): a lógica não tem framework para desembaraçar.

**Fica mais difícil**
- Adicionar uma tela custa mais linhas do que custaria com JSX.
- Sem tipos vindos de uma lib de UI, erros de DOM aparecem em runtime, não na compilação.

**Vamos precisar revisitar**
- Se a UI passar de ~8 telas ou ganhar estado compartilhado não trivial.
- Se o ambiente de desenvolvimento mudar (outra máquina, sem Application Control).

## Itens de ação

1. [x] Instalar Node 24 e confirmar type stripping nativo.
2. [x] Substituir Vitest por `node --test` + matchers próprios.
3. [x] Escrever o envelope de IndexedDB e o gerador de ícones.
4. [x] Configurar `rewriteRelativeImportExtensions` e validar o emit.
5. [x] `tools/build.mjs` verifica que nenhum import emitido aponta para `.ts` e
       que todo import relativo resolve — o modo de falha mais provável sem bundler.
