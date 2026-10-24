import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createRequestLogArchive, createRequestLogMiddleware, MAX_REQUEST_LOG_BODY_BYTES } from './requestLogArchive.js';

const record = (updates = {}) => ({
    id: 'request-1',
    method: 'POST',
    startedAt: '2026-10-25T12:00:00.000Z',
    completedAt: '2026-10-25T12:00:00.024Z',
    profileId: 'participant-12',
    groupNumber: 0,
    sessionId: 'session-a',
    status: 400,
    category: 'client-error',
    request: { url: 'http://127.0.0.1:8000/probe/results/create/', body: { answer: 'LEFT' } },
    response: { body: { detail: 'Already submitted.' }, headers: { 'content-type': 'application/json' } },
    ...updates,
});

const temporaryDirectories = [];
after(() => {
    for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function tempDirectory() {
    const directory = mkdtempSync(path.join(tmpdir(), 'rahmati-request-logs-test-'));
    temporaryDirectories.push(directory);
    return directory;
}

test('records and their complete nested details survive archive close and reopen', t => {
    const dataDirectory = tempDirectory();
    const first = createRequestLogArchive({ dataDirectory });
    const payload = record();
    assert.deepEqual(first.append([payload]), ['request-1']);
    first.close();
    const reopened = createRequestLogArchive({ dataDirectory });
    t.after(() => reopened.close());
    assert.deepEqual(reopened.list(), [payload]);
});

test('retrying acknowledged or repeated IDs never overwrites the original record', t => {
    const archive = createRequestLogArchive({ dataDirectory: tempDirectory() });
    t.after(() => archive.close());
    const original = record();
    archive.append([original]);
    assert.deepEqual(archive.append([record({ status: 200 }), original]), [original.id]);
    assert.deepEqual(archive.list(), [original]);
});

test('invalid batches are atomic and cannot remove previously archived records', t => {
    const archive = createRequestLogArchive({ dataDirectory: tempDirectory() });
    t.after(() => archive.close());
    archive.append([record()]);
    assert.throws(() => archive.append([record({ id: 'would-be-valid' }), record({ id: 'invalid', method: 'post' })]), /Invalid request log batch/);
    assert.deepEqual(archive.list().map(item => item.id), ['request-1']);
    for (const updates of [
        { status: '200' }, { profileId: {} }, { groupNumber: undefined }, { sessionId: [] },
        { request: null }, { response: [] }, { completedAt: 'invalid date' },
        { id: '' },
    ]) assert.throws(() => archive.append([record(updates)]), /Invalid request log batch/);
    assert.throws(() => archive.append(Array.from({ length: 1001 }, () => record())), /Invalid request log batch/);
});

test('exact identity filters handle group zero and SQL-like identifiers safely', t => {
    const archive = createRequestLogArchive({ dataDirectory: tempDirectory() });
    t.after(() => archive.close());
    const hostileId = "profile' OR 1=1 --";
    archive.append([
        record(), record({ id: 'request-2', groupNumber: 1 }),
        record({ id: 'request-3', profileId: hostileId }),
        record({ id: 'request-4', sessionId: 'session-b' }),
    ]);
    assert.deepEqual(archive.list({ groupNumber: '0', profileId: 'participant-12', sessionId: 'session-a' }).map(item => item.id), ['request-1']);
    assert.deepEqual(archive.list({ profileId: hostileId }).map(item => item.id), ['request-3']);
    assert.equal(archive.list({ profileId: "' OR 1=1 --" }).length, 0);
    assert.equal(archive.list().length, 4);
});

test('network failures may have null status/session/profile and no HTTP response', t => {
    const archive = createRequestLogArchive({ dataDirectory: tempDirectory() });
    t.after(() => archive.close());
    const payload = record({ status: null, sessionId: null, profileId: null, groupNumber: null, response: null, category: 'network' });
    archive.append([payload]);
    assert.deepEqual(archive.list(), [payload]);
});

test('a system clock adjustment during a request does not discard the record', t => {
    const archive = createRequestLogArchive({ dataDirectory: tempDirectory() });
    t.after(() => archive.close());
    const payload = record({ completedAt: '2026-10-25T11:59:59.999Z', durationMs: 24 });
    archive.append([payload]);
    assert.deepEqual(archive.list(), [payload]);
});

async function httpFixture(t) {
    const dataDirectory = tempDirectory();
    const middleware = createRequestLogMiddleware({ dataDirectory });
    const server = createServer(middleware);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        middleware.close();
    });
    return { url: `http://127.0.0.1:${server.address().port}/api/request-logs`, middleware };
}

test('HTTP archive acknowledges disk writes and serves complete records with no cache', async t => {
    const { url, middleware } = await httpFixture(t);
    const write = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(url).origin },
        body: JSON.stringify({ records: [record()] }),
    });
    assert.equal(write.status, 200);
    assert.deepEqual(await write.json(), { ids: ['request-1'] });
    middleware.close();
    const read = await fetch(`${url}?groupNumber=0`);
    assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.equal(read.headers.get('access-control-allow-origin'), null);
    assert.deepEqual(await read.json(), { records: [record()], storage: 'disk', count: 1 });
});

test('HTTP rejects malformed JSON, invalid batch, cross-origin writes, and unsupported methods', async t => {
    const { url } = await httpFixture(t);
    const cases = [
        [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }, 400],
        [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: [record(), {}] }) }, 400],
        [{ method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }, 415],
        [{ method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: '{}' }, 403],
        [{ method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'null' }, body: '{}' }, 403],
        [{ method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{}' }, 403],
        [{ method: 'DELETE' }, 405],
    ];
    for (const [options, status] of cases) {
        const response = await fetch(url, options);
        assert.equal(response.status, status);
        assert.equal(typeof (await response.json()).error, 'string');
    }
    assert.equal((await (await fetch(url)).json()).count, 0);
});

test('middleware leaves unrelated application routes alone', async t => {
    const { url } = await httpFixture(t);
    assert.equal((await fetch(url.replace('/api/request-logs', '/unrelated'))).status, 404);
});

test('HTTP rejects an oversized body without appending partial data', async t => {
    const { url } = await httpFixture(t);
    const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: 'x'.repeat(MAX_REQUEST_LOG_BODY_BYTES + 1),
    });
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /too large/);
    assert.equal((await (await fetch(url)).json()).count, 0);
});
