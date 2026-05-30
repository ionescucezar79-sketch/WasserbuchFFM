// db.js — IndexedDB layer v3 (multi-site, dynamic meters)
const DB_NAME    = 'brunnen-tagebuch';
const DB_VERSION = 2;           // bumped for schema change
const SITES      = 'sites';
const ENTRIES    = 'entries';

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db  = e.target.result;
      const old = e.oldVersion;

      // ── Sites store (new) ──
      if (!db.objectStoreNames.contains(SITES)) {
        db.createObjectStore(SITES, { keyPath: 'id', autoIncrement: true });
      }

      // ── Entries store ──
      if (!db.objectStoreNames.contains(ENTRIES)) {
        const es = db.createObjectStore(ENTRIES, { keyPath: 'id', autoIncrement: true });
        es.createIndex('siteId', 'siteId', { unique: false });
        es.createIndex('ts',     'ts',     { unique: false });
      } else if (old < 2) {
        // Migrate v1 entries: add siteId = -1 (legacy)
        const tx = e.target.transaction;
        const store = tx.objectStore(ENTRIES);
        store.openCursor().onsuccess = ev => {
          const cursor = ev.target.result;
          if (!cursor) return;
          const rec = cursor.value;
          if (rec.siteId === undefined) {
            rec.siteId   = -1;           // will be linked to migrated site
            rec.readings = {
              br20: rec.br20, br21: rec.br21,
              br23: rec.br23, br24: rec.br24, br33: rec.br33
            };
            cursor.update(rec);
          }
          cursor.continue();
        };
      }
    };

    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = ()  => reject(req.error);
  });
}

// ── SITES ──────────────────────────────────────────
export async function getAllSites() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(SITES, 'readonly').objectStore(SITES).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export async function getSite(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(SITES, 'readonly').objectStore(SITES).get(id);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export async function saveSite(site) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const store = db.transaction(SITES, 'readwrite').objectStore(SITES);
    const req   = site.id ? store.put(site) : store.add(site);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export async function deleteSite(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(SITES, 'readwrite').objectStore(SITES).delete(id);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

// ── ENTRIES ────────────────────────────────────────
export async function getEntriesBySite(siteId) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(ENTRIES, 'readonly');
    const idx = tx.objectStore(ENTRIES).index('siteId');
    const req = idx.getAll(siteId);
    req.onsuccess = () => res(req.result.sort((a,b) => a.ts - b.ts));
    req.onerror   = () => rej(req.error);
  });
}

export async function getAllEntries() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(ENTRIES,'readonly').objectStore(ENTRIES).index('ts').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export async function addEntry(entry) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(ENTRIES,'readwrite').objectStore(ENTRIES)
                  .add({ ...entry, ts: Date.now() });
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export async function updateEntry(entry) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(ENTRIES,'readwrite').objectStore(ENTRIES).put(entry);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

export async function deleteEntry(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(ENTRIES,'readwrite').objectStore(ENTRIES).delete(id);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

export async function deleteEntriesBySite(siteId) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx    = db.transaction(ENTRIES, 'readwrite');
    const store = tx.objectStore(ENTRIES);
    const idx   = store.index('siteId');
    const req   = idx.openCursor(IDBKeyRange.only(siteId));
    req.onsuccess = ev => {
      const cursor = ev.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

export async function clearAllEntries() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(ENTRIES,'readwrite').objectStore(ENTRIES).clear();
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

// ── MIGRATION from v1 localStorage ─────────────────
export async function migrateFromLocalStorage() {
  const old = localStorage.getItem('brunnen-tagebuch-v1');
  if (!old) return 0;
  try {
    const arr = JSON.parse(old);
    if (!arr.length) return 0;
    const sites = await getAllSites();
    if (sites.length > 0) return 0;

    // Create legacy site
    const siteId = await saveSite({
      name: 'Güterplatz',
      meters: [
        { key:'br20', label:'Br.20', serial:'' },
        { key:'br21', label:'Br.21', serial:'' },
        { key:'br23', label:'Br.23', serial:'' },
        { key:'br24', label:'Br.24', serial:'' },
        { key:'br33', label:'Br.33', serial:'' },
      ]
    });

    for (const e of arr) {
      await addEntry({
        siteId,
        datum:    e.datum,
        uhr:      e.uhr   || '',
        note:     e.note  || '',
        readings: { br20:e.br20, br21:e.br21, br23:e.br23, br24:e.br24, br33:e.br33 },
        ts:       e.ts || Date.now()
      });
    }
    localStorage.removeItem('brunnen-tagebuch-v1');
    return arr.length;
  } catch (e) {
    console.error('migrateFromLocalStorage error:', e);
    return 0;
  }
}
