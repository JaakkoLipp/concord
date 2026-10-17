/**
 * The session token lives in IndexedDB, in the browser and the desktop app alike (architecture section 4.1).
 * Next to it, the session's ID, from logins since M4.8 (task 8), so the account page knows which session is
 * this device. Logout deletes both.
 */
const DB = 'concord';
const STORE = 'session';
const KEY = 'token';
const SESSION_KEY = 'session-id';

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
/** Undefined for a browser signed in before M4.8, until it signs in again. */
export const loadSessionId = () => run<string | undefined>('readonly', (s) => s.get(SESSION_KEY) as IDBRequest<string | undefined>).catch(() => undefined);
/** A login without an ID removes the old one, so it can't name another session. */
export const saveSessionId = (id: string | undefined) => (id ? run('readwrite', (s) => s.put(id, SESSION_KEY)) : run('readwrite', (s) => s.delete(SESSION_KEY))).then(() => {}).catch(() => {});
export const clearToken = () => run('readwrite', (s) => { s.delete(SESSION_KEY); return s.delete(KEY); }).then(() => {}).catch(() => {});
