import {PARTICIPANT_RECOVERY_LIFETIME_MS} from './participantRecovery.js';

export const PRACTICE_RESULT_STORAGE_KEY = 'probePracticeResult';
const VERSION = 1;

const validScope = scope => typeof scope?.token === 'string' && scope.token.length > 0
    && ((typeof scope.sessionId === 'string' && scope.sessionId.trim() !== '')
        || (typeof scope.sessionId === 'number' && Number.isFinite(scope.sessionId)));

export const normalizePracticeMark = value => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const mark = Number(value);
    return Number.isFinite(mark) && mark >= 0 && mark <= 100 ? mark : null;
};

// Completing the practice session can be a one-time operation. Keep its actual
// backend score so returning to the report never needs to complete it again.
export const readPracticeResult = (storage, scope, now = Date.now()) => {
    if (!validScope(scope)) return null;
    if (Number.isFinite(scope.expiresAt) && now >= scope.expiresAt) return null;
    try {
        const saved = JSON.parse(storage.getItem(PRACTICE_RESULT_STORAGE_KEY));
        if (saved?.version !== VERSION || saved.token !== scope.token
            || saved.sessionId !== String(scope.sessionId)
            || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= now) return null;
        return normalizePracticeMark(saved.mark);
    } catch {
        return null;
    }
};

export const writePracticeResult = (storage, scope, value, now = Date.now()) => {
    try {
        const mark = normalizePracticeMark(value);
        if (!validScope(scope) || mark === null || !Number.isFinite(now)) {
            throw new Error('The practice result is invalid.');
        }
        if (Number.isFinite(scope.expiresAt) && now >= scope.expiresAt) {
            const error = new Error('The participant recovery window has expired.');
            error.code = 'PARTICIPANT_RECOVERY_EXPIRED';
            throw error;
        }
        storage.setItem(PRACTICE_RESULT_STORAGE_KEY, JSON.stringify({
            version: VERSION,
            token: scope.token,
            sessionId: String(scope.sessionId),
            mark,
            expiresAt: Math.min(
                now + PARTICIPANT_RECOVERY_LIFETIME_MS,
                Number.isFinite(scope.expiresAt) ? scope.expiresAt : Infinity,
            ),
        }));
        return mark;
    } catch (cause) {
        if (cause?.code === 'PARTICIPANT_RECOVERY_EXPIRED') throw cause;
        const error = new Error('The practice result could not be saved.', {cause});
        error.code = 'PRACTICE_RESULT_WRITE_FAILED';
        throw error;
    }
};
