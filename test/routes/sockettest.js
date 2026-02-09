import { WebSocketRoute } from '../../dist/index.js';

export default class TestSocket extends WebSocketRoute {
    open(ws, req) {
        console.log('client connected', req.url);
        ws.subscribe('room');
    }

    message(ws, message, isBinary) {
        console.log('hmr test');
        ws.publish('room', message, isBinary);
    }

    close(ws) {
        console.log('client disc');
    }
}
