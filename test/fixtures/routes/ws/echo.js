import { WebSocketRoute } from 'owebjs';

export default class EchoSocketRoute extends WebSocketRoute {
    open(ws) {
        ws.send('ready');
    }

    message(ws, message, isBinary) {
        ws.send(message, isBinary);
    }
}