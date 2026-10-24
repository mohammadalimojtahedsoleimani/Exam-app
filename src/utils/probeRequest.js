export const PROBE_REQUEST_TIMEOUT_MS = 15000;
export const PROBE_MAX_RETRIES = 2;
const MAX_AUTOMATIC_DELAY_MS = 10000;

const interrupted = () => {
    const error = new Error('The participant or exam session changed during this request.');
    error.code = 'PROBE_REQUEST_SUPERSEDED';
    return error;
};

// Snapshot ownership before sending. Never retry an old participant's request
// after a profile, session, phase, or recovery deadline changes.
export const captureProbeRequestGuard = token => {
    let storage;
    try { storage = globalThis.localStorage; } catch { return () => false; }
    if (!storage) return () => true; // Non-browser API tests and callers.
    const keys = ['authToken', 'currentSessionID', 'currentPhaseID', 'currentPhase'];
    let original;
    let expiresAt;
    try {
        original = keys.map(key => storage.getItem(key));
        const vault = JSON.parse(storage.getItem('probeParticipantRecovery'));
        expiresAt = Object.values(vault?.records ?? {}).find(record => record?.token === token)?.expiresAt;
    } catch { /* An absent or malformed recovery vault does not invent a new deadline. */ }
    if (!original) return () => false;
    return () => {
        try {
            return original[0] === token && (!Number.isFinite(expiresAt) || Date.now() < expiresAt)
                && keys.every((key, index) => storage.getItem(key) === original[index]);
        } catch { return false; }
    };
};

export const getProbeRetryDelay = (error, attempt, now = Date.now()) => {
    const headers = error?.response?.headers;
    const value = headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? headers?.['Retry-After'];
    if (value !== null && value !== undefined && String(value).trim()) {
        const text = String(value).trim();
        if (/^\d+$/.test(text)) return Number(text) * 1000;
        const timestamp = Date.parse(text);
        if (Number.isFinite(timestamp)) return Math.max(0, timestamp - now);
    }
    return 1000 * (2 ** attempt);
};

export const isTransientProbeError = error => {
    if (['ERR_CANCELED', 'PROBE_REQUEST_SUPERSEDED'].includes(error?.code)) return false;
    const status = Number(error?.response?.status);
    return [408, 425, 429].includes(status) || (status >= 500 && status < 600)
        || (!error?.response && (['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)
            || Boolean(error?.request)));
};

// Retry only operations whose duplicate acknowledgments are understood. Session
// creation opts out: retrying a lost create response could create another session.
export const performProbeRequest = async (send, {
    recover = () => false,
    isCurrent = () => true,
    maxRetries = PROBE_MAX_RETRIES,
    sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
} = {}) => {
    for (let attempt = 0; ; attempt += 1) {
        if (!isCurrent()) throw interrupted();
        try {
            const response = await send();
            if (!isCurrent()) throw interrupted();
            return response;
        } catch (error) {
            if (!isCurrent()) throw interrupted();
            if (recover(error)) return error.response;
            if (!isTransientProbeError(error) || attempt >= maxRetries) throw error;
            const delay = getProbeRetryDelay(error, attempt);
            // Respect longer Retry-After values by leaving the existing manual
            // retry available, rather than holding the page in a long spinner.
            if (delay > MAX_AUTOMATIC_DELAY_MS) throw error;
            await sleep(delay);
        }
    }
};
