// Independent of participant recovery: no TTL, logout cleanup, or record deletion.
const DATABASE = 'rahmati-request-history';
const STORE = 'requests';
const ARCHIVE_URL = '/api/request-logs';
const memory = new Map();
const subscribers = new Set();
const status = {
    browserAvailable: false, diskAvailable: false, pendingCount: 0,
    persistent: false, error: null,
};
let databasePromise;
let syncing;
let syncTimer;
let notificationTimer;
let started = false;
let channel;

const notify = (broadcast = true) => {
    if (notificationTimer) return;
    notificationTimer = setTimeout(() => {
        notificationTimer = undefined;
        for (const callback of subscribers) callback();
        if (broadcast) channel?.postMessage('changed');
    }, 100);
};

const openDatabase = () => {
    if (!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
            if (!globalThis.indexedDB) {
                reject(new Error('Browser history storage is unavailable.'));
                return;
            }
            const request = indexedDB.open(DATABASE, 2);
            request.onupgradeneeded = () => {
                const existing = request.result.objectStoreNames.contains(STORE);
                const store = existing ? request.transaction.objectStore(STORE)
                    : request.result.createObjectStore(STORE, {keyPath: 'id'});
                if (!store.indexNames.contains('completedAt')) store.createIndex('completedAt', 'completedAt');
                if (!store.indexNames.contains('syncState')) store.createIndex('syncState', 'syncState');
                if (existing) {
                    const cursor = store.openCursor();
                    cursor.onsuccess = () => {
                        const entry = cursor.result;
                        if (!entry) return;
                        entry.update({...entry.value, syncState: entry.value.archived ? 'archived' : 'pending'});
                        entry.continue();
                    };
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => { db.close(); databasePromise = undefined; };
                status.browserAvailable = true;
                resolve(db);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Close other application tabs to open history storage.'));
        }).catch(error => {
            databasePromise = undefined;
            status.browserAvailable = false;
            status.error = error.message;
            throw error;
        });
    }
    return databasePromise;
};

const transaction = async (mode, operation) => {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        let result;
        try { result = operation(tx.objectStore(STORE)); }
        catch (error) { tx.abort(); reject(error); return; }
        tx.oncomplete = () => resolve(result?.result);
        tx.onerror = () => reject(tx.error ?? new Error('History storage operation failed.'));
        tx.onabort = () => reject(tx.error ?? new Error('History storage operation was interrupted.'));
    });
};

const localRecords = async () => {
    let saved = [];
    try { saved = await transaction('readonly', store => store.getAll()); }
    catch (error) { status.error = error.message; }
    return [...new Map([...saved, ...memory.values()].map(record => [record.id, record])).values()];
};

const pendingRecords = async () => {
    let pending = [];
    try { pending = await transaction('readonly', store => store.index('syncState').getAll('pending')); }
    catch (error) { status.error = error.message; }
    return [...new Map([...pending, ...memory.values()].filter(record => !record.archived)
        .map(record => [record.id, record])).values()];
};

const archiveFetch = async (options = {}) => {
    const response = await fetch(ARCHIVE_URL, {
        ...options, cache: 'no-store', credentials: 'same-origin',
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        const error = new Error(`Disk archive returned HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
    }
    const data = await response.json();
    if (data?.storage !== 'disk' && !Array.isArray(data?.ids)) {
        throw new Error('The disk archive is not configured on this server.');
    }
    return data;
};

const scheduleSync = () => {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
        syncTimer = undefined;
        void syncRequestLogs();
    }, 800);
};

export const recordRequestLog = async record => {
    const saved = {...record, archived: false, syncState: 'pending'};
    // Keep an in-memory rescue copy until either browser storage or disk accepts it.
    memory.set(saved.id, saved);
    try {
        await transaction('readwrite', store => store.put(saved));
        memory.delete(saved.id);
    } catch (error) {
        status.browserAvailable = false;
        status.error = error.message;
        console.error('Request history could not be saved in this browser:', error);
    }
    status.pendingCount += 1;
    notify();
    scheduleSync();
};

export const syncRequestLogs = () => {
    if (syncing) return syncing;
    syncing = (async () => {
        const pending = await pendingRecords();
        status.pendingCount = pending.length;
        if (!pending.length) return status.diskAvailable;
        try {
            // Keep individual batches well below the archive's 32 MiB body limit.
            const batches = [];
            let batch = [];
            let bytes = 0;
            for (const record of pending) {
                const size = new TextEncoder().encode(JSON.stringify(record)).length;
                if (batch.length && (bytes + size > 24 * 1024 * 1024 || batch.length >= 100)) {
                    batches.push(batch); batch = []; bytes = 0;
                }
                batch.push(record); bytes += size;
            }
            if (batch.length) batches.push(batch);
            let batchFailure;
            for (const records of batches) {
                let data;
                try { data = await archiveFetch({
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({records}),
                }); } catch (error) {
                    // An unusually large payload must not prevent other records
                    // reaching disk. Its complete local copy remains pending.
                    if (error.status === 413) { batchFailure = error; continue; }
                    throw error;
                }
                if (!Array.isArray(data.ids)) throw new Error('The disk archive did not acknowledge saved records.');
                const accepted = new Set(data.ids);
                const archived = records.filter(record => accepted.has(record.id))
                    .map(record => ({...record, archived: true, syncState: 'archived'}));
                // Acknowledge only after the server's durable commit. Replays are idempotent.
                try {
                    await transaction('readwrite', store => {
                        for (const record of archived) store.put(record);
                    });
                    for (const record of archived) memory.delete(record.id);
                } catch {
                    for (const record of archived) memory.set(record.id, record);
                }
                status.pendingCount = Math.max(0, status.pendingCount - archived.length);
            }
            status.diskAvailable = true;
            status.error = batchFailure?.message ?? (status.browserAvailable ? null : 'Browser storage is unavailable; records are archived on disk.');
            notify();
            return !batchFailure;
        } catch (error) {
            const changed = status.diskAvailable;
            status.diskAvailable = false;
            status.error = error.message;
            if (changed) notify();
            return false;
        }
    })().finally(() => { syncing = undefined; });
    return syncing;
};

export const getRequestLogs = async () => {
    const local = await localRecords();
    let disk = [];
    try {
        const data = await archiveFetch();
        if (!Array.isArray(data.records)) throw new Error('Invalid disk archive response.');
        disk = data.records.map(record => ({...record, archived: true}));
        status.diskAvailable = true;
        status.error = status.browserAvailable ? null : 'Browser storage is unavailable.';
    } catch (error) {
        status.diskAvailable = false;
        status.error = error.message;
    }
    const records = new Map(local.map(record => [record.id, record]));
    for (const record of disk) records.set(record.id, record);
    status.pendingCount = [...records.values()].filter(record => !record.archived).length;
    return [...records.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
};

export const getLogStorageStatus = async () => {
    try { status.persistent = await navigator.storage?.persisted?.() ?? false; }
    catch { status.persistent = false; }
    return {...status};
};

export const requestPersistentLogStorage = async () => {
    try { status.persistent = await navigator.storage?.persist?.() ?? false; }
    catch { status.persistent = false; }
    notify();
    return status.persistent;
};

export const subscribeRequestLogs = callback => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
};

export const startRequestLogStorage = () => {
    if (started || typeof window === 'undefined') return;
    started = true;
    void openDatabase().catch(() => {});
    if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('rahmati-request-history');
        channel.onmessage = () => notify(false);
    }
    // An offline archive must never cause retries of the experiment's HTTP request.
    window.addEventListener('online', () => { void syncRequestLogs(); });
    window.addEventListener('pagehide', () => { void syncRequestLogs(); });
    setInterval(() => { void syncRequestLogs(); }, 15000);
    void syncRequestLogs();
};
