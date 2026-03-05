import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { requestJson, waitFor } from '../helpers/http.js';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(SPEC_DIR, '..', 'fixtures');
const ROUTES_DIR = path.join(FIXTURE_ROOT, 'routes');
const MATCHERS_DIR = path.join(FIXTURE_ROOT, 'matchers');
const LIVE_ROUTE_FILE = path.join(ROUTES_DIR, 'hmr', 'live.js');

describe('HMR integration', () => {
    let server;
    let originalRouteContent;

    beforeAll(async () => {
        originalRouteContent = await readFile(LIVE_ROUTE_FILE, 'utf-8');

        server = await createTestApp({
            routesDir: ROUTES_DIR,
            matchersDir: MATCHERS_DIR,
            hmr: true,
        });
    });

    afterAll(async () => {
        if (originalRouteContent) {
            await writeFile(LIVE_ROUTE_FILE, originalRouteContent, 'utf-8');
        }

        if (server?.close) await server.close();
    });

    it('reloads changed route file without server restart', async () => {
        const first = await requestJson(server.baseUrl, '/hmr/live');
        expect(first.response.status).toBe(200);
        expect(first.body).toEqual({ version: 'v1' });

        // Let chokidar watcher finish initial bootstrap before writing.
        await new Promise((resolve) => setTimeout(resolve, 600));

        const updatedRoute = `
import { Route } from 'owebjs';

export default class HmrLiveRoute extends Route {
    handle() {
        return { version: 'v2' };
    }
}
`;

        await writeFile(LIVE_ROUTE_FILE, updatedRoute, 'utf-8');

        await waitFor(
            async () => {
                const current = await requestJson(server.baseUrl, '/hmr/live');
                return current.body?.version === 'v2';
            },
            { timeoutMs: 10000, intervalMs: 160 },
        );

        const second = await requestJson(server.baseUrl, '/hmr/live');
        expect(second.body).toEqual({ version: 'v2' });
    });
});
