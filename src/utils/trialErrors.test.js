import assert from 'node:assert/strict';
import test from 'node:test';
import {getTrialErrorMessage, isAlreadySubmittedError, isAlreadyCompletedError} from './trialErrors.js';

const apiError = (status, data) => ({response: {status, data}});

test('accepts explicit already-submitted answers across the 4xx range', () => {
    for (const status of [400, 401, 403, 404, 409, 418, 422, 429, 499, '409']) {
        assert.equal(isAlreadySubmittedError(apiError(status, {
            details: 'You have already submitted an answer for this cluster.',
        })), true, `status ${status}`);
    }
});

test('recognizes common duplicate-answer wording and response shapes', () => {
    const bodies = [
        {detail: 'This cluster has already been answered.'},
        {details: ['The answer for this cluster is already submited.']},
        {details: {answer: ['An answer for this cluster already exists.']}},
        {detail: 'The response was saved already.'},
        {details: 'Duplicate result for this cluster.'},
        {detail: 'Already submitted for this cluster.'},
        {details: ['Already submitted.']},
        {details: 'ANSWER_ALREADY_SUBMITTED'},
        {detail: 'The result has already been recorded for this cluster.'},
        {details: 'پاسخ این خوشه قبلاً ثبت شده است.'},
        {detail: 'پاسخ این کلاستر پیش‌تر ارسال شده است.'},
        {details: ['جواب این خوشه از قبل ثبت شده است.']},
    ];

    for (const body of bodies) {
        assert.equal(isAlreadySubmittedError(apiError(422, body)), true, JSON.stringify(body));
    }
});

test('does not skip clusters on unrelated, ambiguous, or malformed failures', () => {
    const errors = [
        apiError(409, {detail: 'Conflict.'}),
        apiError(409, {message: 'Already submitted for this cluster.'}),
        apiError(409, {non_field_errors: ['Already submitted for this cluster.']}),
        apiError(409, 'Already submitted for this cluster.'),
        apiError(409, {detail: 'Invalid answer.', message: 'Already submitted for this cluster.'}),
        apiError(400, {details: 'The answer could not be submitted.'}),
        apiError(400, {details: 'The answer has not already been submitted.'}),
        apiError(400, {details: 'The answer was never submitted already.'}),
        apiError(400, {details: 'The username already exists.'}),
        apiError(400, {details: 'The session has already expired.'}),
        apiError(400, {details: 'پاسخ این خوشه قبلاً ثبت نشده است.'}),
        apiError(401, {detail: 'Invalid token.'}),
        apiError(403, {detail: 'You do not have permission.'}),
        apiError(429, {detail: 'Too many requests.'}),
        apiError(500, {detail: 'The answer is already submitted.'}),
        apiError(200, {detail: 'The answer is already submitted.'}),
        apiError(undefined, {detail: 'The answer is already submitted.'}),
        apiError(400, null),
        apiError(400, {details: [null, 42, false, {}]}),
        {code: 'ERR_NETWORK', request: {}},
        new Error('Unexpected failure'),
        null,
        undefined,
    ];

    for (const error of errors) {
        assert.equal(isAlreadySubmittedError(error), false, JSON.stringify(error));
    }
});

test('gives actionable messages for authentication, throttling, and server failures', () => {
    const fallback = 'ثبت پاسخ انجام نشد. برای ارسال دوباره تلاش کنید.';
    const scenarios = [
        [apiError(401, {}), 'دوباره وارد شوید'],
        [apiError(403, {}), 'مسئول آزمون'],
        [apiError(404, {}), 'پیدا نشد'],
        [apiError(408, {}), 'زمان انتظار'],
        [apiError(429, {}), 'کمی صبر کنید'],
        [apiError(503, {}), 'سرور آزمون'],
        [apiError(504, {}), 'زمان انتظار'],
        [{code: 'ECONNABORTED'}, 'زمان انتظار'],
        [{code: 'ETIMEDOUT'}, 'زمان انتظار'],
        [{code: 'ERR_NETWORK'}, 'اتصال اینترنت'],
        [{request: {}}, 'اتصال اینترنت'],
    ];

    for (const [error, expected] of scenarios) {
        assert.ok(getTrialErrorMessage(error, fallback).includes(expected), expected);
    }
});

test('uses the operation-specific fallback for unexpected errors', () => {
    const fallback = 'ثبت پایان مرحله انجام نشد. لطفاً دوباره تلاش کنید.';
    for (const error of [undefined, null, new Error('Unknown'), apiError(422, {detail: '<script>unexpected</script>'})]) {
        assert.equal(getTrialErrorMessage(error, fallback), fallback);
    }
});

test('only explicit 4xx detail/details confirmations recover an interrupted phase completion', () => {
    assert.equal(isAlreadyCompletedError(apiError(409, {details: 'This session has already been completed.'})), true);
    assert.equal(isAlreadyCompletedError(apiError(400, {detail: 'این مرحله قبلاً تکمیل شده است.'})), true);
    for (const error of [
        apiError(500, {detail: 'This session has already been completed.'}),
        apiError(409, {message: 'This session has already been completed.'}),
        apiError(400, {detail: 'This session has not already been completed.'}),
        apiError(400, {detail: 'Already submitted for this cluster.'}),
        apiError(401, {detail: 'Invalid token.'}),
    ]) assert.equal(isAlreadyCompletedError(error), false);
});
