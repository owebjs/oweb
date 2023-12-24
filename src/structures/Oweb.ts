import Fastify, {
    type FastifyServerOptions,
    type FastifyInstance,
    type FastifyListenOptions,
    type FastifyRequest,
    type FastifyReply,
} from 'fastify';
import { assignRoutes } from '../utils/assignRoutes';

export interface OwebOptions extends FastifyServerOptions {
    uWebSocketsEnabled?: boolean;
    OWEB_INTERNAL_ERROR_HANDLER?: Function;
}

export interface LoadRoutesOptions {
    directory: string;
}

interface _FastifyInstance extends FastifyInstance {}
class _FastifyInstance {}

export class Oweb extends _FastifyInstance {
    public _options: OwebOptions = {};

    public constructor(options?: OwebOptions) {
        super();

        this._options = options ?? {};

        this._options.uWebSocketsEnabled ??= false;
        this._options.OWEB_INTERNAL_ERROR_HANDLER ??= (
            _: FastifyRequest,
            res: FastifyReply,
            err: Error,
        ) => {
            return res.status(500).send({ error: err.message });
        };
    }

    public async setup(): Promise<Oweb> {
        if (this._options.uWebSocketsEnabled) {
            const serverimp = (await import('../uwebsocket/server')).default;
            const server = await serverimp({});

            (this._options.serverFactory as any) = (handler, opts) => {
                server.on('request', handler);
                return server;
            };
        }

        const fastifyInstance = Object.assign(this, Fastify(this._options));

        this.addHook('onRequest', (_, res, done) => {
            res.header('X-Powered-By', 'Oweb');
            done();
        });

        return fastifyInstance;
    }

    public loadRoutes({ directory }: LoadRoutesOptions) {
        return assignRoutes(directory, this);
    }

    public setInternalErrorHandler(
        errorHandlerCallback: (request: FastifyRequest, reply: FastifyReply, error: Error) => void,
    ) {
        this._options.OWEB_INTERNAL_ERROR_HANDLER = errorHandlerCallback;
    }

    public start(options: FastifyListenOptions = { port: 3000, host: '127.0.0.1' }) {
        return new Promise<{ err: Error; address: string }>((resolve) => {
            this.listen({ port: +options.port }, (err, address) => resolve({ err, address }));
        });
    }
}
