import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import {reconcileMoodSession} from '../api/probes.js';
import {validateMoodHandoff, mergeMoodSessionProgress, getMoodHandoffFlow, commitMoodHandoff} from './moodHandoff.js';
import {APP_ROUTE} from './phaseFlow.js';
import {beginParticipantRecovery, readParticipantRecovery, checkpointParticipantRecovery} from './participantRecovery.js';
import {readTrialProgress, writeTrialProgress} from './trialProgress.js';

const proof = position => ({
    session_id: `session-${position}`, is_completed: true,
    cluster_count: 2, answered_count: 2, mark: 100, minimum_mark: position === 1 ? 88 : 0,
});
const phases = completed => ['practice', 'baseline', 'positive', 'negative'].map((id, index) => ({
    id, name: id, position: index + 1, is_allowed: index <= completed,
    is_passed: index < completed, has_video: index >= 2, video_seen: index < completed && index >= 2,
    completion: index < completed ? proof(index + 1) : null,
}));
const source = (position = 3, completed = true, answered = 2) => ({
    session_id: `session-${position}`, phase_id: position === 3 ? 'positive' : 'negative',
    position, is_completed: completed, cluster_count: 2, answered_count: answered,
});
const session = (position = 4) => ({
    session_id: `session-${position}`, phase_id: position === 3 ? 'positive' : 'negative', position,
    name: position === 3 ? 'positive' : 'negative', has_video: true, video_seen: true,
    cluster_count: 3, answered_count: 1, cluster_order: ['a', 'b', 'c'],
    confirmed_submissions: [{cluster_id: 'a', answer: 'LEFT', response_time: 350}],
});
const instructions = () => ({
    state: 'instructions', source: source(), phases: phases(3), session: null,
    next_phase_id: 'negative', mark: 100,
});
const trial = () => ({...instructions(), state: 'trial', session: session()});
const complete = () => ({
    state: 'complete', source: source(4), phases: phases(4), session: null, next_phase_id: null, mark: 100,
});
const initial = () => ({
    clusterOrder: ['a', 'b', 'c'], nextIndex: 1,
    confirmedSubmissions: [{cluster_id: 'a', answer: 'LEFT', response_time: 350}],
    pendingSubmission: {cluster_id: 'b', answer: 'RIGHT', response_time: 432.75}, phaseCompletionSaved: false,
});
const conflict = error => error.code === 'MOOD_HANDOFF_CONFLICT';

class MemoryStorage {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}
const fixture = t => {
    const previousStorage = globalThis.localStorage;
    const previousAdapter = axios.defaults.adapter;
    const storage = new MemoryStorage();
    storage.setItem('authToken', 'handoff-token');
    storage.setItem('currentSessionID', 'session-3');
    storage.setItem('currentPhaseID', 'positive');
    storage.setItem('currentPhase', '4');
    storage.setItem('currentState', 'instructions');
    globalThis.localStorage = storage;
    t.after(() => {
        axios.defaults.adapter = previousAdapter;
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    });
    return storage;
};

test('verified phase-three completion preserves the phase-four instructions before any new trial session', () => {
    const data = instructions();
    assert.equal(validateMoodHandoff(data, 'session-3'), data);
    assert.deepEqual(getMoodHandoffFlow(data), {
        updates: {currentPhase: '4', currentState: 'instructions'}, route: APP_ROUTE.INSTRUCTIONS,
    });
    assert.equal(data.session, null);
});

test('only complete, fully answered passing evidence for all four phases can reach Final', () => {
    const data = complete();
    assert.equal(validateMoodHandoff(data, 'session-4'), data);
    assert.deepEqual(getMoodHandoffFlow(data), {
        updates: {currentPhase: '4', currentState: 'result'}, route: APP_ROUTE.FINAL,
    });
    for (let index = 0; index < 4; index += 1) {
        for (const damage of [
            phase => { phase.completion = null; },
            phase => { phase.completion.answered_count = 1; },
            phase => { phase.completion.cluster_count = 0; phase.completion.answered_count = 0; },
            phase => { phase.completion.mark = -1; },
            phase => { phase.completion.mark = 0; phase.completion.minimum_mark = 88; },
            phase => { phase.is_passed = 'true'; },
        ]) {
            const damaged = complete();
            damage(damaged.phases[index]);
            assert.throws(() => validateMoodHandoff(damaged, 'session-4'), conflict);
        }
    }
});

test('malformed or unrelated server evidence cannot change a source session or skip a phase', () => {
    for (const damage of [
        data => { data.source.session_id = 'another-session'; },
        data => { data.source.position = 2; },
        data => { data.source.is_completed = false; },
        data => { data.source.answered_count = 1; },
        data => { data.phases[2].completion.session_id = 'older-session'; },
        data => { data.phases[3].id = data.phases[2].id; },
        data => { data.phases.pop(); },
        data => { data.next_phase_id = 'positive'; },
        data => { data.phases[3].is_allowed = false; },
    ]) {
        const data = instructions();
        damage(data);
        assert.throws(() => validateMoodHandoff(data, 'session-3'), conflict);
    }
});

test('continuing resumes a verified phase-four session and cannot use a completion call to start trials', () => {
    const data = trial();
    assert.equal(validateMoodHandoff(data, 'session-3', 'continue'), data);
    assert.throws(() => validateMoodHandoff(data, 'session-3', 'complete'), conflict);
    const flow = getMoodHandoffFlow(data);
    assert.equal(flow.route, APP_ROUTE.TRIAL);
    assert.equal(flow.updates.currentPhase, '4');
    assert.equal(flow.updates.currentSessionID, 'session-4');
    assert.equal(flow.updates.currentState, 'Exam');
});

test('an unfinished source resumes the same phase three without bypassing its remaining answers', () => {
    const data = trial();
    data.source = {...source(3, false, 1), cluster_count: 3};
    data.phases = phases(2);
    data.session = session(3);
    assert.equal(validateMoodHandoff(data, 'session-3', 'continue'), data);
    const flow = getMoodHandoffFlow(data);
    assert.equal(flow.updates.currentSessionID, 'session-3');
    assert.equal(flow.updates.currentPhase, '3');
    assert.equal(flow.route, APP_ROUTE.TRIAL);
});

test('resumed clusters and acknowledged results must belong to the returned session and retain their exact data', () => {
    for (const damage of [
        data => { data.session.cluster_order = ['a', 'a', 'c']; },
        data => { data.session.confirmed_submissions[0].cluster_id = 'other-session-cluster'; },
        data => { data.session.confirmed_submissions[0].response_time = -1; },
        data => { data.session.confirmed_submissions[0].answer = null; },
        data => { data.session.answered_count = 2; },
        data => { data.session.phase_id = 'positive'; },
    ]) {
        const data = trial();
        damage(data);
        assert.throws(() => validateMoodHandoff(data, 'session-3', 'continue'), conflict);
    }
});

test('a recovered pending answer preserves its exact reaction time and remaining stimulus order', () => {
    const saved = initial();
    const before = structuredClone(saved);
    const merged = mergeMoodSessionProgress(saved, session());
    assert.deepEqual(merged, saved);
    assert.deepEqual(saved, before);
    assert.equal(merged.pendingSubmission.response_time, 432.75);
});

test('a lost answer acknowledgment skips the already saved answer without replacing its measured time', () => {
    const saved = initial();
    const server = session();
    server.answered_count = 2;
    server.confirmed_submissions.push({...saved.pendingSubmission});
    const merged = mergeMoodSessionProgress(saved, server);
    assert.equal(merged.nextIndex, 2);
    assert.equal(merged.pendingSubmission, null);
    assert.deepEqual(merged.confirmedSubmissions[1], saved.pendingSubmission);
    assert.deepEqual(merged.clusterOrder.slice(merged.nextIndex), ['c']);
});

test('server-saved answers restore without local checkpoints and leave unanswered clusters in their original order', () => {
    const server = session();
    server.confirmed_submissions = [{cluster_id: 'b', answer: 'RIGHT', response_time: 412}];
    const merged = mergeMoodSessionProgress(null, server);
    assert.equal(merged.nextIndex, 1);
    assert.deepEqual(merged.clusterOrder, ['b', 'a', 'c']);
    assert.deepEqual(merged.confirmedSubmissions, server.confirmed_submissions);
    assert.equal(merged.pendingSubmission, null);
});

test('contradictory saved results never overwrite the pending or acknowledged participant payload', () => {
    const saved = initial();
    const before = structuredClone(saved);
    const changedPending = session();
    changedPending.confirmed_submissions.push({cluster_id: 'b', answer: 'RIGHT', response_time: 999});
    changedPending.answered_count = 2;
    assert.throws(() => mergeMoodSessionProgress(saved, changedPending), conflict);
    const missingAck = {...session(), confirmed_submissions: [], answered_count: 0};
    assert.throws(() => mergeMoodSessionProgress(saved, missingAck), conflict);
    assert.deepEqual(saved, before);
});

test('network retries repeat the same idempotent handoff request and validate its actual acknowledgment', async t => {
    fixture(t);
    const sent = [];
    axios.defaults.adapter = async config => {
        sent.push(JSON.parse(config.data));
        assert.equal(config.timeout, 15000);
        assert.ok(config.url.endsWith('/probe/sessions/handoff/'));
        if (sent.length === 1) throw new axios.AxiosError('Busy', 'ERR_BAD_RESPONSE', config, {}, {
            status: 503, headers: {'retry-after': '0'}, data: {},
        });
        return {data: trial(), status: 200, statusText: 'OK', headers: {}, config};
    };
    const data = await reconcileMoodSession('handoff-token', 'session-3', {phase: 4, action: 'continue'});
    assert.equal(data.session.session_id, 'session-4');
    assert.deepEqual(sent, [
        {session_id: 'session-3', phase: 4, action: 'continue'},
        {session_id: 'session-3', phase: 4, action: 'continue'},
    ]);
});

test('a late handoff cannot switch another participant or accept an unverified terminal response', async t => {
    const storage = fixture(t);
    axios.defaults.adapter = async config => {
        storage.setItem('authToken', 'another-participant');
        return {data: trial(), status: 200, statusText: 'OK', headers: {}, config};
    };
    await assert.rejects(reconcileMoodSession('handoff-token', 'session-3', {phase: 4, action: 'continue'}),
        error => error.code === 'PROBE_REQUEST_SUPERSEDED');
    storage.setItem('authToken', 'handoff-token');
    axios.defaults.adapter = async config => ({data: {state: 'complete'}, status: 200, statusText: 'OK', headers: {}, config});
    await assert.rejects(reconcileMoodSession('handoff-token', 'session-3', {phase: 4, action: 'continue'}), conflict);
    assert.equal(storage.getItem('currentSessionID'), 'session-3');
});

test('resumed trial checkpoint is durable before the session changes and does not extend participant recovery', t => {
    const storage = fixture(t);
    const identity = {subject_id: 'handoff-test', age: 28, gender: 'FEMALE', group: 2};
    beginParticipantRecovery(storage, identity, 'handoff-token');
    storage.setItem('currentSessionID', 'session-3');
    storage.setItem('currentPhaseID', 'positive');
    storage.setItem('currentPhase', '4');
    storage.setItem('currentState', 'instructions');
    const original = checkpointParticipantRecovery(storage);
    const scope = {token: 'handoff-token', sessionId: 'session-4', phaseId: 'negative', phase: 4, expiresAt: original.expiresAt};
    writeTrialProgress(storage, scope, initial());
    const route = commitMoodHandoff(storage, 'handoff-token', validateMoodHandoff(trial(), 'session-3', 'continue'));
    assert.equal(route, APP_ROUTE.TRIAL);
    assert.equal(storage.getItem('currentSessionID'), 'session-4');
    assert.equal(storage.getItem('currentPhase'), '4');
    assert.equal(storage.getItem('currentState'), 'Exam');
    assert.deepEqual(readTrialProgress(storage, scope), initial());
    const restored = readParticipantRecovery(storage, identity);
    assert.equal(restored.expiresAt, original.expiresAt);
    assert.equal(restored.snapshot.currentSessionID, 'session-4');
});

test('a checkpoint write failure preserves the old source and supports retrying the same backend handoff', t => {
    const storage = fixture(t);
    const before = [...storage.values];
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
        if (key === 'probeTrialProgress') throw new Error('Storage unavailable');
        setItem(key, value);
    };
    assert.throws(() => commitMoodHandoff(storage, 'handoff-token', trial()),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.deepEqual([...storage.values], before);
    storage.setItem = setItem;
    assert.equal(commitMoodHandoff(storage, 'handoff-token', trial()), APP_ROUTE.TRIAL);
    assert.equal(storage.getItem('currentSessionID'), 'session-4');
});

test('an interrupted session switch repairs its journal and keeps the recovered pending answer', t => {
    const storage = fixture(t);
    const scope = {token: 'handoff-token', sessionId: 'session-4', phaseId: 'negative', phase: 4};
    writeTrialProgress(storage, scope, initial());
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
        if (key === 'currentSessionID') throw new Error('Interrupted session switch');
        setItem(key, value);
    };
    assert.throws(() => commitMoodHandoff(storage, 'handoff-token', trial()),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.equal(storage.getItem('currentSessionID'), 'session-3');
    storage.setItem = setItem;
    checkpointParticipantRecovery(storage);
    assert.equal(storage.getItem('currentSessionID'), 'session-4');
    assert.equal(storage.getItem('currentPhase'), '4');
    assert.equal(storage.getItem('currentState'), 'Exam');
    assert.deepEqual(readTrialProgress(storage, scope).pendingSubmission, initial().pendingSubmission);
    assert.equal(storage.getItem('probePendingFlowUpdate'), null);
});

test('repairing an old mood counter retains a pending answer saved under the wrong local phase', t => {
    const storage = fixture(t);
    const payload = trial();
    payload.source = {...source(3, false, 1), cluster_count: 3};
    payload.phases = phases(2);
    payload.session = session(3);
    const oldScope = {token: 'handoff-token', sessionId: 'session-3', phaseId: 'positive', phase: 4};
    writeTrialProgress(storage, oldScope, initial());
    assert.equal(commitMoodHandoff(storage, 'handoff-token', payload), APP_ROUTE.TRIAL);
    assert.equal(storage.getItem('currentPhase'), '3');
    const repaired = readTrialProgress(storage, {...oldScope, phase: 3});
    assert.deepEqual(repaired.pendingSubmission, initial().pendingSubmission);
    assert.equal(repaired.pendingSubmission.response_time, 432.75);
    assert.deepEqual(repaired.clusterOrder.slice(repaired.nextIndex), ['b', 'c']);
});
