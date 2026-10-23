import {APP_ROUTE, PHASE, PROBE_STORAGE_KEYS} from './phaseFlow.js';

export const PARTICIPANT_RECOVERY_STORAGE_KEY = 'probeParticipantRecovery';
export const ACTIVE_PARTICIPANT_STORAGE_KEY = 'activeProbeParticipant';
export const PARTICIPANT_RECOVERY_LIFETIME_MS = 12 * 60 * 60 * 1000;

const VERSION = 1;
const FLOW_UPDATE_STORAGE_KEY = 'probePendingFlowUpdate';
const RUNTIME_KEYS = PROBE_STORAGE_KEYS.filter(key => ![
    ACTIVE_PARTICIPANT_STORAGE_KEY, FLOW_UPDATE_STORAGE_KEY,
].includes(key));
const FLOW_KEYS = [
    'currentState', 'currentPhase', 'currentPhaseID', 'currentSessionID', 'currentClusterLength',
    'currentPhaseName', 'currentPhaseHasVideo', 'currentPhaseVideoSeen',
];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const validToken = token => typeof token === 'string' && token.trim().length > 0;

const storageOperation = operation => {
    try {
        return operation();
    } catch (cause) {
        if (cause?.code === 'TRIAL_PROGRESS_WRITE_FAILED') throw cause;
        const error = new Error('The participant recovery checkpoint could not be saved.', {cause});
        error.code = 'TRIAL_PROGRESS_WRITE_FAILED';
        throw error;
    }
};

const parseJSON = raw => {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const normalizeInteger = value => {
    if ((typeof value !== 'string' && typeof value !== 'number')
        || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
};

const normalizeIdentity = values => {
    if (!isObject(values) || typeof values.subject_id !== 'string') return null;
    const subject_id = values.subject_id.trim();
    const age = normalizeInteger(values.age);
    const group = normalizeInteger(values.group);
    const gender = typeof values.gender === 'string' ? values.gender.trim().toUpperCase() : '';
    if (!subject_id || age === null || age < 1 || age > 120 || group === null || group < 0
        || !['MALE', 'FEMALE'].includes(gender)) return null;
    return {subject_id, age, gender, group};
};

const identityKey = identity => JSON.stringify([
    identity.subject_id, identity.age, identity.gender, identity.group,
]);

const normalizeSnapshot = (snapshot, token) => {
    if (!isObject(snapshot) || snapshot.authToken !== token) return null;
    const result = {};
    for (const key of RUNTIME_KEYS) {
        const value = hasOwn(snapshot, key) ? snapshot[key] : null;
        if (value !== null && typeof value !== 'string') return null;
        result[key] = value;
    }
    return result;
};

const normalizeRecord = (value, now) => {
    if (!isObject(value)) return null;
    const identity = normalizeIdentity(value.identity);
    if (!identity || !validToken(value.token)
        || !Number.isFinite(value.createdAt) || value.createdAt < 0 || value.createdAt > now
        || value.expiresAt !== value.createdAt + PARTICIPANT_RECOVERY_LIFETIME_MS
        || value.expiresAt <= now) return null;
    const snapshot = normalizeSnapshot(value.snapshot, value.token);
    return snapshot ? {
        identity, token: value.token, createdAt: value.createdAt, expiresAt: value.expiresAt, snapshot,
    } : null;
};

const writeVault = (storage, records) => {
    if (Object.keys(records).length) {
        const serialized = JSON.stringify({version: VERSION, records});
        if (storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY) !== serialized) {
            storage.setItem(PARTICIPANT_RECOVERY_STORAGE_KEY, serialized);
        }
    } else if (storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY) !== null) {
        storage.removeItem(PARTICIPANT_RECOVERY_STORAGE_KEY);
    }
};

const clearRuntime = storage => {
    for (const key of RUNTIME_KEYS) storage.removeItem(key);
    storage.removeItem(FLOW_UPDATE_STORAGE_KEY);
};

// The vault and its active pointer are untrusted browser data. Prune invalid
// entries on every read so an old token cannot regain a fresh twelve-hour TTL.
const readVault = (storage, now) => {
    if (!Number.isFinite(now) || now < 0) throw new Error('Invalid checkpoint time.');
    const raw = storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY);
    const parsed = raw === null ? null : parseJSON(raw);
    const records = {};
    if (parsed?.version === VERSION && isObject(parsed.records)) {
        for (const [key, value] of Object.entries(parsed.records)) {
            const record = normalizeRecord(value, now);
            if (record && key === identityKey(record.identity)) records[key] = record;
        }
    }
    writeVault(storage, records);

    const activeRaw = storage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY);
    const candidate = activeRaw === null ? null : parseJSON(activeRaw);
    const active = isObject(candidate) && typeof candidate.key === 'string'
        && hasOwn(records, candidate.key) && records[candidate.key].token === candidate.token
        ? {key: candidate.key, token: candidate.token} : null;
    let activeExpired = false;
    if (activeRaw !== null && !active) {
        // Clear expired runtime together with its pointer: otherwise a second
        // direct visit could see a token/checkpoint without the expired owner.
        const pointerToken = isObject(candidate) && validToken(candidate.token) ? candidate.token : null;
        const runtimeToken = storage.getItem('authToken');
        const unrelatedRuntime = pointerToken && validToken(runtimeToken) && runtimeToken !== pointerToken;
        if (!unrelatedRuntime) {
            clearRuntime(storage);
            activeExpired = true;
        }
        storage.removeItem(ACTIVE_PARTICIPANT_STORAGE_KEY);
    }
    return {records, active, activeExpired};
};

const runtimeSnapshot = storage => Object.fromEntries(
    RUNTIME_KEYS.map(key => [key, storage.getItem(key)]),
);

const restoreRuntime = (storage, record) => {
    storage.removeItem(FLOW_UPDATE_STORAGE_KEY);
    for (const key of RUNTIME_KEYS) {
        const value = record.snapshot[key];
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
    }
    storage.setItem(ACTIVE_PARTICIPANT_STORAGE_KEY, JSON.stringify({
        key: identityKey(record.identity), token: record.token,
    }));
};

const normalizeFlowUpdates = updates => {
    if (!isObject(updates) || !Object.keys(updates).length) return null;
    const normalized = {};
    for (const [key, value] of Object.entries(updates)) {
        if (!FLOW_KEYS.includes(key) || (value !== null && typeof value !== 'string')) return null;
        if (value !== null) {
            if (key === 'currentState' && !['Exam', 'instructions', 'result'].includes(value)) return null;
            if (key === 'currentPhase' && !Object.values(PHASE).includes(Number(value))) return null;
            if (['currentPhaseID', 'currentSessionID'].includes(key)
                && (!value.trim() || ['null', 'undefined'].includes(value.trim()))) return null;
            if (key === 'currentClusterLength' && (normalizeInteger(value) === null || Number(value) < 0)) return null;
            if (['currentPhaseHasVideo', 'currentPhaseVideoSeen'].includes(key)
                && !['true', 'false'].includes(value)) return null;
        }
        normalized[key] = value;
    }
    return normalized;
};

const applyFlowUpdates = (storage, updates) => {
    for (const [key, value] of Object.entries(updates)) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
    }
};

const readFlowUpdate = (storage, record, now) => {
    const raw = storage.getItem(FLOW_UPDATE_STORAGE_KEY);
    if (raw === null) return null;
    const journal = parseJSON(raw);
    const updates = normalizeFlowUpdates(journal?.updates);
    if (!updates || !validToken(journal?.token) || journal.token !== storage.getItem('authToken')
        || !Number.isFinite(journal.expiresAt) || journal.expiresAt <= now
        || journal.expiresAt > now + PARTICIPANT_RECOVERY_LIFETIME_MS
        || (record && (record.token !== journal.token || record.expiresAt !== journal.expiresAt))) {
        storage.removeItem(FLOW_UPDATE_STORAGE_KEY);
        return null;
    }
    return updates;
};

const checkpoint = (storage, now) => {
    const {records, active} = readVault(storage, now);
    const record = active ? records[active.key] : null;
    const updates = readFlowUpdate(storage, record, now);
    if (updates) applyFlowUpdates(storage, updates);
    if (!active) {
        // Legacy sessions have no participant vault; replay is still token and
        // time scoped, and successful raw application completes their journal.
        if (updates) storage.removeItem(FLOW_UPDATE_STORAGE_KEY);
        return null;
    }
    const snapshot = normalizeSnapshot(runtimeSnapshot(storage), record.token);
    if (!snapshot) {
        // A changed runtime token belongs to another participant. Keep this
        // participant's last durable snapshot without adopting the new data.
        storage.removeItem(ACTIVE_PARTICIPANT_STORAGE_KEY);
        return null;
    }
    const updated = {...record, snapshot};
    records[active.key] = updated;
    writeVault(storage, records);
    if (updates) storage.removeItem(FLOW_UPDATE_STORAGE_KEY);
    return updated;
};

export const readParticipantRecovery = (storage, values, now = Date.now()) => storageOperation(() => {
    const {records} = readVault(storage, now);
    const identity = normalizeIdentity(values);
    return identity ? records[identityKey(identity)] ?? null : null;
});

export const pruneParticipantRecovery = (storage, now = Date.now()) => storageOperation(() => {
    const {records, activeExpired} = readVault(storage, now);
    const nextExpiryAt = Object.values(records).reduce(
        (earliest, record) => earliest === null ? record.expiresAt : Math.min(earliest, record.expiresAt),
        null,
    );
    return {activeExpired, nextExpiryAt};
});

export const checkpointParticipantRecovery = (storage, now = Date.now()) => storageOperation(
    () => checkpoint(storage, now),
);

export const commitParticipantFlow = (storage, updates, now = Date.now()) => storageOperation(() => {
    const normalized = normalizeFlowUpdates(updates);
    if (!normalized) throw new Error('Invalid participant flow update.');
    const hadActive = storage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY) !== null;
    const record = checkpoint(storage, now);
    const token = storage.getItem('authToken');
    if (!validToken(token) || (hadActive && !record)) throw new Error('The participant recovery session is no longer valid.');
    storage.setItem(FLOW_UPDATE_STORAGE_KEY, JSON.stringify({
        token, expiresAt: record?.expiresAt ?? now + PARTICIPANT_RECOVERY_LIFETIME_MS, updates: normalized,
    }));
    applyFlowUpdates(storage, normalized);
    return checkpoint(storage, now);
});

export const activateParticipantRecovery = (storage, record, now = Date.now()) => storageOperation(() => {
    // Save first, even when reactivating the same participant: the caller may
    // have read its record before the latest answer reached localStorage.
    checkpoint(storage, now);
    const {records} = readVault(storage, now);
    const requested = normalizeRecord(record, now);
    if (!requested) return null;
    const latest = records[identityKey(requested.identity)];
    if (!latest || latest.token !== requested.token || latest.createdAt !== requested.createdAt) return null;
    restoreRuntime(storage, latest);
    return latest;
});

export const beginParticipantRecovery = (storage, values, token, now = Date.now()) => storageOperation(() => {
    const identity = normalizeIdentity(values);
    if (!identity || !validToken(token)) throw new Error('Invalid participant recovery identity or token.');
    checkpoint(storage, now);
    const {records} = readVault(storage, now);
    const key = identityKey(identity);
    const previous = records[key];
    if (previous) {
        if (previous.token !== token) throw new Error('This participant already has a recovery token.');
        restoreRuntime(storage, previous);
        return previous;
    }

    const snapshot = Object.fromEntries(RUNTIME_KEYS.map(runtimeKey => [runtimeKey, null]));
    snapshot.authToken = token;
    const record = {
        identity, token, createdAt: now, expiresAt: now + PARTICIPANT_RECOVERY_LIFETIME_MS, snapshot,
    };
    records[key] = record;
    // Persist both participants before touching the old runtime. If a later
    // storage operation fails, signup can still recover either saved record.
    writeVault(storage, records);
    restoreRuntime(storage, record);
    return record;
});

export const forgetParticipantRecovery = (storage, now = Date.now()) => storageOperation(() => {
    const {records, active} = readVault(storage, now);
    if (active) {
        delete records[active.key];
        writeVault(storage, records);
        storage.removeItem(ACTIVE_PARTICIPANT_STORAGE_KEY);
    }
});

export const getParticipantRecoveryRoute = record => {
    const snapshot = record?.snapshot;
    const sessionId = snapshot?.currentSessionID;
    const phase = Number(snapshot?.currentPhase);
    if (typeof sessionId !== 'string' || !sessionId.trim()
        || ['null', 'undefined'].includes(sessionId.trim())
        || !Object.values(PHASE).includes(phase)) return null;
    if (snapshot.currentState === 'Exam') return APP_ROUTE.TRIAL;
    if (snapshot.currentState === 'instructions') return APP_ROUTE.INSTRUCTIONS;
    if (snapshot.currentState === 'result') return phase === PHASE.MOOD_SECOND ? APP_ROUTE.FINAL : APP_ROUTE.REPORT;
    return null;
};
