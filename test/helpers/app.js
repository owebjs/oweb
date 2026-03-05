import net from 'node:net';
import path from 'node:path';
import multipart from '@fastify/multipart';
import Oweb from '../../dist/index.js';

const FIXTURE_ROOT = path.resolve(process.cwd(), 'test/fixtures');

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : null;

            server.close((closeErr) => {
                if (closeErr) {
                    reject(closeErr);
                    return;
                }
                if (!port) {
                    reject(new Error('Could not resolve a free TCP port.'));
                    return;
                }
                resolve(port);
            });
        });
    });
}

export async function createTestApp({
    uWebSocketsEnabled = true, // since uws is much prone to errors its a good idea to set it as enabled by default
    registerMultipart = false,
    routesDir = path.join(FIXTURE_ROOT, 'routes'),
    matchersDir = path.join(FIXTURE_ROOT, 'matchers'),
    hmr = false,
    internalErrorHandler,
} = {}) {
    const app = await new Oweb({ uWebSocketsEnabled }).setup();

    if (registerMultipart) {
        await app.register(multipart, {
            limits: {
                fileSize: 10 * 1024 * 1024,
            },
        });
    }

    if (typeof internalErrorHandler === 'function') {
        app.setInternalErrorHandler(internalErrorHandler);
    }

    const loadRoutesOptions = {
        directory: routesDir,
        matchersDirectory: matchersDir,
    };

    if (hmr) {
        loadRoutesOptions.hmr = {
            enabled: true,
            directory: routesDir,
            matchersDirectory: matchersDir,
        };
    }

    await app.loadRoutes(loadRoutesOptions);

    const port = await getFreePort();
    const { err, address } = await app.start({ host: '127.0.0.1', port });

    if (err) throw err;

    return {
        app,
        port,
        baseUrl: address.replace('0.0.0.0', '127.0.0.1'),
        close: async () => {
            await app.close();
        },
    };
}
