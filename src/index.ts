import Fastify, {
    type FastifyServerOptions,
    type FastifyInstance,
    type FastifyListenOptions,
} from 'fastify';
import { assignRoutes } from './utils/assignRoutes';

export interface OwebOptions extends FastifyServerOptions {
    uWebSocketsEnabled?: boolean;
}

export interface LoadRoutesOptions {
    directory: string;
}

interface _FastifyInstance extends FastifyInstance {}
class _FastifyInstance {}

export default class Oweb extends _FastifyInstance {
    #_options: OwebOptions = {};
    public constructor(options: OwebOptions = {}) {
        super();

        const _options: OwebOptions = options ?? {};

        this.#_options = _options;
    }

    public async setup() {
        return new Promise(async (resolve) => {
            if (this.#_options.uWebSocketsEnabled) {
                const serverimp = (await import('./uwebsocket/server')).default;

                const server = await serverimp({});
                (this.#_options.serverFactory as any) = (handler, opts) => {
                    server.on('request', handler);
                    return server;
                };

                Object.assign(this, Fastify(this.#_options));
                resolve(true);
            } else {
                Object.assign(this, Fastify(this.#_options));
                resolve(true);
            }
        });
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
