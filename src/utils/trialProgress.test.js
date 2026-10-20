import assert from 'node:assert/strict';
import test from 'node:test';
import {
    readTrialProgress, writeTrialProgress, restoreTrialProgress, stageTrialSubmission,
    confirmTrialSubmission, isTrialProgressComplete,
} from './trialProgress.js';
import {PROBE_STORAGE_KEYS, TRIAL_PROGRESS_STORAGE_KEY} from './phaseFlow.js';

class MemoryStorage {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const scope = {token: 'participant-a', sessionId: 'session-a', phaseId: 'api-phase-a', phase: 2};
const clusters = [101, 102, 103].map(id => ({id}));
const payload = {cluster_id: 101, answer: 'RIGHT', response_time: 412};
const initial = () => restoreTrialProgress(null, clusters).progress;
const acceptedFirst = () => confirmTrialSubmission(stageTrialSubmission(initial(), payload));

test('persists the pending payload before confirmation, including the original reaction time', () => {
    const storage = new MemoryStorage();
    writeTrialProgress(storage, scope, initial());
    writeTrialProgress(storage, scope, stageTrialSubmission(initial(), payload));
    const reloaded = readTrialProgress(storage, scope);
    assert.equal(reloaded.nextIndex, 0);
    assert.deepEqual(reloaded.pendingSubmission, payload);
    writeTrialProgress(storage, scope, confirmTrialSubmission(reloaded));
    const confirmed = readTrialProgress(storage, scope);
    assert.equal(confirmed.nextIndex, 1);
    assert.equal(confirmed.pendingSubmission, null);
});

test('restores the same cluster and remaining order when the API changes its order', () => {
    const restored = restoreTrialProgress(acceptedFirst(), [clusters[2], clusters[0], clusters[1]]);
    assert.deepEqual(restored.clusters.map(c => c.id), [102, 103]);
    assert.deepEqual(restored.progress.clusterOrder, [101, 102, 103]);
    assert.equal(restored.progress.nextIndex, 1);
});

test('confirmed clusters stay excluded when the API returns only remaining clusters', () => {
    const restored = restoreTrialProgress(acceptedFirst(), [clusters[2], clusters[1]]);
    assert.deepEqual(restored.clusters.map(c => c.id), [102, 103]);
    assert.equal(restored.progress.nextIndex, 1);
});

test('new clusters append to the preserved order and unavailable metadata is not reused', () => {
    const restored = restoreTrialProgress(acceptedFirst(), [{id: 104}, clusters[2]]);
    assert.deepEqual(restored.clusters.map(c => c.id), [103, 104]);
    assert.deepEqual(restored.progress.clusterOrder, [101, 103, 104]);
    assert.throws(() => restoreTrialProgress(acceptedFirst(), []));
});

test('checkpoints are isolated by participant, session, API phase, and phase position', () => {
    const storage = new MemoryStorage();
    writeTrialProgress(storage, scope, acceptedFirst());
    for (const other of [
        {...scope, token: 'participant-b'}, {...scope, sessionId: 'session-b'},
        {...scope, phaseId: 'api-phase-b'}, {...scope, phase: 3},
    ]) assert.equal(readTrialProgress(storage, other), null);
    const otherParticipant = {...scope, token: 'participant-b'};
    writeTrialProgress(storage, otherParticipant, initial());
    assert.equal(readTrialProgress(storage, otherParticipant).nextIndex, 0);
    assert.equal(readTrialProgress(storage, scope), null);
});

test('each phase retains its own checkpoint for the current participant', () => {
    const storage = new MemoryStorage();
    for (const phase of [1, 2, 3, 4]) {
        writeTrialProgress(storage, {...scope, phase}, phase % 2 ? initial() : acceptedFirst());
    }
    for (const phase of [1, 2, 3, 4]) {
        assert.equal(readTrialProgress(storage, {...scope, phase}).nextIndex, phase % 2 ? 0 : 1);
    }
});

test('the last acknowledged answer preserves completion intent across refreshes', () => {
    const storage = new MemoryStorage();
    let progress = initial();
    for (const cluster of clusters) {
        progress = confirmTrialSubmission(stageTrialSubmission(progress, {...payload, cluster_id: cluster.id}));
    }
    writeTrialProgress(storage, scope, progress);
    assert.equal(isTrialProgressComplete(readTrialProgress(storage, scope)), true);
    writeTrialProgress(storage, scope, {...progress, phaseCompletionSaved: true});
    assert.equal(readTrialProgress(storage, scope).phaseCompletionSaved, true);
    assert.throws(() => confirmTrialSubmission(progress));
});

test('a failed storage write keeps the previous durable answer available', () => {
    const storage = new MemoryStorage();
    const pending = stageTrialSubmission(initial(), payload);
    writeTrialProgress(storage, scope, pending);
    storage.setItem = () => { throw new Error('Quota exceeded'); };
    assert.throws(() => writeTrialProgress(storage, scope, confirmTrialSubmission(pending)),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.deepEqual(readTrialProgress(storage, scope).pendingSubmission, payload);
    assert.equal(readTrialProgress(storage, scope).nextIndex, 0);
});

test('corrupt or unsupported stored checkpoints do not crash loading', () => {
    const storage = new MemoryStorage();
    for (const raw of ['{bad JSON', 'null', '{"version":42}', JSON.stringify({
        version: 1, ownerToken: scope.token,
        checkpoints: {'["session-a",2,"api-phase-a"]': {clusterOrder: [101], nextIndex: 99}},
    })]) {
        storage.setItem(TRIAL_PROGRESS_STORAGE_KEY, raw);
        assert.equal(readTrialProgress(storage, scope), null);
    }
    assert.equal(readTrialProgress(storage, null), null);
    assert.equal(isTrialProgressComplete({}), false);
    assert.throws(() => writeTrialProgress(storage, {...scope, token: ''}, initial()));
});

test('a damaged pending response recovers individual fields without changing clusters', () => {
    const storage = new MemoryStorage();
    writeTrialProgress(storage, scope, {...initial(), pendingSubmission: {cluster_id: 101, answer: 'RIGHT'}});
    assert.deepEqual(readTrialProgress(storage, scope).pendingSubmission, {...payload, response_time: 0});
    writeTrialProgress(storage, scope, {...initial(), pendingSubmission: {...payload, cluster_id: 999}});
    assert.equal(readTrialProgress(storage, scope).pendingSubmission, null);
    assert.equal(readTrialProgress(storage, scope).nextIndex, 0);
    assert.throws(() => stageTrialSubmission(initial(), {...payload, cluster_id: 999}));
});

test('duplicate IDs preserve their occurrence order without stalling progression', () => {
    const repeated = [clusters[0], {...clusters[0]}, clusters[2]];
    const progress = restoreTrialProgress(null, repeated).progress;
    const confirmed = confirmTrialSubmission(stageTrialSubmission(progress, payload));
    assert.deepEqual(restoreTrialProgress(confirmed, repeated).clusters.map(c => c.id), [101, 103]);
});

test('finishing an exam clears checkpoints without deleting unrelated storage', () => {
    const storage = new MemoryStorage();
    writeTrialProgress(storage, scope, acceptedFirst());
    storage.setItem('unrelated-setting', 'keep');
    PROBE_STORAGE_KEYS.forEach(key => storage.removeItem(key));
    assert.equal(storage.getItem(TRIAL_PROGRESS_STORAGE_KEY), null);
    assert.equal(storage.getItem('unrelated-setting'), 'keep');
});
