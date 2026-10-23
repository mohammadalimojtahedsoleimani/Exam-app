import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ACTIVE_PARTICIPANT_STORAGE_KEY, PARTICIPANT_RECOVERY_LIFETIME_MS, PARTICIPANT_RECOVERY_STORAGE_KEY,
    activateParticipantRecovery, beginParticipantRecovery, checkpointParticipantRecovery, commitParticipantFlow,
    forgetParticipantRecovery, getParticipantRecoveryRoute, pruneParticipantRecovery, readParticipantRecovery,
} from './participantRecovery.js';
import {APP_ROUTE, PROBE_STORAGE_KEYS, TRIAL_PROGRESS_STORAGE_KEY} from './phaseFlow.js';

class MemoryStorage {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const now = 1000;
const participant = {subject_id: 'Case-007', age: 28, gender: 'FEMALE', group: 2};
const otherParticipant = {...participant, subject_id: 'Case-008'};
const FLOW_UPDATE_STORAGE_KEY = 'probePendingFlowUpdate';
const runtime = {
    currentState: 'Exam', currentPhase: '3', currentPhaseID: 'phase-a', currentSessionID: 'session-a',
    currentClusterLength: '4', currentPhaseName: 'Mood phase', currentPhaseHasVideo: 'true',
    currentPhaseVideoSeen: 'false',
    [TRIAL_PROGRESS_STORAGE_KEY]: JSON.stringify({
        version: 1, ownerToken: 'token-a',
        checkpoints: {'["session-a",3,"phase-a"]': {
            clusterOrder: [11, 12], nextIndex: 0,
            pendingSubmission: {cluster_id: 11, answer: 'LEFT', response_time: 347},
        }},
    }),
};

const setRuntime = (storage, values = runtime) => {
    for (const [key, value] of Object.entries(values)) storage.setItem(key, value);
};

const savedExam = (storage) => {
    beginParticipantRecovery(storage, participant, 'token-a', now);
    setRuntime(storage);
    return checkpointParticipantRecovery(storage, now + 1);
};

test('matches all four identity fields and normalizes numbers without changing participant IDs', () => {
    const storage = new MemoryStorage();
    beginParticipantRecovery(storage, participant, 'token-a', now);
    assert.deepEqual(readParticipantRecovery(storage, {
        subject_id: ' Case-007 ', age: '028', gender: 'female', group: '02.0',
    }, now + 1).identity, participant);
    for (const values of [
        {...participant, subject_id: 'case-007'}, {...participant, subject_id: 'Case-7'},
        {...participant, age: 29}, {...participant, gender: 'MALE'}, {...participant, group: 3},
        {...participant, age: null}, {...participant, group: ''}, {...participant, gender: 'OTHER'},
    ]) assert.equal(readParticipantRecovery(storage, values, now + 1), null);
    assert.equal(readParticipantRecovery(storage, null, now + 1), null);
    const zeros = {...participant, subject_id: '0007'};
    beginParticipantRecovery(storage, zeros, 'token-zeros', now + 2);
    assert.equal(readParticipantRecovery(storage, {...zeros, subject_id: '7'}, now + 3), null);
    assert.equal(readParticipantRecovery(storage, zeros, now + 3).identity.subject_id, '0007');
});

test('signup failure before session creation retains the registration token without inventing a route', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated-setting', 'keep');
    setRuntime(storage);
    storage.setItem('authToken', 'old-token');
    const record = beginParticipantRecovery(storage, participant, 'token-a', now);
    assert.equal(record.token, 'token-a');
    assert.equal(getParticipantRecoveryRoute(record), null);
    assert.equal(storage.getItem('authToken'), 'token-a');
    for (const key of PROBE_STORAGE_KEYS) {
        if (key !== 'authToken' && key !== ACTIVE_PARTICIPANT_STORAGE_KEY) assert.equal(storage.getItem(key), null);
    }
    assert.equal(storage.getItem('unrelated-setting'), 'keep');
    assert.equal(hasOwn(record.snapshot, ACTIVE_PARTICIPANT_STORAGE_KEY), false);
    storage.removeItem('authToken');
    storage.removeItem(ACTIVE_PARTICIPANT_STORAGE_KEY);
    const restored = activateParticipantRecovery(storage, readParticipantRecovery(storage, participant, now + 1), now + 1);
    assert.equal(restored.token, 'token-a');
    assert.equal(storage.getItem('authToken'), 'token-a');
    assert.equal(getParticipantRecoveryRoute(restored), null);
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

test('switching participants preserves every runtime field and the exact pending answer payload', () => {
    const storage = new MemoryStorage();
    beginParticipantRecovery(storage, participant, 'token-a', now);
    setRuntime(storage);
    beginParticipantRecovery(storage, otherParticipant, 'token-b', now + 1);
    assert.equal(storage.getItem('authToken'), 'token-b');
    assert.equal(storage.getItem(TRIAL_PROGRESS_STORAGE_KEY), null);
    setRuntime(storage, {currentSessionID: 'session-b', currentPhase: '1', currentState: 'instructions'});
    const recordA = readParticipantRecovery(storage, participant, now + 2);
    assert.equal(recordA.snapshot[TRIAL_PROGRESS_STORAGE_KEY], runtime[TRIAL_PROGRESS_STORAGE_KEY]);
    const activatedA = activateParticipantRecovery(storage, recordA, now + 2);
    assert.equal(activatedA.token, 'token-a');
    for (const [key, value] of Object.entries(runtime)) assert.equal(storage.getItem(key), value);
    const recordB = readParticipantRecovery(storage, otherParticipant, now + 3);
    assert.equal(recordB.snapshot.currentSessionID, 'session-b');
    assert.equal(recordB.snapshot.currentState, 'instructions');
    activateParticipantRecovery(storage, recordB, now + 3);
    assert.equal(storage.getItem('authToken'), 'token-b');
    assert.equal(storage.getItem('currentSessionID'), 'session-b');
    assert.equal(storage.getItem(TRIAL_PROGRESS_STORAGE_KEY), null);
});

test('a stale supplied record cannot roll back newer raw runtime or a newer inactive snapshot', () => {
    const storage = new MemoryStorage();
    const stale = savedExam(storage);
    const latestProgress = JSON.stringify({version: 1, ownerToken: 'token-a', checkpoints: {latest: true}});
    storage.setItem(TRIAL_PROGRESS_STORAGE_KEY, latestProgress);
    storage.setItem('currentPhaseVideoSeen', 'true');
    const active = activateParticipantRecovery(storage, stale, now + 2);
    assert.equal(active.snapshot[TRIAL_PROGRESS_STORAGE_KEY], latestProgress);
    assert.equal(storage.getItem('currentPhaseVideoSeen'), 'true');
    beginParticipantRecovery(storage, otherParticipant, 'token-b', now + 3);
    activateParticipantRecovery(storage, stale, now + 4);
    assert.equal(storage.getItem(TRIAL_PROGRESS_STORAGE_KEY), latestProgress);
    assert.equal(storage.getItem('currentPhaseVideoSeen'), 'true');
});

test('expiry is exactly twelve hours and checkpoint, activation, and repeat begin cannot extend it', () => {
    const storage = new MemoryStorage();
    const original = savedExam(storage);
    const expiresAt = now + PARTICIPANT_RECOVERY_LIFETIME_MS;
    assert.equal(original.expiresAt, expiresAt);
    assert.equal(checkpointParticipantRecovery(storage, expiresAt - 3).expiresAt, expiresAt);
    assert.equal(activateParticipantRecovery(storage, original, expiresAt - 2).expiresAt, expiresAt);
    const repeated = beginParticipantRecovery(storage, participant, 'token-a', expiresAt - 1);
    assert.equal(repeated.createdAt, now);
    assert.equal(repeated.expiresAt, expiresAt);
    assert.equal(readParticipantRecovery(storage, participant, expiresAt - 1).token, 'token-a');
    assert.equal(checkpointParticipantRecovery(storage, expiresAt), null);
    assert.equal(storage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY), null);
    assert.equal(storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY), null);
    for (const key of PROBE_STORAGE_KEYS) assert.equal(storage.getItem(key), null);
    assert.equal(readParticipantRecovery(storage, participant, expiresAt), null);
    assert.equal(activateParticipantRecovery(storage, original, expiresAt), null);
    const next = beginParticipantRecovery(storage, participant, 'token-new', expiresAt);
    assert.equal(next.createdAt, expiresAt);
    assert.equal(next.expiresAt, expiresAt + PARTICIPANT_RECOVERY_LIFETIME_MS);
});

test('reading prunes an expired participant while preserving a newer participant', () => {
    const storage = new MemoryStorage();
    beginParticipantRecovery(storage, participant, 'token-a', now);
    beginParticipantRecovery(storage, otherParticipant, 'token-b', now + 100);
    const atExpiry = now + PARTICIPANT_RECOVERY_LIFETIME_MS;
    assert.equal(readParticipantRecovery(storage, participant, atExpiry), null);
    assert.equal(readParticipantRecovery(storage, otherParticipant, atExpiry).token, 'token-b');
    assert.equal(Object.keys(JSON.parse(storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY)).records).length, 1);
    assert.notEqual(storage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY), null);
});

test('reading an expired active record clears raw runtime while preserving unrelated participants', () => {
    const storage = new MemoryStorage();
    const original = savedExam(storage);
    beginParticipantRecovery(storage, otherParticipant, 'token-b', now + 100);
    activateParticipantRecovery(storage, original, now + 101);
    storage.setItem('unrelated-setting', 'keep');
    const atExpiry = now + PARTICIPANT_RECOVERY_LIFETIME_MS;
    assert.equal(readParticipantRecovery(storage, participant, atExpiry), null);
    for (const key of PROBE_STORAGE_KEYS) assert.equal(storage.getItem(key), null);
    assert.equal(readParticipantRecovery(storage, otherParticipant, atExpiry).token, 'token-b');
    assert.equal(storage.getItem('unrelated-setting'), 'keep');
});

test('pruning inactive participants reports the earliest remaining deadline without saving runtime', () => {
    const storage = new MemoryStorage();
    const first = savedExam(storage);
    const second = beginParticipantRecovery(storage, otherParticipant, 'token-b', now + 100);
    const thirdParticipant = {...participant, subject_id: 'Case-009'};
    const third = beginParticipantRecovery(storage, thirdParticipant, 'token-c', now + 200);
    storage.setItem('currentSessionID', 'unsaved-session-c');
    assert.deepEqual(pruneParticipantRecovery(storage, now + 201), {
        activeExpired: false, nextExpiryAt: first.expiresAt,
    });
    assert.equal(readParticipantRecovery(storage, thirdParticipant, now + 201).snapshot.currentSessionID, null);
    assert.deepEqual(pruneParticipantRecovery(storage, first.expiresAt), {
        activeExpired: false, nextExpiryAt: second.expiresAt,
    });
    assert.equal(readParticipantRecovery(storage, participant, first.expiresAt), null);
    assert.equal(storage.getItem('currentSessionID'), 'unsaved-session-c');
    assert.deepEqual(pruneParticipantRecovery(storage, second.expiresAt), {
        activeExpired: false, nextExpiryAt: third.expiresAt,
    });
    assert.equal(readParticipantRecovery(storage, otherParticipant, second.expiresAt), null);
    assert.equal(readParticipantRecovery(storage, thirdParticipant, second.expiresAt).createdAt, now + 200);
});

test('pruning the active expiry clears all participant runtime and reports an empty deadline', () => {
    const storage = new MemoryStorage();
    const record = savedExam(storage);
    storage.setItem('probePracticeResult', JSON.stringify({token: record.token, sessionId: 'session-a', mark: 83}));
    storage.setItem('unrelated-setting', 'keep');
    assert.deepEqual(pruneParticipantRecovery(storage, record.expiresAt - 1), {
        activeExpired: false, nextExpiryAt: record.expiresAt,
    });
    assert.deepEqual(pruneParticipantRecovery(storage, record.expiresAt), {
        activeExpired: true, nextExpiryAt: null,
    });
    for (const key of PROBE_STORAGE_KEYS) assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem('probePracticeResult'), null);
    assert.equal(storage.getItem(TRIAL_PROGRESS_STORAGE_KEY), null);
    assert.equal(storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY), null);
    assert.equal(storage.getItem('unrelated-setting'), 'keep');
    assert.deepEqual(pruneParticipantRecovery(storage, record.expiresAt + 1), {
        activeExpired: false, nextExpiryAt: null,
    });
});

test('pruning a corrupt active pointer reports invalidation while an unrelated raw token is preserved', () => {
    const storage = new MemoryStorage();
    const record = savedExam(storage);
    storage.setItem(ACTIVE_PARTICIPANT_STORAGE_KEY, 'broken');
    assert.deepEqual(pruneParticipantRecovery(storage, now + 2), {
        activeExpired: true, nextExpiryAt: record.expiresAt,
    });
    for (const key of PROBE_STORAGE_KEYS) assert.equal(storage.getItem(key), null);
    activateParticipantRecovery(storage, record, now + 3);
    storage.setItem('authToken', 'unrelated-token');
    storage.setItem('currentSessionID', 'unrelated-session');
    assert.deepEqual(pruneParticipantRecovery(storage, record.expiresAt), {
        activeExpired: false, nextExpiryAt: null,
    });
    assert.equal(storage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY), null);
    assert.equal(storage.getItem('authToken'), 'unrelated-token');
    assert.equal(storage.getItem('currentSessionID'), 'unrelated-session');
});

test('untrusted corrupt records and active pointers are pruned without crashing reads', () => {
    const storage = new MemoryStorage();
    for (const raw of ['{bad JSON', 'null', '[]', '{"version":42,"records":{}}']) {
        storage.setItem(PARTICIPANT_RECOVERY_STORAGE_KEY, raw);
        storage.setItem(ACTIVE_PARTICIPANT_STORAGE_KEY, 'broken');
        assert.equal(readParticipantRecovery(storage, participant, now), null);
        assert.equal(storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY), null);
        assert.equal(storage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY), null);
    }
    const record = beginParticipantRecovery(storage, participant, 'token-a', now);
    const key = Object.keys(JSON.parse(storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY)).records)[0];
    for (const damaged of [
        {...record, snapshot: {...record.snapshot, authToken: 'another-token'}},
        {...record, identity: {...participant, age: null}},
        {...record, expiresAt: record.expiresAt + 1},
        {...record, snapshot: {...record.snapshot, currentSessionID: {id: 5}}},
    ]) {
        storage.setItem(PARTICIPANT_RECOVERY_STORAGE_KEY, JSON.stringify({version: 1, records: {[key]: damaged}}));
        assert.equal(readParticipantRecovery(storage, participant, now), null);
        assert.equal(storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY), null);
    }
    assert.equal(activateParticipantRecovery(storage, record, now), null);
});

test('a runtime token mismatch never overwrites another participant recovery data', () => {
    const storage = new MemoryStorage();
    savedExam(storage);
    storage.setItem('authToken', 'unrelated-token');
    storage.setItem('currentSessionID', 'unrelated-session');
    assert.equal(checkpointParticipantRecovery(storage, now + 2), null);
    assert.equal(storage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY), null);
    assert.equal(readParticipantRecovery(storage, participant, now + 2).snapshot.currentSessionID, 'session-a');
    assert.equal(checkpointParticipantRecovery(storage, now + 3), null);
    assert.throws(() => beginParticipantRecovery(storage, participant, 'different-token', now + 3),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.equal(readParticipantRecovery(storage, participant, now + 3).token, 'token-a');
});

test('final completion forgets only the active participant and leaves unrelated storage intact', () => {
    const storage = new MemoryStorage();
    savedExam(storage);
    beginParticipantRecovery(storage, otherParticipant, 'token-b', now + 2);
    storage.setItem('unrelated-setting', 'keep');
    forgetParticipantRecovery(storage, now + 3);
    assert.equal(readParticipantRecovery(storage, otherParticipant, now + 3), null);
    assert.equal(readParticipantRecovery(storage, participant, now + 3).token, 'token-a');
    assert.equal(storage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY), null);
    assert.equal(storage.getItem('unrelated-setting'), 'keep');
    activateParticipantRecovery(storage, readParticipantRecovery(storage, participant, now + 4), now + 4);
    forgetParticipantRecovery(storage, now + 5);
    assert.equal(storage.getItem(PARTICIPANT_RECOVERY_STORAGE_KEY), null);
    assert.equal(checkpointParticipantRecovery(storage, now + 5), null);
});

test('storage failures stop mutations with the same recoverable error code as trial checkpoints', () => {
    const storage = new MemoryStorage();
    const saved = savedExam(storage);
    storage.setItem('currentSessionID', 'new-session');
    storage.setItem = () => { throw new Error('Quota exceeded'); };
    assert.throws(() => checkpointParticipantRecovery(storage, now + 2),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.throws(() => beginParticipantRecovery(storage, otherParticipant, 'token-b', now + 2),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.equal(readParticipantRecovery(storage, participant, now + 2).snapshot.currentSessionID, saved.snapshot.currentSessionID);
    assert.equal(storage.getItem('authToken'), 'token-a');
});

const nextFlow = {
    currentPhase: '4', currentState: 'instructions', currentPhaseID: 'phase-b', currentSessionID: 'session-b',
    currentClusterLength: '8', currentPhaseName: 'Next mood phase', currentPhaseHasVideo: 'false',
    currentPhaseVideoSeen: 'true',
};

const failFlowWrite = (storage, failedKey) => {
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
        if (key === failedKey) throw new Error('Simulated interrupted storage write');
        setItem(key, value);
    };
    return () => { storage.setItem = setItem; };
};

test('an interrupted flow update keeps its full journal and checkpoint repairs the intended phase and session', () => {
    const storage = new MemoryStorage();
    const original = savedExam(storage);
    const repairWrites = failFlowWrite(storage, 'currentSessionID');
    assert.throws(() => commitParticipantFlow(storage, nextFlow, now + 2),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.equal(storage.getItem('currentPhase'), '4');
    assert.equal(storage.getItem('currentSessionID'), 'session-a');
    const journal = JSON.parse(storage.getItem(FLOW_UPDATE_STORAGE_KEY));
    assert.deepEqual(journal, {token: original.token, expiresAt: original.expiresAt, updates: nextFlow});
    repairWrites();
    assert.equal(readParticipantRecovery(storage, participant, now + 3).snapshot.currentPhase, '3');
    const repaired = checkpointParticipantRecovery(storage, now + 3);
    for (const [key, value] of Object.entries(nextFlow)) {
        assert.equal(storage.getItem(key), value);
        assert.equal(repaired.snapshot[key], value);
    }
    assert.equal(repaired.createdAt, original.createdAt);
    assert.equal(repaired.expiresAt, original.expiresAt);
    assert.equal(storage.getItem(FLOW_UPDATE_STORAGE_KEY), null);
    assert.equal(hasOwn(repaired.snapshot, FLOW_UPDATE_STORAGE_KEY), false);
});

test('flow journals remain until the repaired snapshot is durable and stale activation preserves the repair', () => {
    const storage = new MemoryStorage();
    const original = savedExam(storage);
    const repairWrites = failFlowWrite(storage, PARTICIPANT_RECOVERY_STORAGE_KEY);
    assert.throws(() => commitParticipantFlow(storage, nextFlow, now + 2),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.equal(storage.getItem('currentSessionID'), 'session-b');
    assert.notEqual(storage.getItem(FLOW_UPDATE_STORAGE_KEY), null);
    repairWrites();
    const repaired = activateParticipantRecovery(storage, original, now + 3);
    assert.equal(repaired.snapshot.currentSessionID, 'session-b');
    assert.equal(repaired.snapshot.currentState, 'instructions');
    assert.equal(storage.getItem(FLOW_UPDATE_STORAGE_KEY), null);
});

test('another participant cannot inherit a pending flow update and malformed journals never change flow', () => {
    const storage = new MemoryStorage();
    const original = savedExam(storage);
    beginParticipantRecovery(storage, otherParticipant, 'token-b', now + 2);
    commitParticipantFlow(storage, {currentState: 'instructions', currentPhase: '1', currentSessionID: 'own-session'}, now + 3);
    const journalA = {token: original.token, expiresAt: original.expiresAt, updates: nextFlow};
    for (const raw of [
        JSON.stringify(journalA), '{broken JSON',
        JSON.stringify({...journalA, token: 'token-b', updates: {authToken: 'another-token'}}),
        JSON.stringify({...journalA, token: 'token-b', updates: {currentState: 'unknown'}}),
        JSON.stringify({...journalA, token: 'token-b', expiresAt: original.expiresAt + 10000}),
    ]) {
        storage.setItem(FLOW_UPDATE_STORAGE_KEY, raw);
        const record = checkpointParticipantRecovery(storage, now + 4);
        assert.equal(record.token, 'token-b');
        assert.equal(record.snapshot.currentPhase, '1');
        assert.equal(record.snapshot.currentSessionID, 'own-session');
        assert.equal(storage.getItem(FLOW_UPDATE_STORAGE_KEY), null);
    }
    assert.equal(readParticipantRecovery(storage, participant, now + 5).snapshot.currentSessionID, 'session-a');
});

test('expired participant journals are deleted with runtime and cannot resurrect a completed flow', () => {
    const storage = new MemoryStorage();
    const original = savedExam(storage);
    const repairWrites = failFlowWrite(storage, 'currentSessionID');
    assert.throws(() => commitParticipantFlow(storage, nextFlow, now + 2));
    repairWrites();
    assert.equal(checkpointParticipantRecovery(storage, original.expiresAt), null);
    for (const key of PROBE_STORAGE_KEYS) assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem(FLOW_UPDATE_STORAGE_KEY), null);
    assert.equal(checkpointParticipantRecovery(storage, original.expiresAt + 1), null);
    assert.equal(readParticipantRecovery(storage, participant, original.expiresAt + 1), null);
    assert.throws(() => commitParticipantFlow(storage, nextFlow, original.expiresAt + 1),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
});

test('legacy flow updates stay token scoped and journal-write failure leaves metadata unchanged', () => {
    const storage = new MemoryStorage();
    storage.setItem('authToken', 'legacy-token');
    storage.setItem('currentPhase', '2');
    const repairWrites = failFlowWrite(storage, FLOW_UPDATE_STORAGE_KEY);
    assert.throws(() => commitParticipantFlow(storage, nextFlow, now),
        error => error.code === 'TRIAL_PROGRESS_WRITE_FAILED');
    assert.equal(storage.getItem('currentPhase'), '2');
    repairWrites();
    assert.equal(commitParticipantFlow(storage, nextFlow, now), null);
    assert.equal(storage.getItem('currentSessionID'), 'session-b');
    assert.equal(storage.getItem(FLOW_UPDATE_STORAGE_KEY), null);
    assert.throws(() => commitParticipantFlow(storage, {authToken: 'bad-token'}, now));
    assert.equal(storage.getItem('authToken'), 'legacy-token');
});

test('resume routes require saved phase/session and preserve exam, instructions, and result destinations', () => {
    const storage = new MemoryStorage();
    const record = savedExam(storage);
    const withSnapshot = changes => ({...record, snapshot: {...record.snapshot, ...changes}});
    assert.equal(getParticipantRecoveryRoute(record), APP_ROUTE.TRIAL);
    assert.equal(getParticipantRecoveryRoute(withSnapshot({currentState: 'instructions'})), APP_ROUTE.INSTRUCTIONS);
    for (const phase of [1, 2, 3]) {
        assert.equal(getParticipantRecoveryRoute(withSnapshot({currentState: 'result', currentPhase: String(phase)})), APP_ROUTE.REPORT);
    }
    assert.equal(getParticipantRecoveryRoute(withSnapshot({currentState: 'result', currentPhase: '4'})), APP_ROUTE.FINAL);
    for (const changes of [
        {currentSessionID: null}, {currentSessionID: ''}, {currentSessionID: 'undefined'},
        {currentPhase: null}, {currentPhase: '5'}, {currentState: null},
    ]) assert.equal(getParticipantRecoveryRoute(withSnapshot(changes)), null);
    assert.equal(getParticipantRecoveryRoute(null), null);
});
