/**
 * Armazenamento de audio, separado dos metadados (ADR-003).
 *
 * Duas politicas opostas para dois perfis opostos de dado:
 *   - metricas: minusculas e insubstituiveis -> IndexedDB, para sempre
 *   - audio:    ~32 KB/s e recalculavel so em parte -> OPFS, retencao rolante
 *
 * Regra de ouro respeitada em todo o app: apagar audio NUNCA apaga progresso.
 * Nenhuma metrica exibida depende de ler o arquivo de volta.
 *
 * Backend primario: OPFS. Fallback: IndexedDB — o Safari demorou a suportar
 * `createWritable`, e um app que perde a gravacao por causa disso e inaceitavel.
 */

import { openDb } from './idb.ts';

const DIR = 'recordings';

let backend: 'opfs' | 'idb' | null = null;

async function opfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

async function detectBackend(): Promise<'opfs' | 'idb'> {
  if (backend) return backend;
  try {
    if (!navigator.storage?.getDirectory) throw new Error('sem OPFS');
    const dir = await opfsDir();
    const probe = await dir.getFileHandle('.probe', { create: true });
    if (typeof (probe as { createWritable?: unknown }).createWritable !== 'function') {
      throw new Error('sem createWritable');
    }
    const w = await probe.createWritable();
    await w.write(new Blob([new Uint8Array([1])]));
    await w.close();
    await dir.removeEntry('.probe');
    backend = 'opfs';
  } catch {
    backend = 'idb';
  }
  return backend;
}

export function currentBackend(): 'opfs' | 'idb' | null {
  return backend;
}

/** Store dedicado para blobs no fallback, criado sob demanda. */
const BLOB_DB = 'oratorius-audio';
let blobDbPromise: Promise<IDBDatabase> | null = null;

function openBlobDb(): Promise<IDBDatabase> {
  if (blobDbPromise) return blobDbPromise;
  blobDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(BLOB_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('blobs')) {
        req.result.createObjectStore('blobs');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return blobDbPromise;
}

export async function saveAudio(ref: string, blob: Blob): Promise<void> {
  if ((await detectBackend()) === 'opfs') {
    const dir = await opfsDir();
    const handle = await dir.getFileHandle(ref, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const db = await openBlobDb();
  const tx = db.transaction('blobs', 'readwrite');
  tx.objectStore('blobs').put(blob, ref);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAudio(ref: string): Promise<Blob | null> {
  try {
    if ((await detectBackend()) === 'opfs') {
      const dir = await opfsDir();
      const handle = await dir.getFileHandle(ref);
      return await handle.getFile();
    }
    const db = await openBlobDb();
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').get(ref);
    return await new Promise((resolve) => {
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    // Referencia orfa: a gravacao expirou pela retencao. Nao e erro.
    return null;
  }
}

export async function deleteAudio(ref: string): Promise<void> {
  try {
    if ((await detectBackend()) === 'opfs') {
      const dir = await opfsDir();
      await dir.removeEntry(ref);
      return;
    }
    const db = await openBlobDb();
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').delete(ref);
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  } catch {
    // Ja nao existe — resultado desejado alcancado.
  }
}

export async function listAudioRefs(): Promise<string[]> {
  try {
    if ((await detectBackend()) === 'opfs') {
      const dir = await opfsDir() as FileSystemDirectoryHandle & {
        keys(): AsyncIterableIterator<string>;
      };
      const out: string[] = [];
      for await (const name of dir.keys()) out.push(name);
      return out;
    }
    const db = await openBlobDb();
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').getAllKeys();
    return await new Promise((resolve) => {
      req.onsuccess = () => resolve((req.result as string[]) ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export interface StorageEstimate {
  usageMb: number;
  quotaMb: number;
  persisted: boolean;
  backend: 'opfs' | 'idb';
}

export async function storageStatus(): Promise<StorageEstimate> {
  const b = await detectBackend();
  let usageMb = 0;
  let quotaMb = 0;
  try {
    const est = await navigator.storage.estimate();
    usageMb = (est.usage ?? 0) / (1024 * 1024);
    quotaMb = (est.quota ?? 0) / (1024 * 1024);
  } catch {
    // Estimativa indisponivel — nao impede o app de funcionar.
  }
  let persisted = false;
  try {
    persisted = (await navigator.storage.persisted?.()) ?? false;
  } catch {
    persisted = false;
  }
  return { usageMb, quotaMb, persisted, backend: b };
}

/**
 * Pede armazenamento persistente. Sem isso o Safari pode despejar os dados de
 * sites pouco usados. Um web app na tela de inicio tem tratamento mais permissivo,
 * mas nao ha garantia — por isso o backup manual continua sendo obrigatorio na UI.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Retencao rolante: apaga audio mais antigo que `keepDays`, exceto o que estiver
 * em `protectedRefs` (gravacoes fixadas — marcos que voce escolheu guardar).
 *
 * Roda ao abrir o app e NUNCA durante uma gravacao — IO concorrente no OPFS
 * competiria com a escrita da gravacao em andamento.
 *
 * @param knownRefs   refs citadas por alguma tentativa; o que nao estiver aqui e lixo
 * @param protectedRefs refs que a retencao nunca pode tocar
 */
export async function pruneAudio(
  keepDays: number,
  knownRefs: Set<string>,
  protectedRefs: Set<string>,
): Promise<{ removed: number; orphans: number }> {
  const refs = await listAudioRefs();
  let removed = 0;
  let orphans = 0;
  const cutoff = Date.now() - keepDays * 24 * 3600 * 1000;

  for (const ref of refs) {
    if (protectedRefs.has(ref)) continue;

    if (!knownRefs.has(ref)) {
      // Arquivo sem tentativa correspondente: lixo de uma escrita interrompida.
      await deleteAudio(ref);
      orphans++;
      continue;
    }
    const ts = timestampFromRef(ref);
    if (ts !== null && ts < cutoff) {
      await deleteAudio(ref);
      removed++;
    }
  }
  await openDb(); // garante que o banco principal esta pronto para a atualizacao das refs
  return { removed, orphans };
}

/** As refs embutem o instante da gravacao, evitando um `stat` por arquivo. */
export function makeAudioRef(attemptId: string): string {
  return `${Date.now()}_${attemptId}.wav`;
}

export function timestampFromRef(ref: string): number | null {
  const n = Number.parseInt(ref.split('_')[0] ?? '', 10);
  return Number.isFinite(n) ? n : null;
}
