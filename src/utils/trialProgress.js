import {TRIAL_PROGRESS_STORAGE_KEY} from './phaseFlow.js';
import {createTrialSubmission} from './trialSubmission.js';

const VERSION = 1;
const validId = id => (typeof id === 'string' && id.trim() !== '')
    || (typeof id === 'number' && Number.isFinite(id));
const idKey = id => String(id);
const scopeKey = scope => JSON.stringify([String(scope.sessionId), scope.phase, String(scope.phaseId ?? '')]);
const validScope = scope => typeof scope?.token === 'string' && scope.token.length > 0
    && validId(scope.sessionId) && [1, 2, 3, 4].includes(scope.phase);

const readStore = (storage) => {
    const raw = storage.getItem(TRIAL_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    try {
        const store = JSON.parse(raw);
        return store?.version === VERSION && store.checkpoints && typeof store.checkpoints === 'object'
            ? store : null;
    } catch {
        return null;
    }
};

const normalizeProgress = (progress) => {
    if (!Array.isArray(progress?.clusterOrder) || !progress.clusterOrder.length
        || !progress.clusterOrder.every(validId)
        || !Number.isInteger(progress.nextIndex) || progress.nextIndex < 0
        || progress.nextIndex > progress.clusterOrder.length) return null;

    const currentId = progress.clusterOrder[progress.nextIndex];
    const saved = progress.pendingSubmission;
    const pendingSubmission = saved && currentId !== undefined && validId(saved.cluster_id)
        && idKey(saved.cluster_id) === idKey(currentId)
        ? createTrialSubmission({clusterId: saved.cluster_id, previousSubmission: saved}).payload
        : null;

    return {
        clusterOrder: [...progress.clusterOrder],
        nextIndex: progress.nextIndex,
        pendingSubmission,
        phaseCompletionSaved: progress.nextIndex === progress.clusterOrder.length
            && progress.phaseCompletionSaved === true,
    };
};

export const readTrialProgress = (storage, scope) => {
    if (!validScope(scope)) return null;
    const store = readStore(storage);
    if (!store || store.ownerToken !== scope.token) return null;
    return normalizeProgress(store.checkpoints[scopeKey(scope)]);
};

export const writeTrialProgress = (storage, scope, progress) => {
    try {
        if (!validScope(scope)) throw new Error('Invalid checkpoint session.');
        const normalized = normalizeProgress(progress);
        if (!normalized) throw new Error('Invalid trial checkpoint.');
        const previous = readStore(storage);
        const checkpoints = previous?.ownerToken === scope.token ? {...previous.checkpoints} : {};
        checkpoints[scopeKey(scope)] = normalized;
        storage.setItem(TRIAL_PROGRESS_STORAGE_KEY, JSON.stringify({
            version: VERSION, ownerToken: scope.token, checkpoints,
        }));
        return normalized;
    } catch (cause) {
        const error = new Error('The trial checkpoint could not be saved.', {cause});
        error.code = 'TRIAL_PROGRESS_WRITE_FAILED';
        throw error;
    }
};

export const isTrialProgressComplete = progress => Boolean(Array.isArray(progress?.clusterOrder) && progress.clusterOrder.length
    && progress.nextIndex === progress.clusterOrder.length);

// Restore the remaining sequence by ID rather than by the API's current array
// index. Confirmed answers are excluded even if the API returns them again.
export const restoreTrialProgress = (saved, clusters) => {
    if (!Array.isArray(clusters) || !clusters.every(cluster => validId(cluster?.id))) {
        throw new Error('The API returned invalid clusters.');
    }
    const progress = normalizeProgress(saved);
    const queues = new Map();
    clusters.forEach(cluster => {
        const key = idKey(cluster.id);
        if (!queues.has(key)) queues.set(key, []);
        queues.get(key).push(cluster);
    });

    const confirmed = progress?.clusterOrder.slice(0, progress.nextIndex) ?? [];
    confirmed.forEach(id => queues.get(idKey(id))?.shift());
    const remaining = [];
    (progress?.clusterOrder.slice(progress.nextIndex) ?? []).forEach(id => {
        const cluster = queues.get(idKey(id))?.shift();
        if (cluster) remaining.push(cluster);
    });
    clusters.forEach(cluster => {
        const queue = queues.get(idKey(cluster.id));
        if (queue?.[0] === cluster) remaining.push(queue.shift());
    });

    if (!remaining.length) throw new Error('No remaining trials were returned for this phase.');
    return {
        clusters: remaining,
        progress: {
            clusterOrder: [...confirmed, ...remaining.map(cluster => cluster.id)],
            nextIndex: confirmed.length,
            pendingSubmission: null,
            phaseCompletionSaved: false,
        },
    };
};

export const stageTrialSubmission = (progress, payload) => {
    const currentId = progress?.clusterOrder[progress.nextIndex];
    if (!validId(currentId) || !validId(payload?.cluster_id) || idKey(currentId) !== idKey(payload.cluster_id)) {
        throw new Error('The answer does not match the checkpoint cluster.');
    }
    return {...progress, pendingSubmission: {...payload}};
};

export const confirmTrialSubmission = (progress) => {
    if (!progress?.pendingSubmission || isTrialProgressComplete(progress)) {
        throw new Error('No pending answer is available to confirm.');
    }
    return {...progress, nextIndex: progress.nextIndex + 1, pendingSubmission: null};
};
