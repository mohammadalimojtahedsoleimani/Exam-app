import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUEST_LOG_ROUTE = '/api/request-logs';
export const MAX_REQUEST_LOG_BODY_BYTES = 32 * 1024 * 1024;
const DEFAULT_DATA_DIRECTORY = fileURLToPath(new URL('../data/', import.meta.url));
const MAX_BATCH_SIZE = 1000;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isIdentifier = value => value === null || (typeof value === 'string' && value.length <= 1024)
    || (typeof value === 'number' && Number.isFinite(value));
const isTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export const isValidRequestLog = record => isObject(record)
    && typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 256
    && typeof record.method === 'string' && /^[A-Z][A-Z0-9!#$%&'*+.^_`|~-]{0,63}$/.test(record.method)
    && isTimestamp(record.startedAt) && isTimestamp(record.completedAt)
    && isIdentifier(record.profileId) && isIdentifier(record.groupNumber) && isIdentifier(record.sessionId)
    && (record.status === null || (Number.isInteger(record.status) && record.status >= 100 && record.status <= 599))
    && typeof record.category === 'string' && record.category.length > 0 && record.category.length <= 64
    && isObject(record.request) && (record.response === null || isObject(record.response));

/** Append-only disk archive. IDs are idempotency keys; no record is overwritten. */
export function createRequestLogArchive(options = {}) {
    const directory = path.resolve(options.dataDirectory ?? process.env.REQUEST_LOG_DATA_DIR ?? DEFAULT_DATA_DIRECTORY);
    const filename = path.join(directory, 'request-logs.sqlite');
    let database;

    const open = () => {
        if (database) return database;
        mkdirSync(directory, { recursive: true });
        const connection = new DatabaseSync(filename);
        try {
            connection.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = FULL;
            PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS request_logs (
                id TEXT PRIMARY KEY,
                received_at TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                profile_id TEXT,
                group_number TEXT,
                session_id TEXT,
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS request_logs_completed_at ON request_logs(completed_at DESC);
            CREATE INDEX IF NOT EXISTS request_logs_identity ON request_logs(profile_id, group_number, session_id);
            `);
        } catch (error) {
            connection.close();
            throw error;
        }
        database = connection;
        return database;
    };

    return {
        filename,
        append(records) {
            if (!Array.isArray(records) || records.length > MAX_BATCH_SIZE || !records.every(isValidRequestLog)) {
                const error = new Error('Invalid request log batch.');
                error.statusCode = 400;
                throw error;
            }
            const db = open();
            const insert = db.prepare(`INSERT INTO request_logs
                (id, received_at, completed_at, profile_id, group_number, session_id, data)
                VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`);
            const ids = [];
            db.exec('BEGIN IMMEDIATE');
            try {
                for (const record of records) {
                    const identifier = value => value === null ? null : String(value);
                    insert.run(record.id, new Date().toISOString(), record.completedAt,
                        identifier(record.profileId), identifier(record.groupNumber), identifier(record.sessionId),
                        JSON.stringify(record));
                    ids.push(record.id);
                }
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
            return [...new Set(ids)];
        },
        list(filters = {}) {
            const clauses = [];
            const parameters = [];
            for (const [key, column] of [['profileId', 'profile_id'], ['groupNumber', 'group_number'], ['sessionId', 'session_id']]) {
                if (filters[key] !== undefined) {
                    clauses.push(`${column} = ?`);
                    parameters.push(String(filters[key]));
                }
            }
            const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
            return open().prepare(`SELECT data FROM request_logs ${where} ORDER BY completed_at DESC, id DESC`)
                .all(...parameters).map(row => JSON.parse(row.data));
        },
        close() {
            database?.close();
            database = undefined;
        },
    };
}

const sendJSON = (response, status, data) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(JSON.stringify(data));
};

const isSameOrigin = request => {
    if (request.headers['sec-fetch-site'] === 'cross-site') return false;
    const origin = request.headers.origin;
    if (!origin) return true; // Non-browser clients and same-origin requests without Origin.
    try {
        const parsed = new URL(origin);
        return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === request.headers.host;
    } catch {
        return false;
    }
};

const readJSON = request => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let failed = false;
    const fail = (message, statusCode) => {
        if (failed) return;
        failed = true;
        const error = new Error(message);
        error.statusCode = statusCode;
        reject(error);
    };
    if (Number(request.headers['content-length']) > MAX_REQUEST_LOG_BODY_BYTES) {
        fail('Request log batch is too large.', 413);
    }
    request.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_REQUEST_LOG_BODY_BYTES) fail('Request log batch is too large.', 413);
        if (!failed) chunks.push(chunk);
    });
    request.on('end', () => {
        if (failed) return;
        try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
            fail('Request body must contain valid JSON.', 400);
        }
    });
    request.on('error', () => fail('Unable to read request body.', 400));
    request.on('aborted', () => fail('Request body was interrupted.', 400));
});

/** Connect-compatible middleware; also usable directly with node:http. */
export function createRequestLogMiddleware(options = {}) {
    const archive = createRequestLogArchive(options);
    const middleware = async (request, response, next = () => sendJSON(response, 404, { error: 'Not found.' })) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname !== REQUEST_LOG_ROUTE) return next();
        try {
            if (request.method === 'GET') {
                const filters = Object.fromEntries(['profileId', 'groupNumber', 'sessionId']
                    .filter(key => url.searchParams.has(key)).map(key => [key, url.searchParams.get(key)]));
                const records = archive.list(filters);
                return sendJSON(response, 200, { records, storage: 'disk', count: records.length });
            }
            if (request.method === 'POST') {
                if (!isSameOrigin(request)) return sendJSON(response, 403, { error: 'Cross-origin writes are not allowed.' });
                if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
                    return sendJSON(response, 415, { error: 'Use application/json for request log batches.' });
                }
                const body = await readJSON(request);
                const ids = archive.append(body?.records);
                return sendJSON(response, 200, { ids });
            }
            response.setHeader('Allow', 'GET, POST');
            return sendJSON(response, 405, { error: 'Only GET and POST are supported.' });
        } catch (error) {
            const statusCode = error.statusCode ?? 500;
            return sendJSON(response, statusCode, {
                error: statusCode === 500 ? 'The disk archive is unavailable. Records remain queued in this browser.' : error.message,
            });
        }
    };
    middleware.close = () => archive.close();
    middleware.archive = archive;
    return middleware;
}

export function requestLogArchivePlugin(options = {}) {
    const attach = server => {
        const middleware = createRequestLogMiddleware(options);
        server.middlewares.use(middleware);
        server.httpServer?.once('close', () => middleware.close());
    };
    return {
        name: 'durable-request-log-archive',
        configureServer: attach,
        configurePreviewServer: attach,
    };
}
