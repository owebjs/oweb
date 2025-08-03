import Fastify, {
    type FastifyServerOptions,
    type FastifyInstance,
    type FastifyListenOptions,
    type FastifyRequest,
    type FastifyReply,
    type RawServerDefault,
} from 'fastify';
import { applyHMR, assignRoutes } from '../utils/assignRoutes';
import { watchRoutes } from '../utils/watchRoutes';
import { info, success, warn } from '../utils/logger';

export interface OwebOptions extends FastifyServerOptions {
    uWebSocketsEnabled?: boolean;
    OWEB_INTERNAL_ERROR_HANDLER?: Function;
}

export interface LoadRoutesOptions {
    directory: string;
    hmr?: {
        /**
         * The directory to watch for changes. If not specified, it will use the routes directory.
         */
        directory?: string;
        enabled: boolean;
    };
}

interface _FastifyInstance extends FastifyInstance {}
class _FastifyInstance {}

export class Oweb extends _FastifyInstance {
    public _options: OwebOptions = {};
    private hmrDirectory: string;
    public routes: Map<string, any> = new Map();

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
     * Loads routes from a directory.
     * @param options.directory The directory to load routes from.
     * @param options.hmr Configuration for Hot Module Replacement.
     * @param options.hmr.enabled Whether to enable HMR. HMR is disabled if NODE_ENV is set to production.
     * @param options.hmr.directory The directory to watch for changes. If not specified, it will use the routes directory.
     */
    public loadRoutes({ directory, hmr }: LoadRoutesOptions) {
        if (hmr && !hmr.directory) hmr.directory = directory;

        if (hmr?.enabled) {
            this.hmrDirectory = hmr.directory;
            success(`Hot Module Replacement enabled. Watching changes in ${hmr.directory}`, 'HMR');
        } else {
            warn(
                'Hot Module Replacement is disabled. Use "await app.loadRoutes({ hmr: { enabled: true, directory: path } })" to enable it.',
                'HMR',
            );
        }

        return assignRoutes(this, directory);
    }

    /**
     *
     * Watches for changes in the routes directory
     */
    private watch() {
        return watchRoutes(this.hmrDirectory, (op, path, content) => {
            applyHMR(this, op, this.hmrDirectory, path, content);
        });
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
            this.listen({ port, host }, (err, address) => {
                if (process.env.NODE_ENV !== 'production') {
                    if (this.hmrDirectory) this.watch();
                } else {
                    info(
                        'Hot Module Replacement is disabled in production mode. NODE_ENV is set to production.',
                        'HMR',
                    );
                }

                resolve({ err, address });
            });
        });
    }
}
