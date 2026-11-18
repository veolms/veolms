/**
 * The device choices the service worker needs (public/sw.js reads them):
 * message previews and quiet hours. A service worker cannot read
 * localStorage, so they are copied into IndexedDB whenever they change.
 */

const DB_NAME = "veolms-push";
const STORE = "prefs";
const KEY = "device";

export interface WorkerPrefs {
  previews: boolean;
  quietHours: { from: string; to: string } | null;
}

let last = "";

export function writeWorkerPrefs(prefs: WorkerPrefs): Promise<void> {
  const value = JSON.stringify(prefs);
  if (value === last || typeof indexedDB === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve();
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(prefs, KEY);
        tx.oncomplete = () => {
          last = value;
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    };
  });
}
