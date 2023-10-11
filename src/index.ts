import Fastify, { FastifyInstance as _FastifyInstance } from 'fastify';
import { assignRoutes } from './utils/assignRoutes';
import serverimp from './uwebsocket/server';

const server = serverimp({});

const serverFactory = (handler, opts) => {
    server.on('request', handler);
    return server;
};

let app = Fastify();

interface FastifyInstance extends _FastifyInstance {}

interface ListenOptions {
    port: string | number;
    host?: string;
}

interface OwebOptions {
    uWebSocketsEnabled: boolean;
}

class FastifyInstance {
    constructor() {
        Object.assign(this, app);
    }
}

export default class Oweb extends FastifyInstance {
    constructor(options: OwebOptions = { uWebSocketsEnabled: false }) {
        super();
        if (options?.uWebSocketsEnabled) {
            //@ts-ignore
            app = Fastify({
                //@ts-ignore
                serverFactory,
            });
        }
    }

    loadRoutes({ routeDir }) {
        //@ts-ignore
        return assignRoutes(routeDir, app);
    }

    start(listenOptions: ListenOptions = { port: 3000, host: '127.0.0.1' }) {
        return new Promise((resolve) => {
            app.listen({ port: +listenOptions.port }, resolve);
        });
    }
}
