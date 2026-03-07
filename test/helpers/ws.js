import WebSocket from 'ws';

export function openWebSocket(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
            ws.terminate();
            reject(new Error(`WebSocket open timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        ws.once('open', () => {
            clearTimeout(timer);
            resolve(ws);
        });

        ws.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

export function waitForWsMessage(ws, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`WebSocket message timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        ws.once('message', (message) => {
            clearTimeout(timer);
            resolve(message);
        });

        ws.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

export function closeWebSocket(ws, timeoutMs = 3000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            ws.terminate();
            resolve();
        }, timeoutMs);

        ws.once('close', () => {
            clearTimeout(timer);
            resolve();
        });

        ws.close();
    });
}
