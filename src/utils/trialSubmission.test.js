import assert from 'node:assert/strict';
import test from 'node:test';
import {createTrialSubmission} from './trialSubmission.js';

const submission = (overrides = {}) => createTrialSubmission({
    clusterId: 101,
    answer: 'RIGHT',
    targetStartTime: 100,
    responseTimestamp: 512.4,
    currentTimestamp: 520,
    ...overrides,
});

test('preserves a real participant answer and the measured event reaction time', () => {
    assert.deepEqual(submission(), {
        payload: {cluster_id: 101, answer: 'RIGHT', response_time: 412},
        usedDefaultAnswer: false,
        usedDefaultResponseTime: false,
    });
    assert.equal(submission({answer: ' right '}).payload.answer, 'RIGHT');
});

test('recovers from a missing, invalid, or incompatible event timestamp before defaulting', () => {
    for (const responseTimestamp of [undefined, null, '', NaN, Infinity, -1, 50, 1700000000000]) {
        const result = submission({responseTimestamp});
        assert.equal(result.payload.response_time, 420);
        assert.equal(result.usedDefaultResponseTime, false);
    }
});

test('only defaults the time when no valid measurement is recoverable', () => {
    for (const targetStartTime of [undefined, null, '', NaN, Infinity, -1, {}, true]) {
        const result = submission({targetStartTime});
        assert.deepEqual(result.payload, {cluster_id: 101, answer: 'RIGHT', response_time: 0});
        assert.equal(result.usedDefaultAnswer, false);
        assert.equal(result.usedDefaultResponseTime, true);
    }
    assert.equal(submission({responseTimestamp: null, currentTimestamp: NaN}).usedDefaultResponseTime, true);
    assert.equal(submission({responseTimestamp: 90, currentTimestamp: 90}).usedDefaultResponseTime, true);
    assert.equal(submission({targetStartTime: 0, responseTimestamp: 0}).usedDefaultResponseTime, false);
});

test('only defaults the answer when a valid answer cannot be recovered', () => {
    for (const answer of [undefined, null, '', 'UNKNOWN', 'NaN', 0, {}, false]) {
        const result = submission({answer});
        assert.deepEqual(result.payload, {cluster_id: 101, answer: 'LEFT', response_time: 412});
        assert.equal(result.usedDefaultAnswer, true);
        assert.equal(result.usedDefaultResponseTime, false);
    }
});

test('retries keep the original answer and time, including zero', () => {
    for (const response_time of [0, 412]) {
        const previousSubmission = {cluster_id: 101, answer: 'RIGHT', response_time};
        const result = submission({answer: 'LEFT', previousSubmission, currentTimestamp: 9999});
        assert.deepEqual(result.payload, previousSubmission);
        assert.equal(result.usedDefaultAnswer, false);
        assert.equal(result.usedDefaultResponseTime, false);
    }
});

test('an incomplete retry preserves each recoverable field independently', () => {
    const retry = (previousSubmission) => submission({
        answer: null, targetStartTime: null, responseTimestamp: null, currentTimestamp: null, previousSubmission,
    });
    assert.deepEqual(retry({cluster_id: 101, answer: 'RIGHT'}).payload,
        {cluster_id: 101, answer: 'RIGHT', response_time: 0});
    assert.deepEqual(retry({cluster_id: 101, response_time: 412}).payload,
        {cluster_id: 101, answer: 'LEFT', response_time: 412});
    assert.deepEqual(retry(null).payload, {cluster_id: 101, answer: 'LEFT', response_time: 0});
    assert.deepEqual(retry({cluster_id: 102, answer: 'RIGHT', response_time: 412}).payload,
        {cluster_id: 101, answer: 'LEFT', response_time: 0});
});

test('invalid saved times are recovered from valid clocks, while numeric strings are normalized', () => {
    for (const response_time of [undefined, null, '', -1, NaN, Infinity, Number.MAX_VALUE, 'invalid', {}, true]) {
        assert.equal(submission({previousSubmission: {cluster_id: 101, response_time}}).payload.response_time, 412);
    }
    assert.equal(submission({previousSubmission: {cluster_id: 101, response_time: '123'}}).payload.response_time, 123);
});
