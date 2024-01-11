import Fastify, {
    type FastifyServerOptions,
    type FastifyInstance,
    type FastifyListenOptions,
    type FastifyRequest,
    type FastifyReply,
    type RawServerDefault,
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

    /**
     *
     * Returns a fastify instance with the Oweb prototype methods
     */
    public async setup(): Promise<Oweb> {
        if (this._options.uWebSocketsEnabled) {
            const serverimp = (await import('../uwebsocket/server')).default;
            const server = await serverimp({});

            this._options.serverFactory = (handler) => {
                server.on('request', handler);
                return server as unknown as RawServerDefault;
            };
        }

        const fastify = Fastify(this._options);

        fastify.addHook('onRequest', (_, res, done) => {
            res.header('X-Powered-By', 'Oweb');
            done();
        });

        for (const key in Object.getOwnPropertyDescriptors(Oweb.prototype)) {
            if (key === 'constructor') continue;

            Object.defineProperty(
                fastify,
                key,
                Object.getOwnPropertyDescriptor(Oweb.prototype, key),
            );
        }

        Object.defineProperty(fastify, '_options', {
            value: this._options,
            writable: true,
            enumerable: false,
            configurable: false,
        });

        return fastify as unknown as Oweb;
    }

    /**
     *
     * Loads routes from a directory
     */
    public loadRoutes({ directory }: LoadRoutesOptions) {
        return assignRoutes(this, directory);
    }

    /**
     *
     * Sets the internal error handler
     */
    public setInternalErrorHandler(
        errorHandlerCallback: (request: FastifyRequest, reply: FastifyReply, error: Error) => void,
    ) {
        this._options.OWEB_INTERNAL_ERROR_HANDLER = errorHandlerCallback;
    }

    public start({ port = 3000, host = '127.0.0.1' }: FastifyListenOptions) {
        return new Promise<{ err: Error; address: string }>((resolve) => {
            this.listen({ port, host }, (err, address) => resolve({ err, address }));
        });
    }
}
