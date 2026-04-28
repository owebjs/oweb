import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { requestJson, waitFor } from '../helpers/http.js';
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

    it('stops streaming when an infinite SSE response is cancelled', async () => {
        const unhandled = [];
        const onUnhandled = (reason) => {
            unhandled.push(reason);
        };

        process.on('unhandledRejection', onUnhandled);

        try {
            const { response, events } = await collectSseEvents(
                `${server.baseUrl}/events/infinite`,
                1,
            );

            expect(response.status).toBe(200);
            expect(events).toEqual(['tick-0']);

            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(unhandled).toEqual([]);
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });

    it('emits close and aborted events to route handlers when SSE is cancelled', async () => {
        await requestJson(server.baseUrl, '/events/abort-state?reset=1');

        const { response, events } = await collectSseEvents(
            `${server.baseUrl}/events/abort-listener`,
            1,
        );

        expect(response.status).toBe(200);
        expect(events).toEqual(['listening']);

        await waitFor(async () => {
            const { body } = await requestJson(server.baseUrl, '/events/abort-state');
            expect(body.aborted).toBeGreaterThanOrEqual(1);
            expect(body.close).toBeGreaterThanOrEqual(1);
            return true;
        });
    });
});
