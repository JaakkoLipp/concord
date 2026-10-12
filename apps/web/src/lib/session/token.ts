/**
 * The session token lives in IndexedDB, in the browser and the desktop app alike (architecture section 4.1).
 * Logout deletes it.
 */
const DB = 'concord';
const STORE = 'session';
const KEY = 'token';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const loadToken = () => run<string | undefined>('readonly', (s) => s.get(KEY) as IDBRequest<string | undefined>).catch(() => undefined);
export const saveToken = (token: string) => run('readwrite', (s) => s.put(token, KEY)).then(() => {});
export const clearToken = () => run('readwrite', (s) => s.delete(KEY)).then(() => {}).catch(() => {});
