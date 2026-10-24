import assert from 'node:assert/strict';
import test from 'node:test';
import {getTrialErrorMessage, isAlreadySubmittedError, isAlreadyCompletedError, isAlreadySeenError} from './trialErrors.js';

const apiError = (status, data) => ({response: {status, data}});

test('accepts explicit already-submitted answers across the 4xx range', () => {
    for (const status of [...Array.from({length: 100}, (_, index) => 400 + index), '409']) {
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
        {detail: 'For this cluster answer already submitted.'},
        {detail: 'The result has already been recorded for this cluster.'},
        {details: 'پاسخ این خوشه قبلاً ثبت شده است.'},
        {detail: 'پاسخ این کلاستر پیش‌تر ارسال شده است.'},
        {details: ['جواب این خوشه از قبل ثبت شده است.']},
        {message: 'Already submitted for this cluster.'},
        {non_field_errors: ['Already submitted for this cluster.']},
        {error: {code: 'ANSWER_ALREADY_SUBMITTED', message: 'Answer already saved.'}},
        {code: 'ANSWER_ALREADY_SUBMITTED'},
        'Already submitted for this cluster.',
        '{"detail":"Answer already recorded."}',
        {detail: 'An answer has been previously submitted for this cluster.'},
        {details: 'The response to this cluster was saved earlier.'},
        {detail: 'An answer for this cluster has already been accepted.'},
        {details: 'Your response was stored previously.'},
        {detail: 'The answer for this trial was sent before.'},
        {details: 'You have previously answered this question.'},
        {detail: 'This cluster has already been responded to.'},
        {detail: 'A result has already been created for this cluster.'},
        {details: 'This cluster already has an answer.'},
        {detail: 'There is already a response for this cluster.'},
        {details: 'An answer for this cluster is already present.'},
        {detail: 'A response is already on file for this cluster.'},
        {details: 'Your answer was recorded in the past.'},
        {detail: 'Previously submitted.'},
        {details: 'Already answered.'},
        {detail: 'The answer already exists; you cannot submit it again.'},
        {details: 'This answer has already been saved, so another answer cannot be submitted.'},
        {details: 'پاسخ این خوشه تکراری است.'},
        {detail: 'پاسخ شما پیش از این ذخیره شده است.'},
        {details: ['جواب این سؤال قبلاً دریافت شده است.']},
        {detail: {cluster: ['برای این خوشه قبلاً پاسخی ثبت شده است.']}},
    ];

    for (const body of bodies) {
        assert.equal(isAlreadySubmittedError(apiError(422, body)), true, JSON.stringify(body));
    }
});

test('does not skip clusters on unrelated, ambiguous, or malformed failures', () => {
    const errors = [
        apiError(409, {detail: 'Conflict.'}),
        apiError(409, {detail: 'Invalid answer.', message: 'Already submitted for this cluster.'}),
        apiError(400, {details: 'The answer could not be submitted.'}),
        apiError(400, {details: 'The answer has not already been submitted.'}),
        apiError(400, {details: 'The answer was never submitted already.'}),
        apiError(400, {details: 'No answer has already been submitted for this cluster.'}),
        apiError(400, {details: "There isn't already an answer submitted for this cluster."}),
        apiError(400, {details: 'There isn’t already an answer submitted for this cluster.'}),
        apiError(400, {details: 'The answer cannot already have been submitted.'}),
        apiError(400, {details: 'The answer has not yet been successfully submitted already.'}),
        apiError(400, {details: 'The answer does not already exist for this cluster.'}),
        apiError(400, {details: 'This is not a duplicate answer for this cluster.'}),
        apiError(400, {detail: 'The answer was not previously submitted.'}),
        apiError(400, {details: 'No previous answer exists for this cluster.'}),
        apiError(400, {detail: 'The answer might already have been submitted.'}),
        apiError(400, {detail: 'If an answer already exists, contact the researcher.'}),
        apiError(400, {detail: 'Check whether this cluster was already answered.'}),
        apiError(400, {detail: 'Has this cluster already been answered?'}),
        apiError(400, {detail: 'آیا پاسخ این خوشه قبلا ثبت شده است؟'}),
        apiError(400, {details: 'The previously submitted answer failed to save.'}),
        apiError(400, {detail: 'The answer submitted earlier is missing.'}),
        apiError(400, {detail: 'The answer was already submitted unsuccessfully.'}),
        apiError(400, {details: 'The previously submitted answer was rejected.'}),
        apiError(400, {detail: 'An answer must be submitted before proceeding to the next cluster.'}),
        apiError(400, {detail: 'The answer should have already been submitted.'}),
        apiError(400, {details: 'The cluster has already been registered.'}),
        apiError(400, {detail: 'The cluster already exists.'}),
        apiError(400, {detail: 'Already exists.'}),
        apiError(409, {details: 'This answer was already submitted for a different cluster.'}),
        apiError(409, {detail: 'A response was previously saved for the previous question.'}),
        apiError(409, {detail: 'این پاسخ برای خوشه دیگری قبلا ثبت شده است.'}),
        apiError(400, {detail: 'این پاسخ تکراری نیست.'}),
        apiError(400, {details: 'پاسخ شما پیش از این ذخیره نشده است.'}),
        apiError(400, {detail: 'اگر پاسخ قبلاً ثبت شده است با مسئول آزمون تماس بگیرید.'}),
        apiError(400, {details: 'No duplicate answer was found for this cluster.'}),
        apiError(400, {details: 'The username already exists.'}),
        apiError(400, {details: 'The session has already expired.'}),
        apiError(400, {details: 'پاسخ این خوشه قبلاً ثبت نشده است.'}),
        apiError(400, {details: 'پاسخ این خوشه قبلاً ثبت نگردیده است.'}),
        apiError(400, {details: 'پاسخ این خوشه از قبل وجود ندارد.'}),
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

test('expired participant recovery explains its deadline and the next signup step', () => {
    assert.equal(getTrialErrorMessage({code: 'PARTICIPANT_RECOVERY_EXPIRED'}, 'Fallback'),
        'مهلت ۱۲ ساعته بازیابی آزمون پایان یافته است. لطفاً برای شروع دوباره به صفحه ثبت‌نام برگردید.');
});

test('only explicit 4xx completion confirmations recover an interrupted phase completion', () => {
    assert.equal(isAlreadyCompletedError(apiError(409, {details: 'This session has already been completed.'})), true);
    assert.equal(isAlreadyCompletedError(apiError(400, {detail: 'این مرحله قبلاً تکمیل شده است.'})), true);
    assert.equal(isAlreadyCompletedError(apiError(409, {message: 'This session has already been completed.'})), true);
    assert.equal(isAlreadyCompletedError(apiError(409, {code: 'SESSION_ALREADY_COMPLETED'})), true);
    for (const error of [
        apiError(500, {detail: 'This session has already been completed.'}),
        apiError(400, {detail: 'This session has not already been completed.'}),
        apiError(400, {details: "This session hasn't already been completed."}),
        apiError(400, {detail: 'این مرحله قبلاً پایان نیافته است.'}),
        apiError(400, {detail: 'Already submitted for this cluster.'}),
        apiError(401, {detail: 'Invalid token.'}),
    ]) assert.equal(isAlreadyCompletedError(error), false);
});

test('no unrelated 4xx status can confirm an answer, phase, or video', () => {
    for (let status = 400; status < 500; status += 1) {
        const error = apiError(status, {detail: 'The request was rejected.'});
        assert.equal(isAlreadySubmittedError(error), false, String(status));
        assert.equal(isAlreadyCompletedError(error), false, String(status));
        assert.equal(isAlreadySeenError(error), false, String(status));
    }
});

test('a duplicate confirmation for a different cluster, session, or video is rejected', () => {
    assert.equal(isAlreadySubmittedError(apiError(409, {detail: 'Answer already submitted.', cluster_id: 12}), 11), false);
    assert.equal(isAlreadySubmittedError(apiError(409, {detail: 'Answer already submitted.', cluster_id: '11'}), 11), true);
    assert.equal(isAlreadyCompletedError(apiError(409, {detail: 'Session already completed.', session_id: 'old'}), 'current'), false);
    assert.equal(isAlreadySeenError(apiError(409, {detail: 'Video already seen.', session_video_id: 'old'}), 'current'), false);
});

test('duplicate video acknowledgments recover without bypassing other video failures', () => {
    for (const body of [
        {detail: 'This video has already been seen.'},
        {details: 'This video was already marked as watched.'},
        {message: 'Video already viewed.'},
        {code: 'SESSION_VIDEO_ALREADY_SEEN'},
        {error: {message: 'Video already completed.'}},
        'Already seen.',
        {detail: 'این ویدیو قبلاً مشاهده شده است.'},
    ]) assert.equal(isAlreadySeenError(apiError(409, body)), true, JSON.stringify(body));
    for (const error of [
        apiError(409, {detail: 'Video not already seen.'}),
        apiError(409, {detail: "This video hasn't already been seen."}),
        apiError(409, {detail: 'این ویدیو قبلاً مشاهده نشده است.'}),
        apiError(403, {detail: 'Permission denied.', message: 'Video already seen.'}),
        apiError(400, {detail: 'This session is already completed.'}),
        apiError(400, {detail: 'Answer already submitted.'}),
        apiError(500, {detail: 'Video already seen.'}),
    ]) assert.equal(isAlreadySeenError(error), false, JSON.stringify(error));
});
