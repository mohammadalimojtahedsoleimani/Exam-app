import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import {findValidSession} from '../api/probes.js';

class MemoryStorage {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const phaseIds = ['practice-id', 'baseline-id', 'positive-id', 'negative-id'];
const phasesAt = (number, ids = phaseIds) => ids.map((id, index) => ({
    id, name: id,
    is_passed: index < number - 1,
    is_allowed: index <= number - 1,
    has_video: index >= 2,
    video_seen: false,
}));

const fixture = t => {
    const previousStorage = globalThis.localStorage;
    const previousAdapter = axios.defaults.adapter;
    const storage = new MemoryStorage();
    storage.setItem('authToken', 'phase-check-token');
    globalThis.localStorage = storage;
    t.after(() => {
        axios.defaults.adapter = previousAdapter;
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    });
    return storage;
};

const mockSessionApi = phases => {
    const requests = [];
    axios.defaults.adapter = async config => {
        requests.push({method: config.method, payload: config.data ? JSON.parse(config.data) : null});
        return {
            config, status: config.method === 'get' ? 200 : 201,
            statusText: 'Test response', headers: {},
            data: config.method === 'get' ? phases : {session_id: 'prepared-session', cluster_count: 130},
        };
    };
    return requests;
};

const saveExistingFlow = storage => {
    storage.setItem('currentPhase', '4');
    storage.setItem('currentState', 'instructions');
    storage.setItem('currentPhaseID', 'previous-mood-id');
    storage.setItem('currentSessionID', 'previous-session');
    storage.setItem('probeTrialProgress', JSON.stringify({
        confirmedSubmissions: [{cluster_id: 'saved-answer', answer: 'RIGHT', response_time: 350}],
        pendingSubmission: {cluster_id: 'pending-answer', answer: 'LEFT', response_time: 425},
    }));
};

test('normal selection preserves the requested phase, state, and existing session return contract in all four positions', async t => {
    const storage = fixture(t);
    for (const phase of [1, 2, 3, 4]) {
        const state = phase === 1 ? 'instructions' : 'Exam';
        const requests = mockSessionApi(phasesAt(phase));
        const session = await findValidSession('phase-check-token', {phase, state});

        assert.equal(session.phaseId, phaseIds[phase - 1]);
        assert.equal(session.sessionId, 'prepared-session');
        assert.equal(session.clusterCount, 130);
        assert.equal(storage.getItem('currentPhase'), String(phase));
        assert.equal(storage.getItem('currentState'), state);
        assert.equal(storage.getItem('currentPhaseID'), phaseIds[phase - 1]);
        assert.equal(storage.getItem('currentSessionID'), 'prepared-session');
        assert.equal(storage.getItem('currentPhaseHasVideo'), String(phase >= 3));
        assert.deepEqual(requests, [
            {method: 'get', payload: null},
            {method: 'post', payload: {phase_id: phaseIds[phase - 1]}},
        ]);
        assert.equal(Object.hasOwn(session, 'route'), false);
        assert.equal(Object.hasOwn(session, 'phase'), false);
        assert.equal(Object.hasOwn(session, 'isComplete'), false);
    }
});

test('both backend mood orders retain their original UUID selection and caller-owned phase state', async t => {
    const storage = fixture(t);
    const swappedIds = [phaseIds[0], phaseIds[1], phaseIds[3], phaseIds[2]];
    for (const phase of [3, 4]) {
        const requests = mockSessionApi(phasesAt(phase, swappedIds));
        const session = await findValidSession('phase-check-token', {phase, state: 'instructions'});

        assert.equal(session.phaseId, swappedIds[phase - 1]);
        assert.equal(storage.getItem('currentPhase'), String(phase));
        assert.equal(storage.getItem('currentState'), 'instructions');
        assert.equal(storage.getItem('currentPhaseName'), swappedIds[phase - 1]);
        assert.deepEqual(requests[1].payload, {phase_id: swappedIds[phase - 1]});
    }
});

test('fresh local registration cannot start a later backend phase under practice phase one', async t => {
    const storage = fixture(t);
    storage.setItem('currentPhase', '1');
    storage.setItem('currentState', 'instructions');
    const before = [...storage.values.entries()];
    for (const apiPhase of [2, 3, 4]) {
        const requests = mockSessionApi(phasesAt(apiPhase));
        await assert.rejects(findValidSession('phase-check-token', {phase: 1, state: 'instructions'}), error => {
            assert.equal(error.code, 'PROBE_PHASE_MISMATCH');
            assert.equal(error.expectedPhase, 1);
            assert.equal(error.apiPhase, apiPhase);
            return true;
        });
        assert.deepEqual([...storage.values.entries()], before);
        assert.deepEqual(requests, [{method: 'get', payload: null}]);
    }
});

test('a phase-four counter cannot create a session for an earlier backend phase or discard saved responses', async t => {
    const storage = fixture(t);
    saveExistingFlow(storage);
    const before = [...storage.values.entries()];
    const requests = mockSessionApi(phasesAt(3));

    await assert.rejects(findValidSession('phase-check-token', {phase: 4, state: 'Exam'}),
        error => error.code === 'PROBE_PHASE_MISMATCH');
    assert.deepEqual([...storage.values.entries()], before);
    assert.deepEqual(requests, [{method: 'get', payload: null}]);
});

test('all four passed phases produce a diagnostic error without routing to Final or changing the saved exam', async t => {
    const storage = fixture(t);
    saveExistingFlow(storage);
    const before = [...storage.values.entries()];
    const requests = mockSessionApi(phasesAt(5));

    await assert.rejects(findValidSession('phase-check-token', {phase: 4, state: 'Exam'}), error => {
        assert.equal(error.code, 'PROBE_EXPERIMENT_COMPLETE');
        assert.equal(error.phaseStates.length, 4);
        assert.ok(error.phaseStates.every(phase => phase.is_passed === true));
        return true;
    });
    assert.deepEqual([...storage.values.entries()], before);
    assert.deepEqual(requests, [{method: 'get', payload: null}]);
    assert.equal(storage.getItem('currentState'), 'instructions');
});

test('empty, partial, and blocked phase responses remain unavailable rather than completing the experiment', async t => {
    const storage = fixture(t);
    saveExistingFlow(storage);
    const before = [...storage.values.entries()];
    const blocked = phasesAt(4);
    blocked[3].is_allowed = false;
    const truthyPassed = phasesAt(5);
    truthyPassed[3].is_passed = 'true';

    for (const phases of [[], phasesAt(5).slice(0, 3), blocked, truthyPassed]) {
        const requests = mockSessionApi(phases);
        await assert.rejects(findValidSession('phase-check-token', {phase: 4, state: 'Exam'}),
            error => error.code === 'PROBE_PHASE_UNAVAILABLE');
        assert.deepEqual([...storage.values.entries()], before);
        assert.deepEqual(requests, [{method: 'get', payload: null}]);
    }
});

test('ambiguous and non-array phase responses preserve the original blocked behavior and saved flow', async t => {
    const storage = fixture(t);
    saveExistingFlow(storage);
    const before = [...storage.values.entries()];
    const ambiguous = phasesAt(3);
    ambiguous[3].is_allowed = true;

    for (const [phases, code] of [
        [ambiguous, 'PROBE_PHASE_AMBIGUOUS'],
        [null, 'PROBE_PHASES_INVALID'],
        [{results: phasesAt(4)}, 'PROBE_PHASES_INVALID'],
    ]) {
        const requests = mockSessionApi(phases);
        await assert.rejects(findValidSession('phase-check-token', {phase: 4, state: 'Exam'}), error => error.code === code);
        assert.deepEqual([...storage.values.entries()], before);
        assert.deepEqual(requests, [{method: 'get', payload: null}]);
    }
});

test('healthy phase four still creates its original session after the instructions', async t => {
    const storage = fixture(t);
    saveExistingFlow(storage);
    const requests = mockSessionApi(phasesAt(4));
    const session = await findValidSession('phase-check-token', {phase: 4, state: 'Exam'});

    assert.equal(session.phaseId, 'negative-id');
    assert.equal(storage.getItem('currentPhase'), '4');
    assert.equal(storage.getItem('currentState'), 'Exam');
    assert.equal(storage.getItem('currentSessionID'), 'prepared-session');
    assert.deepEqual(requests, [
        {method: 'get', payload: null},
        {method: 'post', payload: {phase_id: 'negative-id'}},
    ]);
});

test('session preparation without explicit flow updates keeps the existing phase and state assignment rules', async t => {
    const storage = fixture(t);
    saveExistingFlow(storage);
    mockSessionApi(phasesAt(3));
    const session = await findValidSession('phase-check-token');

    assert.equal(session.phaseId, 'positive-id');
    assert.equal(storage.getItem('currentPhase'), '4');
    assert.equal(storage.getItem('currentState'), 'instructions');
    assert.equal(Object.hasOwn(session, 'route'), false);
});

test('the existing truthiness-based phase selection is preserved', async t => {
    const storage = fixture(t);
    const phases = phasesAt(4);
    phases[3].is_allowed = 1;
    phases[3].is_passed = 0;
    const requests = mockSessionApi(phases);
    const session = await findValidSession('phase-check-token', {phase: 4, state: 'Exam'});

    assert.equal(session.phaseId, 'negative-id');
    assert.equal(storage.getItem('currentPhase'), '4');
    assert.equal(storage.getItem('currentState'), 'Exam');
    assert.deepEqual(requests[1].payload, {phase_id: 'negative-id'});
});
