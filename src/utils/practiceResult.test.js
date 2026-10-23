import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PRACTICE_RESULT_STORAGE_KEY,
    normalizePracticeMark,
    readPracticeResult,
    writePracticeResult,
} from './practiceResult.js';

class MemoryStorage {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
}

const scope = {token: 'participant-a', sessionId: 'practice-a'};
const start = 1_000_000;
const twelveHours = 12 * 60 * 60 * 1000;

test('a practice report restores the backend score for its original participant and session', () => {
    const storage = new MemoryStorage();
    assert.equal(writePracticeResult(storage, scope, '93.5', start), 93.5);
    assert.equal(readPracticeResult(storage, scope, start + 1), 93.5);
    assert.equal(readPracticeResult(storage, {...scope, token: 'participant-b'}, start + 1), null);
    assert.equal(readPracticeResult(storage, {...scope, sessionId: 'practice-b'}, start + 1), null);
    assert.equal(readPracticeResult(storage, null, start + 1), null);
});

test('zero is an actual failing score and numeric session IDs restore consistently', () => {
    const storage = new MemoryStorage();
    writePracticeResult(storage, {...scope, sessionId: 42}, 0, start);
    assert.equal(readPracticeResult(storage, {...scope, sessionId: '42'}, start + 1), 0);
    assert.equal(normalizePracticeMark(100), 100);
});

test('missing or malformed marks cannot become an invented passing or failing score', () => {
    const storage = new MemoryStorage();
    for (const mark of [undefined, null, '', ' ', true, false, {}, [], NaN, Infinity, -1, 101, 'bad']) {
        assert.equal(normalizePracticeMark(mark), null);
        assert.throws(() => writePracticeResult(storage, scope, mark, start),
            error => error.code === 'PRACTICE_RESULT_WRITE_FAILED');
    }
    assert.equal(readPracticeResult(storage, scope, start), null);
});

test('practice scores expire at twelve hours, including when the report is opened directly', () => {
    const storage = new MemoryStorage();
    writePracticeResult(storage, scope, 88, start);
    assert.equal(readPracticeResult(storage, scope, start + twelveHours - 1), 88);
    assert.equal(readPracticeResult(storage, scope, start + twelveHours), null);
    assert.equal(readPracticeResult(storage, scope, start + twelveHours + 1), null);
});

test('a score received later cannot extend the original registration deadline or revive an expired session', () => {
    const storage = new MemoryStorage();
    const expiresAt = start + twelveHours;
    const participantScope = {...scope, expiresAt};
    writePracticeResult(storage, participantScope, 95, expiresAt - 5_000);
    assert.equal(readPracticeResult(storage, participantScope, expiresAt - 1), 95);
    assert.equal(readPracticeResult(storage, scope, expiresAt), null);
    assert.equal(readPracticeResult(storage, participantScope, expiresAt), null);
    assert.throws(() => writePracticeResult(storage, participantScope, 95, expiresAt),
        error => error.code === 'PARTICIPANT_RECOVERY_EXPIRED');
    assert.throws(() => writePracticeResult(storage, participantScope, 95, expiresAt + 1),
        error => error.code === 'PARTICIPANT_RECOVERY_EXPIRED');
});

test('the registration deadline also limits a previously cached score with a later expiry', () => {
    const storage = new MemoryStorage();
    writePracticeResult(storage, scope, 91, start);
    const participantScope = {...scope, expiresAt: start + 10_000};
    assert.equal(readPracticeResult(storage, participantScope, start + 9_999), 91);
    assert.equal(readPracticeResult(storage, participantScope, start + 10_000), null);
});

test('damaged caches are ignored and a failed update preserves the last durable score', () => {
    const storage = new MemoryStorage();
    for (const raw of ['{bad JSON', 'null', '{"version":42}', JSON.stringify({
        version: 1, token: scope.token, sessionId: scope.sessionId, mark: null,
        expiresAt: start + twelveHours,
    })]) {
        storage.setItem(PRACTICE_RESULT_STORAGE_KEY, raw);
        assert.equal(readPracticeResult(storage, scope, start + 1), null);
    }
    writePracticeResult(storage, scope, 95, start);
    storage.setItem = () => { throw new Error('Quota exceeded'); };
    assert.throws(() => writePracticeResult(storage, scope, 99, start + 1),
        error => error.code === 'PRACTICE_RESULT_WRITE_FAILED');
    assert.equal(readPracticeResult(storage, scope, start + 2), 95);
});
