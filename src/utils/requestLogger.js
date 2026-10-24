import {recordRequestLog, startRequestLogStorage} from './requestLogStore.js';

const INSTALLED = Symbol.for('rahmati.requestLogger');
const SECRET_KEY = /^(authorization|proxyauthorization|cookie|setcookie|password|passwd|secret|clientsecret|token|authtoken|accesstoken|refreshtoken|idtoken|apikey|csrftoken|xcsrftoken|xapikey)$/i;
const secretKey = key => SECRET_KEY.test(String(key).replace(/[-_\s]/g, ''));
const parse = value => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
};

export const sanitizeLogUrl = value => {
    try {
        const url = new URL(String(value), 'http://request.local');
        url.username = ''; url.password = '';
        for (const key of [...url.searchParams.keys()]) {
            if (secretKey(key)) url.searchParams.set(key, '[REDACTED]');
        }
        url.hash = '';
        return url.origin === 'http://request.local' ? `${url.pathname}${url.search}` : url.href;
    } catch { return '[Invalid URL]'; }
};

// Capture JSON without truncating payloads. Credentials are deliberately excluded.
export const sanitizeLogValue = (value, seen = new WeakSet()) => {
    if (value === null || value === undefined) return value ?? null;
    if (typeof value === 'string') {
        const parsed = /^[\s]*[\[{]/.test(value) ? parse(value) : value;
        if (parsed !== value) return sanitizeLogValue(parsed, seen);
        return value
            .replace(/\b(Bearer|token)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
            .replace(/([?&](?:token|auth_token|access_token|refresh_token|api_key|password|secret)=)[^&#\s]*/gi, '$1[REDACTED]');
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    try {
        if (value instanceof Date) return value.toISOString();
        if (typeof Blob !== 'undefined' && value instanceof Blob) {
            return {type: 'binary', mimeType: value.type, size: value.size,
                ...(typeof File !== 'undefined' && value instanceof File ? {name: value.name} : {})};
        }
        if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
            return {type: 'binary', size: value.byteLength};
        }
        if (typeof FormData !== 'undefined' && value instanceof FormData) {
            return [...value.entries()].map(([key, item]) => [key, secretKey(key) ? '[REDACTED]' : sanitizeLogValue(item, seen)]);
        }
        if (value instanceof URLSearchParams) {
            return [...value.entries()].map(([key, item]) => [key, secretKey(key) ? '[REDACTED]' : sanitizeLogValue(item, seen)]);
        }
        const result = Array.isArray(value) ? [] : {};
        for (const [key, item] of Object.entries(value)) {
            result[key] = secretKey(key) ? '[REDACTED]' : sanitizeLogValue(item, seen);
        }
        return result;
    } finally { seen.delete(value); }
};

const readStorage = (storage, key) => {
    try { return storage?.getItem(key) ?? null; } catch { return null; }
};
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let fallbackSession;
const browserSession = storage => {
    let session = readStorage(storage, 'requestLogBrowserSession');
    if (!session) {
        session = fallbackSession ??= id();
        try { storage?.setItem('requestLogBrowserSession', session); } catch { /* The record still has a session ID. */ }
    }
    return session;
};
const nullableId = value => value === null || value === undefined || value === '' ? null : String(value);

export const captureLogContext = (config, environment = globalThis) => {
    let storage;
    let sessionStorage;
    try { storage = environment.localStorage; sessionStorage = environment.sessionStorage; } catch { /* Restricted browser storage. */ }
    const body = parse(config.data);
    const headers = config.headers?.toJSON?.() ?? config.headers ?? {};
    const auth = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
    const token = typeof auth === 'string' ? auth.replace(/^(token|bearer)\s+/i, '') : null;
    const vault = parse(readStorage(storage, 'probeParticipantRecovery'));
    const recovery = token ? Object.values(vault?.records ?? {}).find(record => record?.token === token) : null;
    const active = token && token === readStorage(storage, 'authToken');
    const snapshot = active ? {
        currentSessionID: readStorage(storage, 'currentSessionID'),
        currentPhaseID: readStorage(storage, 'currentPhaseID'),
        currentPhase: readStorage(storage, 'currentPhase'),
        currentPhaseName: readStorage(storage, 'currentPhaseName'),
    } : recovery?.snapshot ?? {};
    const explicit = config.logContext ?? {};
    const subject = body?.subject_id ?? recovery?.identity?.subject_id;
    const isSessionCreation = /(?:^|\/)probe\/sessions\/create\/?(?:\?|$)/.test(config.url ?? '');
    return {
        browserSessionId: browserSession(sessionStorage),
        profileId: nullableId(explicit.profileId ?? body?.profile_id ?? subject),
        groupNumber: explicit.groupNumber ?? body?.group_number ?? body?.group ?? recovery?.identity?.group ?? null,
        sessionId: nullableId(explicit.sessionId ?? body?.session_id ?? config.params?.session_id
            ?? (isSessionCreation ? null : snapshot.currentSessionID)),
        phaseId: nullableId(explicit.phaseId ?? body?.phase_id ?? snapshot.currentPhaseID),
        phase: explicit.phase ?? snapshot.currentPhase ?? null,
        phaseName: explicit.phaseName ?? snapshot.currentPhaseName ?? null,
        pageUrl: sanitizeLogUrl(environment.location?.href ?? '/'),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        online: environment.navigator?.onLine ?? true,
        userAgent: environment.navigator?.userAgent ?? null,
    };
};

export const logCategory = (status, error) => {
    if (error?.code === 'ERR_CANCELED') return 'canceled';
    if (status >= 200 && status < 300) return 'success';
    if (status >= 400 && status < 500) return 'client-error';
    if (status >= 500) return 'server-error';
    return status ? 'other' : 'network-error';
};

export const installRequestLogging = (client, options = {}) => {
    if (client[INSTALLED]) return client[INSTALLED];
    const persist = options.persist ?? recordRequestLog;
    const environment = options.environment ?? globalThis;
    const now = options.now ?? (() => Date.now());
    if (!options.persist) startRequestLogStorage();
    const requestInterceptor = client.interceptors.request.use(config => {
        // The recorder uses fetch, so its own archive requests never recurse here.
        try {
            const started = now();
            const headers = config.headers?.toJSON?.() ?? config.headers;
            config.__requestLog = {
                id: id(), ...captureLogContext(config, environment),
                startedAt: new Date(started).toISOString(), started,
                clock: environment.performance?.now?.(),
                method: String(config.method ?? 'get').toUpperCase(),
                url: sanitizeLogUrl(client.getUri(config)),
                request: {headers: sanitizeLogValue(headers), params: sanitizeLogValue(config.params), body: sanitizeLogValue(config.data)},
            };
        } catch (error) { console.error('Request logging initialization failed:', error); }
        return config;
    }, undefined, {synchronous: true});
    const capture = (response, error) => {
        const config = response?.config ?? error?.config;
        const metadata = config?.__requestLog;
        if (!metadata) return;
        try {
            const completed = now();
            const {started, clock, ...details} = metadata;
            const elapsed = clock === undefined ? completed - started : environment.performance.now() - clock;
            const status = response?.status ?? null;
            const record = {
                ...details,
                sessionId: /(?:^|\/)probe\/sessions\/create\/?(?:\?|$)/.test(config.url ?? '')
                    ? nullableId(response?.data?.session_id) : details.sessionId,
                completedAt: new Date(completed).toISOString(),
                durationMs: Math.max(0, Math.round(elapsed * 100) / 100),
                status, statusText: response?.statusText ?? null,
                category: logCategory(status, error),
                response: response ? {headers: sanitizeLogValue(response.headers?.toJSON?.() ?? response.headers), body: sanitizeLogValue(response.data)} : null,
                error: error ? {name: error.name, code: error.code ?? null,
                    message: sanitizeLogValue(error.message), stack: sanitizeLogValue(error.stack)} : null,
            };
            // Do not await disk/network work on the experiment's response path.
            const save = async () => {
                const responseBody = response?.data;
                // Downloads use responseType:'blob'; even their JSON/HTML error
                // bodies must remain readable in full instead of just file metadata.
                if (typeof Blob !== 'undefined' && responseBody instanceof Blob
                    && (status >= 400 || /json|text|xml/i.test(responseBody.type))) {
                    record.response.body = sanitizeLogValue(await responseBody.text());
                } else if (status >= 400 && responseBody instanceof ArrayBuffer) {
                    record.response.body = sanitizeLogValue(new TextDecoder().decode(responseBody));
                }
                await persist(record);
            };
            void save().catch(failure => console.error('Request recording failed:', failure));
        } catch (failure) { console.error('Request recording failed:', failure); }
    };
    const responseInterceptor = client.interceptors.response.use(response => {
        capture(response);
        return response;
    }, error => {
        capture(error.response, error);
        return Promise.reject(error);
    });
    const uninstall = () => {
        client.interceptors.request.eject(requestInterceptor);
        client.interceptors.response.eject(responseInterceptor);
        delete client[INSTALLED];
    };
    client[INSTALLED] = uninstall;
    return uninstall;
};
