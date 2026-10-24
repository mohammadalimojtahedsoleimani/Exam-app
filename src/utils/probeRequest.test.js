import assert from 'node:assert/strict';
import test from 'node:test';
import {captureProbeRequestGuard, getProbeRetryDelay, isTransientProbeError, performProbeRequest} from './probeRequest.js';

const httpError = (status, headers = {}) => ({response: {status, headers, data: {detail: 'Request failed.'}}});

test('temporary failures retry the same operation and return only its actual acknowledgment', async () => {
    for (const error of [httpError(408), httpError(425), httpError(429), httpError(503),
        {code: 'ERR_NETWORK'}, {code: 'ECONNABORTED'}, {code: 'ETIMEDOUT'}, {request: {}}]) {
        let attempts = 0;
        const waits = [];
        const response = {data: {accepted: true}};
        const actual = await performProbeRequest(async () => {
            attempts += 1;
            if (attempts < 3) throw error;
            return response;
        }, {sleep: async delay => { waits.push(delay); }});
        assert.equal(actual, response);
        assert.equal(attempts, 3);
        assert.deepEqual(waits, [1000, 2000]);
    }
});

test('all non-transient 4xx failures remain rejected and never become success', async () => {
    for (let status = 400; status < 500; status += 1) {
        if ([408, 425, 429].includes(status)) continue;
        const failure = httpError(status);
        let attempts = 0;
        await assert.rejects(performProbeRequest(async () => { attempts += 1; throw failure; }), error => error === failure);
        assert.equal(attempts, 1, String(status));
        assert.equal(isTransientProbeError(failure), false, String(status));
    }
});

test('exhausted retries preserve the exact original failure and stop after three attempts', async () => {
    for (const failure of [httpError(408), httpError(425), httpError(429), {code: 'ERR_NETWORK'}]) {
        let attempts = 0;
        await assert.rejects(performProbeRequest(async () => { attempts += 1; throw failure; }, {sleep: async () => {}}), error => error === failure);
        assert.equal(attempts, 3);
    }
});

test('Retry-After seconds and dates are honored and long waits return to manual recovery', async () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    assert.equal(getProbeRetryDelay(httpError(429, {'retry-after': '2'}), 0, now), 2000);
    assert.equal(getProbeRetryDelay(httpError(429, {'Retry-After': 'Sun, 25 Oct 2026 12:00:05 GMT'}), 0, now), 5000);
    assert.equal(getProbeRetryDelay(httpError(429, {'retry-after': 'invalid'}), 1, now), 2000);
    const failure = httpError(429, {'retry-after': '120'});
    let attempts = 0;
    await assert.rejects(performProbeRequest(async () => { attempts += 1; throw failure; }, {
        sleep: async () => { assert.fail('A long Retry-After must not leave a long spinner.'); },
    }), error => error === failure);
    assert.equal(attempts, 1);
});

test('explicit operation recovery returns the real response without another POST', async () => {
    const error = httpError(409);
    const result = await performProbeRequest(async () => { throw error; }, {recover: failure => failure === error});
    assert.equal(result, error.response);
});

test('a changed participant cannot be retried or receive a late acknowledgment', async () => {
    let current = true;
    let attempts = 0;
    await assert.rejects(performProbeRequest(async () => { attempts += 1; throw httpError(429); }, {
        isCurrent: () => current,
        sleep: async () => { current = false; },
    }), error => error.code === 'PROBE_REQUEST_SUPERSEDED');
    assert.equal(attempts, 1);
    current = true;
    await assert.rejects(performProbeRequest(async () => { current = false; return {data: {accepted: true}}; }, {
        isCurrent: () => current,
    }), error => error.code === 'PROBE_REQUEST_SUPERSEDED');
});

test('cancellation and session creation opt-out never trigger an automatic retry', async () => {
    for (const [failure, options] of [[{code: 'ERR_CANCELED'}, {}], [httpError(503), {maxRetries: 0}]]) {
        let attempts = 0;
        await assert.rejects(performProbeRequest(async () => { attempts += 1; throw failure; }, options), error => error === failure);
        assert.equal(attempts, 1);
    }
});

test('ownership guard pins token, session, phase, and recovery deadline without mutating storage', t => {
    const original = globalThis.localStorage;
    t.after(() => { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; });
    const values = new Map([['authToken', 'token-a'], ['currentSessionID', 'session-a'],
        ['currentPhaseID', 'phase-a'], ['currentPhase', '2']]);
    globalThis.localStorage = {getItem: key => values.get(key) ?? null};
    for (const key of ['authToken', 'currentSessionID', 'currentPhaseID', 'currentPhase']) {
        const guard = captureProbeRequestGuard('token-a');
        assert.equal(guard(), true);
        const previous = values.get(key);
        values.set(key, 'other');
        assert.equal(guard(), false, key);
        values.set(key, previous);
    }
    values.set('probeParticipantRecovery', JSON.stringify({records: {a: {token: 'token-a', expiresAt: Date.now() - 1}}}));
    assert.equal(captureProbeRequestGuard('token-a')(), false);
    assert.equal(captureProbeRequestGuard('other-token')(), false);
});
