import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { requestJson } from '../helpers/http.js';
import { collectSseEvents } from '../helpers/sse.js';

describe('SSE streaming', () => {
    let server;

    beforeAll(async () => {
        server = await createTestApp();
    });

    afterAll(async () => {
        if (server?.close) await server.close();
    });

    it('streams iterable/async-iterable responses as SSE', async () => {
        const { response, events } = await collectSseEvents(`${server.baseUrl}/events/sse`, 3);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(events).toEqual(['event-1', { step: 2 }, 3]);
    });

    it('respects early res.send from generator route', async () => {
        const { response, body } = await requestJson(server.baseUrl, '/events/sse?deny=1');

        expect(response.status).toBe(401);
        expect(body).toEqual({ code: 'error.unauthorized' });
    });
});