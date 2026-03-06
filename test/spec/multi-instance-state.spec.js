import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { requestJson } from '../helpers/http.js';

describe('HMR runtime state isolation across instances', () => {
    let appA;
    let appB;

    beforeAll(async () => {
        appA = await createTestApp({
            hmr: true,
            routesDir: path.resolve(process.cwd(), 'test/fixtures/multi-app-a/routes'),
            matchersDir: path.resolve(process.cwd(), 'test/fixtures/matchers'),
        });

        appB = await createTestApp({
            hmr: true,
            routesDir: path.resolve(process.cwd(), 'test/fixtures/multi-app-b/routes'),
            matchersDir: path.resolve(process.cwd(), 'test/fixtures/matchers'),
        });
    });

    afterAll(async () => {
        if (appA?.close) await appA.close();
        if (appB?.close) await appB.close();
    });

    it('keeps route handlers isolated per app when HMR is enabled', async () => {
        const first = await requestJson(appA.baseUrl, '/hello');
        expect(first.response.status).toBe(200);
        expect(first.body).toEqual({ app: 'a', ok: true });

        const second = await requestJson(appB.baseUrl, '/');
        expect(second.response.status).toBe(200);
        expect(second.body).toEqual({ app: 'b', ok: true });
    });
});
