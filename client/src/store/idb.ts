/**
 * Envoltorio mínimo sobre IndexedDB. Es el almacenamiento que permite seguir
 * cargando un registro con el buque sin señal: los borradores viven acá hasta
 * que hay conexión para sincronizarlos.
 */
const DB_NAME = 'sgs';
const DB_VERSION = 1;
export const DRAFTS = 'drafts';
export const CACHE = 'cache';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: 'localId' });
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  get: <T>(store: string, key: IDBValidKey) => run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  getAll: <T>(store: string) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  put: <T>(store: string, value: T, key?: IDBValidKey) =>
    run(store, 'readwrite', (s) => s.put(value as unknown as object, key)),
  delete: (store: string, key: IDBValidKey) => run(store, 'readwrite', (s) => s.delete(key)),
};

/** Cache del catálogo, para poder abrir un formulario estando sin señal. */
export const cache = {
  get: <T>(key: string) => idb.get<T>(CACHE, key),
  set: <T>(key: string, value: T) => idb.put(CACHE, value, key),
};
