import assert from 'node:assert/strict';
import test from 'node:test';
import axios, {AxiosError, CanceledError} from 'axios';
import {
    captureLogContext, installRequestLogging, sanitizeLogUrl, sanitizeLogValue,
} from './requestLogger.js';
import {isAlreadySubmittedError} from './trialErrors.js';

const storage = (initial = {}) => {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
};

const participant = (subject, token, group, session) => ({
    identity: {subject_id: subject, age: 30, gender: 'FEMALE', group}, token,
    snapshot: {authToken: token, currentSessionID: session, currentPhaseID: 'phase-1', currentPhase: '1'},
});

const makeEnvironment = () => ({
    localStorage: storage(), sessionStorage: storage(),
    location: {href: 'http://localhost:5173/Trial'},
    navigator: {onLine: true, userAgent: 'request-logger-test'},
});

const activate = (environment, record, records = [record]) => {
    const vault = Object.fromEntries(records.map(item => [item.identity.subject_id, item]));
    environment.localStorage.setItem('probeParticipantRecovery', JSON.stringify({version: 1, records: vault}));
    environment.localStorage.setItem('authToken', record.token);
    for (const [key, value] of Object.entries(record.snapshot)) environment.localStorage.setItem(key, value);
};

const createHarness = ({environment = makeEnvironment(), persist} = {}) => {
    const records = [];
    const client = axios.create({baseURL: 'http://127.0.0.1:8000/'});
    let wall = Date.UTC(2026, 9, 25, 10, 20, 30);
    let monotonic = 100;
    environment.performance = {now: () => monotonic};
    const advance = (milliseconds, wallMilliseconds = milliseconds) => {
        monotonic += milliseconds;
        wall += wallMilliseconds;
    };
    const uninstall = installRequestLogging(client, {
        environment, now: () => wall, persist: persist ?? (record => records.push(record)),
    });
    return {client, records, environment, advance, uninstall};
};

const responseAdapter = (status, data = {detail: 'Recorded'}, options = {}) => config => {
    options.beforeResponse?.(config);
    const response = {
        config, data, status, statusText: options.statusText ?? `HTTP ${status}`,
        headers: options.headers ?? {'content-type': 'application/json'},
    };
    if (status >= 400) {
        return Promise.reject(new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', config, {}, response));
    }
    return Promise.resolve(response);
};

test('records 2xx and 4xx for every supported HTTP method without changing outcomes', async () => {
    const {client, records} = createHarness();
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    for (const method of methods) {
        for (const status of [200, 201, 204, 299, 400, 404, 422, 499]) {
            const request = client.request({method, url: 'probe/results/create/', adapter: responseAdapter(status)});
            if (status >= 400) await assert.rejects(request, error => error.response.status === status);
            else assert.equal((await request).status, status);
            const record = records.at(-1);
            assert.equal(record.method, method.toUpperCase());
            assert.equal(record.status, status);
            assert.equal(record.category, status < 300 ? 'success' : 'client-error');
        }
    }
    assert.equal(records.length, methods.length * 8);
    assert.equal(new Set(records.map(record => record.id)).size, records.length);
});

test('records an already-submitted 4xx before a caller consumes it as recovered', async () => {
    const {client, records} = createHarness();
    let recovered = false;
    try {
        await client.post('probe/results/create/', {cluster_id: 'cluster-2'}, {
            adapter: responseAdapter(409, {detail: 'This cluster has already been answered.'}),
        });
    } catch (error) {
        if (!isAlreadySubmittedError(error)) throw error;
        recovered = true;
    }
    assert.equal(recovered, true);
    assert.equal(records.length, 1);
    assert.equal(records[0].status, 409);
    assert.equal(records[0].response.body.detail, 'This cluster has already been answered.');
});

test('retains the actual HTTP response, request context, and monotonic duration', async () => {
    const environment = makeEnvironment();
    activate(environment, participant('profile-A', 'auth-A', 3, 'session-A'));
    const {client, records, advance} = createHarness({environment});
    const response = await client.post('probe/results/create/', {cluster_id: 'cluster-A', response_time: 412}, {
        headers: {Authorization: 'token auth-A', 'X-Trace-Id': 'trace-A'},
        params: {view: 'full'},
        adapter: responseAdapter(201, {id: 'answer-A'}, {
            statusText: 'Created', headers: {'x-request-id': 'server-A'},
            beforeResponse: () => advance(12.345, -500),
        }),
    });
    const record = records[0];
    assert.equal(response.status, 201);
    assert.equal(record.profileId, 'profile-A');
    assert.equal(record.groupNumber, 3);
    assert.equal(record.sessionId, 'session-A');
    assert.equal(record.phaseId, 'phase-1');
    assert.equal(record.phase, '1');
    assert.equal(record.durationMs, 12.35);
    assert.equal(record.startedAt, '2026-10-25T10:20:30.000Z');
    assert.equal(record.completedAt, '2026-10-25T10:20:29.500Z');
    assert.deepEqual(record.request.body, {cluster_id: 'cluster-A', response_time: 412});
    assert.deepEqual(record.request.params, {view: 'full'});
    assert.equal(record.request.headers['X-Trace-Id'], 'trace-A');
    assert.equal(record.request.headers.Authorization, '[REDACTED]');
    assert.equal(record.url, 'http://127.0.0.1:8000/probe/results/create/?view=full');
    assert.equal(record.statusText, 'Created');
    assert.equal(record.response.headers['x-request-id'], 'server-A');
    assert.deepEqual(record.response.body, {id: 'answer-A'});
    assert.equal(record.error, null);
    assert.equal(record.userAgent, 'request-logger-test');
    assert.equal(record.pageUrl, 'http://localhost:5173/Trial');
    assert.ok(record.browserSessionId);
    assert.ok(record.timeZone);
});

test('records 5xx, network errors, timeouts, and cancellations while preserving original errors', async () => {
    const {client, records} = createHarness();
    await assert.rejects(client.get('probe/phases/', {adapter: responseAdapter(503)}));
    assert.equal(records.at(-1).category, 'server-error');
    assert.equal(records.at(-1).status, 503);
    for (const [code, category] of [['ERR_NETWORK', 'network-error'], ['ECONNABORTED', 'network-error'], ['ERR_CANCELED', 'canceled']]) {
        let original;
        await assert.rejects(client.get('probe/phases/', {
            adapter: config => {
                original = code === 'ERR_CANCELED'
                    ? new CanceledError('Participant canceled', config)
                    : new AxiosError('Connection failed', code, config);
                return Promise.reject(original);
            },
        }), error => error === original);
        const record = records.at(-1);
        assert.equal(record.category, category);
        assert.equal(record.status, null);
        assert.equal(record.response, null);
        assert.equal(record.error.code, code);
        assert.equal(record.error.message, original.message);
        assert.ok(record.error.stack.includes(original.message));
    }
});

test('successful session creation uses its returned session and failed creation does not reuse the old one', async () => {
    const environment = makeEnvironment();
    activate(environment, participant('profile-A', 'auth-A', 2, 'previous-session'));
    const {client, records} = createHarness({environment});
    const config = {headers: {Authorization: 'token auth-A'}};
    await client.post('/probe/sessions/create/', {phase_id: 'next-phase'}, {
        ...config, adapter: responseAdapter(201, {session_id: 'new-session'}),
    });
    assert.equal(records[0].sessionId, 'new-session');
    assert.equal(records[0].phaseId, 'next-phase');
    await assert.rejects(client.post('/probe/sessions/create/', {phase_id: 'next-phase'}, {
        ...config, adapter: responseAdapter(409, {detail: 'Unable to create session.'}),
    }));
    assert.equal(records[1].sessionId, null);
});

test('keeps request-time identity when another participant activates before the response', async () => {
    const environment = makeEnvironment();
    const first = participant('profile-A', 'auth-A', 0, 'session-A');
    const second = participant('profile-B', 'auth-B', 4, 'session-B');
    activate(environment, first, [first, second]);
    const {client, records} = createHarness({environment});
    let finish;
    const pending = client.post('/probe/results/create/', {cluster_id: 'cluster-A'}, {
        headers: {Authorization: 'token auth-A'},
        adapter: config => new Promise(resolve => {
            finish = () => resolve({config, status: 200, statusText: 'OK', headers: {}, data: {saved: true}});
        }),
    });
    activate(environment, second, [first, second]);
    finish();
    await pending;
    assert.equal(records[0].profileId, 'profile-A');
    assert.equal(records[0].groupNumber, 0);
    assert.equal(records[0].sessionId, 'session-A');

    await client.get('/probe/sessions/clusters/', {
        headers: {Authorization: 'token auth-A'}, adapter: responseAdapter(200),
    });
    assert.equal(records[1].profileId, 'profile-A');
    assert.equal(records[1].sessionId, 'session-A');
});

test('registration captures submitted profile and group zero before recovery exists', async () => {
    const {client, records} = createHarness();
    await client.post('/user/participant/register/', {subject_id: 'profile-new', group: 0}, {
        adapter: responseAdapter(201, {token: 'private-registration-token'}),
    });
    assert.equal(records[0].profileId, 'profile-new');
    assert.equal(records[0].groupNumber, 0);
    assert.equal(records[0].sessionId, null);
    assert.equal(records[0].response.body.token, '[REDACTED]');
});

test('researcher requests avoid stale participant identity and accept selected profile context', async () => {
    const environment = makeEnvironment();
    activate(environment, participant('stale-participant', 'stale-token', 9, 'stale-session'));
    const {client, records} = createHarness({environment});
    await client.get('/user/participants/', {adapter: responseAdapter(200, [])});
    assert.equal(records[0].profileId, null);
    assert.equal(records[0].groupNumber, null);
    assert.equal(records[0].sessionId, null);
    await client.get('/user/participants/selected/', {
        logContext: {profileId: 'selected', groupNumber: 0}, adapter: responseAdapter(200),
    });
    assert.equal(records[1].profileId, 'selected');
    assert.equal(records[1].groupNumber, 0);
    assert.equal(records[1].sessionId, null);
});

test('explicit session and phase metadata take precedence over the runtime snapshot', () => {
    const environment = makeEnvironment();
    activate(environment, participant('profile-A', 'auth-A', 2, 'old-session'));
    const base = {url: '/probe/sessions/complete/', headers: {Authorization: 'token auth-A'}};
    assert.equal(captureLogContext({...base, data: {session_id: 'body-session'}}, environment).sessionId, 'body-session');
    assert.equal(captureLogContext({...base, params: {session_id: 'query-session'}}, environment).sessionId, 'query-session');
    const explicit = captureLogContext({
        ...base, data: {session_id: 'body-session'},
        logContext: {sessionId: 'explicit-session', phaseId: 'explicit-phase', phase: 4},
    }, environment);
    assert.equal(explicit.sessionId, 'explicit-session');
    assert.equal(explicit.phaseId, 'explicit-phase');
    assert.equal(explicit.phase, 4);
});

test('redacts credentials in nested payloads, headers, and URL parameters without mutating inputs', async () => {
    const {client, records, environment} = createHarness();
    environment.location.href = 'https://researcher:private@example.test/logs?access_token=page-secret#private-fragment';
    const body = {entries: [{password: 'private-password', value: 'keep'}], client_secret: 'private-client-secret'};
    await client.post('https://researcher:private@example.test/result?api_key=url-secret&keep=yes', body, {
        params: {refresh_token: 'parameter-secret'},
        headers: {Authorization: 'Bearer header-secret', 'X-Api-Key': 'private-api-key'},
        adapter: responseAdapter(200, {nested: {access_token: 'private-access-token'}, detail: 'Bearer free-text-secret'}, {
            headers: {'set-cookie': 'private-session-cookie', 'x-visible': 'visible'},
        }),
    });
    const record = records[0];
    const serialized = JSON.stringify(record);
    for (const secret of ['private-password', 'private-client-secret', 'url-secret', 'parameter-secret', 'header-secret', 'private-api-key', 'private-access-token', 'free-text-secret', 'private-session-cookie', 'page-secret', 'private-fragment', 'researcher:private']) {
        assert.equal(serialized.includes(secret), false, secret);
    }
    assert.equal(record.request.body.entries[0].value, 'keep');
    assert.equal(record.response.headers['x-visible'], 'visible');
    assert.equal(body.entries[0].password, 'private-password');
    assert.equal(new URL(record.url).searchParams.get('keep'), 'yes');
    assert.equal(new URL(record.url).searchParams.get('api_key'), '[REDACTED]');
});

test('preserves long request and response bodies without truncation', async () => {
    const {client, records} = createHarness();
    const largeText = 'research-data-'.repeat(25_000);
    await client.post('/probe/results/create/', {data: largeText}, {
        adapter: responseAdapter(200, {data: largeText}),
    });
    assert.equal(records[0].request.body.data, largeText);
    assert.equal(records[0].response.body.data, largeText);
});

test('keeps the complete nested 4xx validation body including long detail arrays and primitive-looking strings', async () => {
    const {client, records} = createHarness();
    const body = {
        detail: 'The submitted profile could not be validated.',
        validation: {
            fields: {
                subject_id: ['This profile has already registered.', 'A different identifier is required.'],
                group: ['Choose a configured group.'],
            },
            details: Array.from({length: 500}, (_, index) => ({
                code: `validation-${index}`, explanation: `Full server explanation ${index}: ${'context '.repeat(30)}`,
            })),
        },
        context: {submitted_as_string: '123', flag_as_string: 'true', literal_null: 'null', numeric: 123, flag: false, empty: '', absent: null},
    };
    await assert.rejects(client.post('/user/participant/register/', {subject_id: 'profile-invalid', group: 0}, {
        adapter: responseAdapter(422, body),
    }), error => {
        assert.deepEqual(error.response.data, body);
        return true;
    });
    assert.deepEqual(records[0].response.body, body);
    assert.equal(records[0].category, 'client-error');
    assert.equal(records[0].response.body.validation.details.length, 500);
});

test('keeps full plain-text 4xx response bodies', async () => {
    const {client, records} = createHarness();
    const text = `Request rejected by the server.\n${'The complete diagnostic detail remains available.\n'.repeat(1000)}`;
    await assert.rejects(client.delete('/probe/results/create/', {
        adapter: responseAdapter(403, text, {headers: {'content-type': 'text/plain'}}),
    }));
    assert.equal(records[0].response.body, text);
    assert.equal(records[0].response.headers['content-type'], 'text/plain');
});

test('reads complete JSON and plain-text Blob error bodies without changing the rejected response', async () => {
    const validation = {detail: 'The downloaded report is unavailable.', fields: {subject_id: ['Choose an existing profile.']}};
    const plainText = `Report access denied.\n${'Full server diagnostic detail.\n'.repeat(1000)}`;
    for (const [status, mimeType, text, expected] of [
        [400, 'application/json', JSON.stringify(validation), validation],
        [403, 'text/plain', plainText, plainText],
    ]) {
        let persisted;
        const saved = new Promise(resolve => { persisted = resolve; });
        const {client} = createHarness({persist: record => persisted(record)});
        const body = new Blob([text], {type: mimeType});
        await assert.rejects(client.get('/reports/phase.xlsx', {
            responseType: 'blob', adapter: responseAdapter(status, body, {headers: {'content-type': mimeType}}),
        }), error => {
            assert.equal(error.response.data, body);
            assert.equal(error.response.status, status);
            return true;
        });
        const record = await saved;
        assert.deepEqual(record.response.body, expected);
        assert.equal(record.category, 'client-error');
        assert.equal(record.status, status);
        assert.equal(record.response.headers['content-type'], mimeType);
    }
});

test('decodes complete ArrayBuffer 4xx bodies including Unicode server details', async () => {
    const expected = {
        detail: 'گزارش برای این شناسه در دسترس نیست.',
        fields: {profile: ['Profile missing'], context: 'Extended diagnostic text. '.repeat(2000)},
    };
    const body = new TextEncoder().encode(JSON.stringify(expected)).buffer;
    let persisted;
    const saved = new Promise(resolve => { persisted = resolve; });
    const {client} = createHarness({persist: record => persisted(record)});
    await assert.rejects(client.get('/reports/phase.xlsx', {
        responseType: 'arraybuffer', adapter: responseAdapter(422, body, {headers: {'content-type': 'application/json'}}),
    }), error => {
        assert.equal(error.response.data, body);
        return true;
    });
    const record = await saved;
    assert.deepEqual(record.response.body, expected);
    assert.equal(record.status, 422);
    assert.equal(record.category, 'client-error');
});

test('redacts credential assignments in error messages and stacks', async () => {
    const {client, records} = createHarness();
    await assert.rejects(client.get('/probe/phases/', {
        adapter: config => Promise.reject(new AxiosError(
            'Failed https://example.test/request?token=private-error-token&access_token=private-error-access',
            'ERR_NETWORK', config,
        )),
    }));
    assert.equal(JSON.stringify(records[0].error).includes('private-error-token'), false);
    assert.equal(JSON.stringify(records[0].error).includes('private-error-access'), false);
});

test('handles circular values and binary metadata without losing adjacent fields', () => {
    const value = {visible: 'keep', password: 'secret'};
    value.self = value;
    assert.deepEqual(sanitizeLogValue(value), {visible: 'keep', password: '[REDACTED]', self: '[Circular]'});
    assert.deepEqual(sanitizeLogValue(new Uint8Array([1, 2, 3])), {type: 'binary', size: 3});
    assert.equal(sanitizeLogUrl('/path?token=private&value=7'), '/path?token=%5BREDACTED%5D&value=7');
});

test('synchronous and asynchronous persistence failure preserve HTTP success and failure', async t => {
    const errors = [];
    t.mock.method(console, 'error', (...args) => errors.push(args));
    for (const persist of [() => { throw new Error('Disk unavailable'); }, () => Promise.reject(new Error('Disk unavailable'))]) {
        const {client} = createHarness({persist});
        const response = await client.post('/probe/results/create/', {answer: 'LEFT'}, {adapter: responseAdapter(201)});
        assert.equal(response.status, 201);
        let original;
        await assert.rejects(client.post('/probe/results/create/', {}, {
            adapter: config => {
                original = new AxiosError('No connection', 'ERR_NETWORK', config);
                return Promise.reject(original);
            },
        }), error => error === original);
    }
    assert.equal(errors.length, 4);
});

test('installing twice records once and uninstalling removes both interceptors', async () => {
    const {client, records, uninstall} = createHarness();
    const secondRecords = [];
    const secondUninstall = installRequestLogging(client, {persist: record => secondRecords.push(record)});
    assert.equal(secondUninstall, uninstall);
    await client.get('/probe/phases/', {adapter: responseAdapter(200)});
    assert.equal(records.length, 1);
    assert.equal(secondRecords.length, 0);
    uninstall();
    await client.get('/probe/phases/', {adapter: responseAdapter(200)});
    assert.equal(records.length, 1);
});
