import { createServer } from 'node:http';
import { createRequestLogMiddleware } from './requestLogArchive.js';

const middleware = createRequestLogMiddleware();
const host = process.env.LOGS_HOST ?? '127.0.0.1';
const port = Number(process.env.LOGS_PORT ?? 4319);
const server = createServer(middleware);

server.listen(port, host, () => {
    console.log(`Request log archive listening at http://${host}:${port}/api/request-logs`);
    console.log(`Archive: ${middleware.archive.filename}`);
});
server.on('close', () => middleware.close());

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
