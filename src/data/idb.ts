/**
 * Envelope minimo sobre IndexedDB.
 *
 * Escrito a mao em vez de usar Dexie por uma razao concreta: o app inteiro tem
 * zero dependencias de runtime, o que elimina bundler, node_modules e o risco de
 * uma atualizacao quebrar um app que precisa continuar funcionando daqui a anos.
 * O que usamos de IndexedDB cabe em ~120 linhas.
 */

export type StoreName = 'attempts' | 'sessions' | 'kv';

export interface StoreIndex {
  name: string;
  keyPath: string;
}

const DB_NAME = 'oratorius';
const DB_VERSION = 1;

const STORES: Array<{ name: StoreName; keyPath: string; indexes: StoreIndex[] }> = [
  { name: 'attempts', keyPath: 'id', indexes: [
    { name: 'at', keyPath: 'at' },
    { name: 'exerciseId', keyPath: 'exerciseId' },
    { name: 'sessionId', keyPath: 'sessionId' },
  ] },
  { name: 'sessions', keyPath: 'id', indexes: [{ name: 'startedAt', keyPath: 'startedAt' }] },
  { name: 'kv', keyPath: 'key', indexes: [] },
];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const spec of STORES) {
        const store = db.objectStoreNames.contains(spec.name)
          ? request.transaction!.objectStore(spec.name)
          : db.createObjectStore(spec.name, { keyPath: spec.keyPath });
        for (const idx of spec.indexes) {
          if (!store.indexNames.contains(idx.name)) store.createIndex(idx.name, idx.keyPath);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba aberta'));
  });
  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Erro no IndexedDB'));
  });
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transacao falhou'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacao abortada'));
  });
}

export async function putMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transacao falhou'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacao abortada'));
  });
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return promisify<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key));
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return promisify<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll());
}

/** Percorre um indice em ordem decrescente. Usado para "as N tentativas mais recentes". */
export async function getByIndexDesc<T>(
  store: StoreName,
  index: string,
  limit: number,
): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, 'readonly');
  const cursorRequest = tx.objectStore(store).index(index).openCursor(null, 'prev');
  const out: T[] = [];
  return new Promise((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || out.length >= limit) {
        resolve(out);
        return;
      }
      out.push(cursor.value as T);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

export async function remove(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
}

/** Chave-valor simples, para configuracoes e estado de progressao. */
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await get<{ key: string; value: T }>('kv', key);
  return row?.value;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await put('kv', { key, value });
}
