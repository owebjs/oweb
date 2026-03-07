import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { requestJson } from '../helpers/http.js';

describe('HTTP routing + matchers', () => {
    let server;

    beforeAll(async () => {
        server = await createTestApp();
    });

    afterAll(async () => {
        if (server?.close) await server.close();
    });

    it('serves plain route and framework header', async () => {
        const { response, body } = await requestJson(server.baseUrl, '/hello');

        expect(response.status).toBe(200);
        expect(response.headers.get('x-powered-by')).toBe('Oweb');
        expect(body).toEqual({ message: 'hello-world' });
    });

    it('resolves dynamic route params', async () => {
        const { response, body } = await requestJson(server.baseUrl, '/users/42');

        expect(response.status).toBe(200);
        expect(body).toEqual({ id: '42' });
    });

    it('supports file-based method routing', async () => {
        const created = await requestJson(server.baseUrl, '/method-check', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({ test: true }),
        });

        expect(created.response.status).toBe(201);
        expect(created.body).toEqual({ method: 'POST', body: { test: true } });

        const missing = await requestJson(server.baseUrl, '/method-check', {
            method: 'GET',
        });

        expect(missing.response.status).toBe(404);
    });

    it('applies matcher validation from filename', async () => {
        const valid = await requestJson(server.baseUrl, '/matcher/123');
        expect(valid.response.status).toBe(200);
        expect(valid.body).toEqual({ id: 123, valid: true });

        const invalid = await requestJson(server.baseUrl, '/matcher/not-a-number');
        expect(invalid.response.status).toBe(404);
    });
});