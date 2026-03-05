import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { closeWebSocket, openWebSocket, waitForWsMessage } from '../helpers/ws.js';
import { requestJson } from '../helpers/http.js';

const modes = [
    { name: 'fastify-websocket-adapter', uWebSocketsEnabled: false },
    { name: 'uwebsocket-adapter', uWebSocketsEnabled: true },
];

describe.each(modes)('WebSocket integration ($name)', ({ uWebSocketsEnabled }) => {
    let server;

    beforeAll(async () => {
        server = await createTestApp({ uWebSocketsEnabled });
    });

    afterAll(async () => {
        if (server?.close) await server.close();
    });

    it('supports basic HTTP route in the same app', async () => {
        const { response, body } = await requestJson(server.baseUrl, '/hello');

        expect(response.status).toBe(200);
        expect(body).toEqual({ message: 'hello-world' });
    });

    it('opens websocket and echoes payload', async () => {
        const wsUrl = `${server.baseUrl.replace(/^http/, 'ws')}/ws/echo`;

        const ws = await openWebSocket(wsUrl);

        try {
            ws.send('ping');

            const first = String(await waitForWsMessage(ws));
            if (first === 'ready') {
                const echoed = String(await waitForWsMessage(ws));
                expect(echoed).toBe('ping');
            } else {
                expect(first).toBe('ping');
            }
        } finally {
            await closeWebSocket(ws);
        }
    });
});
