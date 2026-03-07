import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { requestJson } from '../helpers/http.js';

describe('Hooks + error handling', () => {
    let server;

    beforeAll(async () => {
        server = await createTestApp({
            internalErrorHandler: (_req, res, error) => {
                res.status(500).send({
                    source: 'global-internal-error-handler',
                    message: error.message,
                });
            },
        });
    });

    afterAll(async () => {
        if (server?.close) await server.close();
    });

    it('runs scoped hooks sequentially (root -> hooks -> chain)', async () => {
        const { response, body } = await requestJson(server.baseUrl, '/hooks/chain');

        expect(response.status).toBe(200);
        expect(body).toEqual({ hookOrder: ['root', 'hooks', 'chain'] });
    });

    it('uses route-level handleError when provided', async () => {
        const { response, body } = await requestJson(server.baseUrl, '/errors/route-specific');

        expect(response.status).toBe(409);
        expect(body).toEqual({
            source: 'route-handleError',
            message: 'route-specific-error',
        });
    });

    it('falls back to global internal error handler', async () => {
        const { response, body } = await requestJson(server.baseUrl, '/errors/global');

        expect(response.status).toBe(500);
        expect(body).toEqual({
            source: 'global-internal-error-handler',
            message: 'global-route-error',
        });
    });

    it('propagates hook errors to the global internal error handler', async () => {
        const { response, body } = await requestJson(server.baseUrl, '/hooks/fail');

        expect(response.status).toBe(500);
        expect(body).toEqual({
            source: 'global-internal-error-handler',
            message: 'hook-failure',
        });
    });
});