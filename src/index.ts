import Fastify, {
    type FastifyServerOptions,
    type FastifyInstance,
    type FastifyListenOptions,
    type FastifyRequest,
    type FastifyReply,
} from 'fastify';
import { assignRoutes } from './utils/assignRoutes';

export interface OwebOptions extends FastifyServerOptions {
    uWebSocketsEnabled?: boolean;
    OWEB_INTERNAL_ERROR_HANDLER?: Function;
}

export interface LoadRoutesOptions {
    directory: string;
}

interface _FastifyInstance extends FastifyInstance {}
class _FastifyInstance {}

export default class Oweb extends _FastifyInstance {
    _options: OwebOptions = {};
    public constructor(options: OwebOptions = {}) {
        super();

        const _options: OwebOptions = options ?? {};

        this._options = _options;
        this._options.OWEB_INTERNAL_ERROR_HANDLER = (
            req: FastifyRequest,
            res: FastifyReply,
            err: Error,
        ) => {
            return res.status(500).send({ error: err.message });
        };
    }

    public async setup() {
        return new Promise(async (resolve) => {
            if (this._options.uWebSocketsEnabled) {
                const serverimp = (await import('./uwebsocket/server')).default;

                const server = await serverimp({});
                (this._options.serverFactory as any) = (handler, opts) => {
                    server.on('request', handler);
                    return server;
                };

                Object.assign(this, Fastify(this._options));
                resolve(true);
            } else {
                Object.assign(this, Fastify(this._options));
                resolve(true);
            }
        });
    }

    public loadRoutes({ directory }: LoadRoutesOptions) {
        return assignRoutes(directory, this);
    }

    public setInternalErrorHandler(
        errorHandlerCallback: (request: FastifyRequest, reply: FastifyReply, error: Error) => void,
    ) {
        this._options.OWEB_INTERNAL_ERROR_HANDLER = errorHandlerCallback;
    }

    public start(listenOptions: FastifyListenOptions = { port: 3000, host: '127.0.0.1' }) {
        return new Promise<{ err: Error; address: string }>((resolve) => {
            this.listen({ port: +listenOptions.port }, (err, address) => resolve({ err, address }));
        });
    }
}

// export types
export type * from 'fastify/types/instance';
export type * from 'fastify/types/hooks';
export type * from 'fastify/types/logger';
export type * from 'fastify/types/request';
export type * from 'fastify/types/reply';
export type * from 'fastify/types/errors';
export type * from 'fastify/types/register';
export type * from 'fastify/types/plugin';
export type * from 'fastify/types/route';
export type * from 'fastify/types/schema';
export type * from 'fastify/types/context';
export type * from 'fastify/types/utils';
export type * from 'fastify/types/serverFactory';
export type * from 'fastify/types/type-provider';
export type * from 'fastify/types/content-type-parser';
