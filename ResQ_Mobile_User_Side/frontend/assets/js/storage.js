const RESQ_DB_NAME = 'ResQMobileDraftDB';
const RESQ_STORE_NAME = 'media_drafts';

function saveDraftValue(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    return;
  }
}

function loadDraftValue(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function clearDraftValue(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    return;
  }
}

function openMediaDraftDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(RESQ_DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(RESQ_STORE_NAME)) {
        db.createObjectStore(RESQ_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open draft DB'));
    };
  });
}

async function saveMediaDrafts(items) {
  try {
    const db = await openMediaDraftDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(RESQ_STORE_NAME, 'readwrite');
      const store = tx.objectStore(RESQ_STORE_NAME);
      store.clear();

      items.forEach((item) => {
        store.put({
          id: item.id,
          mediaType: item.mediaType,
          name: item.file.name,
          type: item.file.type,
          lastModified: item.file.lastModified,
          blob: item.file,
        });
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    return;
  }
}

async function loadMediaDrafts() {
  try {
    const db = await openMediaDraftDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(RESQ_STORE_NAME, 'readonly');
      const store = tx.objectStore(RESQ_STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        const restored = rows.map((row) => ({
          id: row.id,
          mediaType: row.mediaType,
          file: new File([row.blob], row.name, {
            type: row.type || 'application/octet-stream',
            lastModified: row.lastModified || Date.now(),
          }),
        }));
        resolve(restored);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

async function clearMediaDrafts() {
  try {
    const db = await openMediaDraftDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(RESQ_STORE_NAME, 'readwrite');
      tx.objectStore(RESQ_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    return;
  }
}
