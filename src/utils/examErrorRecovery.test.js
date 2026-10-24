import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import {submitTrialAnswer, setPhaseComplete, setVideoSeen, createProbeSession, getProbePhases, getSessionClusters} from '../api/probes.js';
import {readTrialProgress, writeTrialProgress, restoreTrialProgress, stageTrialSubmission, confirmTrialSubmission} from './trialProgress.js';

const payload = {cluster_id: 'cluster-1', answer: 'RIGHT', response_time: 412.75};
const scope = {token: 'exam-token', sessionId: 'exam-session', phaseId: 'baseline', phase: 2};
const response = (config, data, status = 200) => ({config, data, status, statusText: 'Test response', headers: {}});
const rejection = (config, status, data) => new axios.AxiosError('Request rejected', 'ERR_BAD_REQUEST', config, {}, {
    ...response(config, data, status), headers: {'retry-after': '0'},
});
const fixture = t => {
    const adapter = axios.defaults.adapter;
    const previousStorage = globalThis.localStorage;
    const values = new Map([['authToken', scope.token], ['currentSessionID', scope.sessionId],
        ['currentPhaseID', scope.phaseId], ['currentPhase', '2']]);
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
    globalThis.localStorage = storage;
    t.after(() => {
        axios.defaults.adapter = adapter;
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    });
    return storage;
};

test('the existing already-submitted-for-this-cluster response still confirms exactly one original answer', async t => {
    const storage = fixture(t);
    let progress = stageTrialSubmission(restoreTrialProgress(null, [{id: payload.cluster_id}, {id: 'cluster-2'}]).progress, payload);
    writeTrialProgress(storage, scope, progress);
    const sent = [];
    axios.defaults.adapter = async config => {
        sent.push(JSON.parse(config.data));
        throw rejection(config, 400, {details: 'For this cluster answer already submitted.'});
    };
    await submitTrialAnswer(scope.token, progress.pendingSubmission);
    progress = writeTrialProgress(storage, scope, confirmTrialSubmission(progress));
    assert.deepEqual(sent, [payload]);
    assert.deepEqual(progress.confirmedSubmissions, [payload]);
    assert.equal(progress.nextIndex, 1);
    assert.equal(progress.pendingSubmission, null);
    assert.deepEqual(restoreTrialProgress(progress, [{id: 'cluster-2'}, {id: payload.cluster_id}]).clusters, [{id: 'cluster-2'}]);
});

test('all 4xx duplicate acknowledgments preserve answer payload and all unrelated 4xx preserve the pending checkpoint', async t => {
    const storage = fixture(t);
    writeTrialProgress(storage, scope, stageTrialSubmission(restoreTrialProgress(null, [{id: payload.cluster_id}]).progress, payload));
    for (let status = 400; status < 500; status += 1) {
        axios.defaults.adapter = async config => {
            assert.deepEqual(JSON.parse(config.data), payload);
            throw rejection(config, status, {detail: 'The answer has already been submitted for this cluster.'});
        };
        await submitTrialAnswer(scope.token, payload);
        const failure = {detail: 'The request was rejected.'};
        let attempts = 0;
        axios.defaults.adapter = async config => { attempts += 1; throw rejection(config, status, failure); };
        await assert.rejects(submitTrialAnswer(scope.token, payload), error => error.response.status === status);
        assert.equal(attempts, [408, 425, 429].includes(status) ? 3 : 1);
        assert.deepEqual(readTrialProgress(storage, scope).pendingSubmission, payload);
        assert.equal(readTrialProgress(storage, scope).nextIndex, 0);
    }
});

test('a throttled answer retries identically and an already-saved acknowledgment resumes it', async t => {
    fixture(t);
    const sent = [];
    axios.defaults.adapter = async config => {
        sent.push(JSON.parse(config.data));
        if (sent.length === 1) throw rejection(config, 429, {detail: 'Request was throttled.'});
        throw rejection(config, 409, {message: 'Answer already submitted for this cluster.'});
    };
    await submitTrialAnswer(scope.token, payload);
    assert.deepEqual(sent, [payload, payload]);
});

test('phase and video duplicate responses preserve backend details and reject confirmations for other resources', async t => {
    fixture(t);
    axios.defaults.adapter = async config => { throw rejection(config, 409, {
        message: 'This session is already completed.', session_id: scope.sessionId, mark: 88,
    }); };
    const completed = await setPhaseComplete(scope.token, scope.sessionId);
    assert.equal(completed.data.mark, 88);
    await assert.rejects(setPhaseComplete(scope.token, 'different-session'), error => error.response.status === 409);
    axios.defaults.adapter = async config => { throw rejection(config, 400, {
        code: 'VIDEO_ALREADY_SEEN', session_video_id: 'video-1',
    }); };
    await setVideoSeen(scope.token, 'video-1');
    await assert.rejects(setVideoSeen(scope.token, 'video-2'), error => error.response.status === 400);
});

test('all probe requests have a finite timeout and session creation is not repeated automatically', async t => {
    fixture(t);
    axios.defaults.adapter = async config => {
        assert.equal(config.timeout, 15000);
        return response(config, {});
    };
    await getProbePhases(scope.token);
    await getSessionClusters(scope.token, scope.sessionId);
    await submitTrialAnswer(scope.token, payload);
    await setPhaseComplete(scope.token, scope.sessionId);
    await setVideoSeen(scope.token, 'video-1');
    await createProbeSession(scope.token, 'phase-next');
    let attempts = 0;
    axios.defaults.adapter = async config => {
        attempts += 1;
        throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config, {});
    };
    await assert.rejects(createProbeSession(scope.token, 'phase-next'), error => error.code === 'ERR_NETWORK');
    assert.equal(attempts, 1);
});
