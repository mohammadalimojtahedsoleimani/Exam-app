// Last-resort values for unrecoverable response data. Keep these separate from
// measured data, and never use the target position to manufacture an answer.
export const DEFAULT_TRIAL_ANSWER = 'LEFT';
export const DEFAULT_TRIAL_RESPONSE_TIME = 0;

const normalizeAnswer = (value) => {
    if (typeof value !== 'string') return null;
    const answer = value.trim().toUpperCase();
    return answer === 'LEFT' || answer === 'RIGHT' ? answer : null;
};

const nonNegativeNumber = (value) => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
};

export const createTrialSubmission = ({
    clusterId,
    answer,
    previousSubmission,
    targetStartTime,
    responseTimestamp,
    currentTimestamp,
}) => {
    // A previous cluster's response must never become this cluster's answer.
    const saved = previousSubmission?.cluster_id === clusterId ? previousSubmission : null;
    const resolvedAnswer = normalizeAnswer(saved?.answer) ?? normalizeAnswer(answer);
    const savedResponseTime = nonNegativeNumber(saved?.response_time);
    const start = nonNegativeNumber(targetStartTime);
    const eventTime = nonNegativeNumber(responseTimestamp);
    const now = nonNegativeNumber(currentTimestamp);

    // Ignore incompatible clocks (e.g. an epoch-based event timestamp). If the
    // event timestamp is unusable, try the current performance clock instead.
    const responseAt = start !== null && eventTime !== null && eventTime >= start
        && (now === null || eventTime <= now)
        ? eventTime
        : now;
    const measuredResponseTime = start !== null && responseAt !== null && responseAt >= start
        ? responseAt - start
        : null;
    const resolvedResponseTime = savedResponseTime ?? measuredResponseTime;

    return {
        payload: {
            cluster_id: clusterId,
            answer: resolvedAnswer ?? DEFAULT_TRIAL_ANSWER,
            response_time: Math.round(resolvedResponseTime ?? DEFAULT_TRIAL_RESPONSE_TIME),
        },
        usedDefaultAnswer: resolvedAnswer === null,
        usedDefaultResponseTime: resolvedResponseTime === null,
    };
};
