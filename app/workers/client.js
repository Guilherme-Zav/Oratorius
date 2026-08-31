/**
 * Cliente do worker de analise, com queda para execucao sincrona.
 *
 * O fallback nao e paranoia: module workers exigem Safari 15+, e um app pessoal
 * que precisa funcionar por anos nao pode deixar de analisar uma gravacao so
 * porque o worker nao subiu. Pior UI (a tela congela por alguns segundos) e muito
 * melhor que nenhuma analise.
 */
import { analyze } from "../dsp/analyze.js";
let worker = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map();
function ensureWorker() {
    if (workerBroken)
        return null;
    if (worker)
        return worker;
    try {
        // Caminho literal .js: e o nome do arquivo emitido. `new URL` nao passa pela
        // reescrita de extensoes do tsc, entao aqui a extensao ja e a final.
        worker = new Worker(new URL('./analysis.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (event) => {
            const { id, result, error } = event.data;
            const entry = pending.get(id);
            if (!entry)
                return;
            pending.delete(id);
            if (error || !result)
                entry.reject(new Error(error ?? 'analise falhou'));
            else
                entry.resolve(result);
        };
        worker.onerror = () => {
            // Derruba o worker e deixa as chamadas seguintes irem pelo caminho sincrono.
            workerBroken = true;
            for (const [, entry] of pending)
                entry.reject(new Error('worker indisponivel'));
            pending.clear();
            worker?.terminate();
            worker = null;
        };
        return worker;
    }
    catch {
        workerBroken = true;
        return null;
    }
}
export async function analyzeAsync(pcm, sampleRate, options = {}) {
    const w = ensureWorker();
    if (!w)
        return analyze(pcm, sampleRate, options);
    const id = nextId++;
    const request = { id, pcm, sampleRate, options };
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
            // O PCM e COPIADO, nao transferido. Transferir economizaria ~17 MB de copia
            // numa gravacao de 90 s, mas destacaria o buffer aqui — e ai uma falha do
            // worker deixaria a gravacao sem nenhuma analise possivel. A copia custa
            // poucos milissegundos contra varios segundos de analise; o seguro vale mais.
            w.postMessage(request);
        }
        catch (err) {
            pending.delete(id);
            reject(err);
        }
    }).catch(() => {
        // Uma falha do worker nunca pode custar a gravacao do usuario.
        return analyze(pcm, sampleRate, options);
    });
}
/** Encerra o worker. Chamado ao sair da pratica, para nao segurar memoria. */
export function disposeAnalysisWorker() {
    worker?.terminate();
    worker = null;
}
//# sourceMappingURL=client.js.map