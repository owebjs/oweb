import Fastify, {
    type FastifyServerOptions,
    type FastifyInstance,
    type FastifyListenOptions,
} from 'fastify';
import { assignRoutes } from './utils/assignRoutes';
import serverimp from './uwebsocket/server';

const server = serverimp({});

const serverFactory = (handler, opts) => {
    server.on('request', handler);
    return server;
};

export interface OwebOptions extends FastifyServerOptions {
    uWebSocketsEnabled?: boolean;
}

export interface LoadRoutesOptions {
    directory: string;
}

interface _FastifyInstance extends FastifyInstance {}
class _FastifyInstance {}

export default class Oweb extends _FastifyInstance {
    public constructor(options: OwebOptions = {}) {
        super();

        const _options: OwebOptions = options ?? {};

        if (_options.uWebSocketsEnabled) {
            _options.serverFactory = serverFactory as any;
        }

        Object.assign(this, Fastify(_options));
    }

    public loadRoutes({ directory }: LoadRoutesOptions) {
        return assignRoutes(directory, this);
    }

    public start(listenOptions: FastifyListenOptions = { port: 3000, host: '127.0.0.1' }) {
        return new Promise<{ err: Error; address: string }>((resolve) => {
            this.listen({ port: +listenOptions.port }, (err, address) => resolve({ err, address }));
        });
    }
}
