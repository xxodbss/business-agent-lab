// 기기 안에만 저장 (IndexedDB). 사진은 Blob 그대로 보관한다.
const DB_NAME = 'brand-tin';
const VERSION = 1;
let dbPromise = null;
const memory = { pieces: new Map(), meta: new Map() }; // IndexedDB를 못 쓰는 환경용

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('pieces', { keyPath: 'id' });
          db.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await open();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function isPersistent() {
  return Boolean(await open());
}

export async function allPieces() {
  const list = await run('pieces', 'readonly', (s) => (s ? s.getAll() : null));
  const pieces = list ?? [...memory.pieces.values()];
  return pieces.sort((a, b) => a.createdAt - b.createdAt);
}

export function putPiece(piece) {
  return run('pieces', 'readwrite', (s) => (s ? s.put(piece) : void memory.pieces.set(piece.id, piece)));
}

export function deletePiece(id) {
  return run('pieces', 'readwrite', (s) => (s ? s.delete(id) : void memory.pieces.delete(id)));
}

export function getMeta(key) {
  return run('meta', 'readonly', (s) => (s ? s.get(key) : null)).then((v) => v ?? memory.meta.get(key));
}

export function setMeta(key, value) {
  return run('meta', 'readwrite', (s) => (s ? s.put(value, key) : void memory.meta.set(key, value)));
}
