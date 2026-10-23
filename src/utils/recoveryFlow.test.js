import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import {submitTrialAnswer, findValidSession} from '../api/probes.js';
import {
    beginParticipantRecovery, readParticipantRecovery, activateParticipantRecovery,
    checkpointParticipantRecovery, getParticipantRecoveryRoute,
} from './participantRecovery.js';
import {
    restoreTrialProgress, readTrialProgress, writeTrialProgress,
    stageTrialSubmission, confirmTrialSubmission, isTrialProgressComplete,
} from './trialProgress.js';
import {APP_ROUTE} from './phaseFlow.js';

class MemoryStorage {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const identity = {subject_id: '0012', age: 28, gender: 'FEMALE', group: 2};
const scope = {token: 'original-token', sessionId: 'session-2', phaseId: 'baseline', phase: 2};
const clusters = [{id: 11}, {id: 12}, {id: 13}];
const setFlow = storage => {
    storage.setItem('currentPhase', '2');
    storage.setItem('currentPhaseID', 'baseline');
    storage.setItem('currentSessionID', 'session-2');
    storage.setItem('currentState', 'Exam');
};

test('re-registering after a lost POST response replays the exact payload in the original session', async t => {
    const storage = new MemoryStorage();
    const adapter = axios.defaults.adapter;
    t.after(() => { axios.defaults.adapter = adapter; });
    beginParticipantRecovery(storage, identity, scope.token);
    setFlow(storage);
    let progress = restoreTrialProgress(null, clusters).progress;
    const first = {cluster_id: 11, answer: 'LEFT', response_time: 0};
    progress = confirmTrialSubmission(stageTrialSubmission(progress, first));
    const interrupted = {cluster_id: 12, answer: 'RIGHT', response_time: 432.75};
    writeTrialProgress(storage, scope, stageTrialSubmission(progress, interrupted));

    // Someone else can use this browser before the interrupted participant returns.
    beginParticipantRecovery(storage, {...identity, subject_id: 'another'}, 'another-token');
    const recovered = activateParticipantRecovery(storage, readParticipantRecovery(storage, identity));
    assert.equal(getParticipantRecoveryRoute(recovered), APP_ROUTE.TRIAL);
    assert.equal(storage.getItem('currentSessionID'), scope.sessionId);
    assert.equal(storage.getItem('authToken'), scope.token);
    progress = readTrialProgress(storage, scope);
    assert.deepEqual(progress.pendingSubmission, interrupted);
    assert.deepEqual(progress.confirmedSubmissions, [first]);

    const sent = [];
    axios.defaults.adapter = async config => {
        sent.push({payload: JSON.parse(config.data), token: config.headers.Authorization});
        throw {response: {status: 400, data: {details: 'For this cluster answer already submitted.'}}};
    };
    await submitTrialAnswer(scope.token, progress.pendingSubmission);
    writeTrialProgress(storage, scope, confirmTrialSubmission(progress));
    assert.deepEqual(sent, [{payload: interrupted, token: `token ${scope.token}`}]);
    const remaining = restoreTrialProgress(readTrialProgress(storage, scope), [clusters[2], clusters[0], clusters[1]]);
    assert.deepEqual(remaining.clusters, [clusters[2]]);
    assert.deepEqual(remaining.progress.confirmedSubmissions, [first, interrupted]);
});

test('unrelated 4xx and connection failures keep the durable answer pending', async t => {
    const storage = new MemoryStorage();
    const adapter = axios.defaults.adapter;
    t.after(() => { axios.defaults.adapter = adapter; });
    beginParticipantRecovery(storage, identity, scope.token);
    setFlow(storage);
    const payload = {cluster_id: 11, answer: 'RIGHT', response_time: 378};
    writeTrialProgress(storage, scope, stageTrialSubmission(restoreTrialProgress(null, clusters).progress, payload));
    for (const failure of [
        {response: {status: 403, data: {detail: 'Permission denied.'}}},
        {code: 'ERR_NETWORK', request: {}},
        {response: {status: 500, data: {detail: 'Answer already submitted.'}}},
    ]) {
        axios.defaults.adapter = async () => { throw failure; };
        await assert.rejects(submitTrialAnswer(scope.token, payload), error => error === failure);
        assert.deepEqual(readTrialProgress(storage, scope).pendingSubmission, payload);
        assert.equal(readTrialProgress(storage, scope).nextIndex, 0);
    }
});

test('all acknowledged answers resume phase completion without repeating a cluster', () => {
    const storage = new MemoryStorage();
    beginParticipantRecovery(storage, identity, scope.token);
    setFlow(storage);
    let progress = restoreTrialProgress(null, clusters).progress;
    for (const cluster of clusters) {
        progress = confirmTrialSubmission(stageTrialSubmission(progress, {
            cluster_id: cluster.id, answer: 'LEFT', response_time: 222,
        }));
    }
    writeTrialProgress(storage, scope, progress);
    activateParticipantRecovery(storage, readParticipantRecovery(storage, identity));
    assert.equal(isTrialProgressComplete(readTrialProgress(storage, scope)), true);
    assert.equal(readTrialProgress(storage, scope).confirmedSubmissions.length, 3);
    storage.setItem('currentPhase', '3');
    storage.setItem('currentState', 'instructions');
    checkpointParticipantRecovery(storage);
    assert.equal(getParticipantRecoveryRoute(readParticipantRecovery(storage, identity)), APP_ROUTE.INSTRUCTIONS);
});

test('session preparation stores the new session and its phase together for recovery', async t => {
    const storage = new MemoryStorage();
    const adapter = axios.defaults.adapter;
    const previousStorage = globalThis.localStorage;
    t.after(() => {
        axios.defaults.adapter = adapter;
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    });
    globalThis.localStorage = storage;
    beginParticipantRecovery(storage, identity, scope.token);
    axios.defaults.adapter = async config => ({
        data: config.method === 'get'
            ? [{id: 'positive', name: 'خلق مثبت', is_allowed: true, is_passed: false, has_video: true, video_seen: false}]
            : {session_id: 'mood-session', cluster_count: 20},
        status: 200, statusText: 'OK', headers: {}, config,
    });
    await findValidSession(scope.token, {phase: 3, state: 'Exam'});
    const record = readParticipantRecovery(storage, identity);
    assert.equal(record.snapshot.currentSessionID, 'mood-session');
    assert.equal(record.snapshot.currentPhase, '3');
    assert.equal(record.snapshot.currentPhaseID, 'positive');
    assert.equal(record.snapshot.currentPhaseHasVideo, 'true');
    assert.equal(getParticipantRecoveryRoute(record), APP_ROUTE.TRIAL);
});

test('a delayed session response cannot replace another participant\'s active session', async t => {
    const storage = new MemoryStorage();
    const adapter = axios.defaults.adapter;
    const previousStorage = globalThis.localStorage;
    t.after(() => {
        axios.defaults.adapter = adapter;
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    });
    globalThis.localStorage = storage;
    beginParticipantRecovery(storage, identity, scope.token);
    let resolveSession;
    let notifySessionStarted;
    const sessionStarted = new Promise(resolve => { notifySessionStarted = resolve; });
    axios.defaults.adapter = async config => {
        if (config.method === 'get') return {
            data: [{id: 'positive', is_allowed: true, is_passed: false}],
            status: 200, statusText: 'OK', headers: {}, config,
        };
        notifySessionStarted();
        return new Promise(resolve => { resolveSession = data => resolve({
            data, status: 200, statusText: 'OK', headers: {}, config,
        }); });
    };
    const preparing = findValidSession(scope.token, {phase: 3, state: 'Exam'});
    await sessionStarted;
    const other = {...identity, subject_id: 'other'};
    beginParticipantRecovery(storage, other, 'other-token');
    resolveSession({session_id: 'late-session', cluster_count: 20});
    await assert.rejects(preparing, /session changed/);
    assert.equal(storage.getItem('authToken'), 'other-token');
    assert.equal(storage.getItem('currentSessionID'), null);
    assert.equal(readParticipantRecovery(storage, other).snapshot.currentSessionID, null);
});
