import Fastify, {
    type FastifyServerOptions,
    type FastifyInstance,
    type FastifyListenOptions,
    type FastifyRequest,
    type FastifyReply,
    type RawServerDefault,
} from 'fastify';
import { applyMatcherHMR, applyRouteHMR, assignRoutes } from '../utils/assignRoutes';
import { watchDirectory } from '../utils/watcher';
import { info, success, warn } from '../utils/logger';

import websocketPlugin from '@fastify/websocket';

export interface OwebOptions extends FastifyServerOptions {
    uWebSocketsEnabled?: boolean;
    OWEB_INTERNAL_ERROR_HANDLER?: Function;
}

export interface LoadRoutesOptions {
    directory: string;
    matchersDirectory?: string;
    hmr?: {
        /**
         * The directory to watch for changes. If not specified, it will use the routes directory.
         */
        directory?: string;
        matchersDirectory?: string;
        enabled: boolean;
    };
}

interface _FastifyInstance extends FastifyInstance {}
class _FastifyInstance {}

export class Oweb extends _FastifyInstance {
    public _options: OwebOptions = {};

    public _internalKV: Map<string, any> = new Map();

    private hmrDirectory: string;
    private hmrMatchersDirectory: string;
    private directory: string;
    private matchersDirectory: string;

    public uServer: any = null;

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
            const serverimp = (await import('../uwebsocket/server.js')).default;
            const server = await serverimp({});

            this.uServer = server;

            this._options.serverFactory = (handler) => {
                server.on('request', handler);
                return server as unknown as RawServerDefault;
            };
        } else {
            this.uServer = null;
        }

        const fastify = Fastify(this._options);

        if (!this._options.uWebSocketsEnabled) {
            await fastify.register(websocketPlugin);
        }

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

        Object.defineProperty(fastify, '_internalKV', {
            value: this._internalKV,
            writable: true,
            enumerable: false,
        });

        Object.defineProperty(fastify, 'uServer', {
            value: this.uServer,
            writable: true,
            enumerable: false,
            configurable: false,
        });

        Object.defineProperty(fastify, '_options', {
            value: this._options,
            writable: true,
            enumerable: false,
            configurable: false,
        });

        return fastify as unknown as Oweb;
    }

    public ws(url: string, behavior: any, hooks: any[] = []) {
        if (this.uServer) {
            this.uServer.ws(url, behavior, hooks);
        } else {
            warn(
                'Oweb#ws is only available when uWebSockets is enabled. For Fastify instances, Oweb automatically handles registrations.',
            );
        }
    }

    /**
     * Loads routes from a directory.
     * @param options.directory The directory to load routes from.
     * @param options.matchersDirectory The directory to load matchers from.
     * @param options.hmr Configuration for Hot Module Replacement.
     * @param options.hmr.enabled Whether to enable HMR. HMR is disabled if NODE_ENV is set to production.
     * @param options.hmr.directory The directory to watch for route changes. If not specified, it will use the routes directory.
     * @param options.hmr.matchersDirectory The directory to watch for matcher changes. If not specified, it will use the matchers directory.
     */
    public loadRoutes({ directory, matchersDirectory, hmr }: LoadRoutesOptions) {
        if (hmr && !hmr.directory) hmr.directory = directory;
        if (hmr && !hmr.matchersDirectory) hmr.matchersDirectory = matchersDirectory;

        this.directory = directory;
        this.matchersDirectory = matchersDirectory;

        if (hmr?.enabled) {
            this.hmrDirectory = hmr.directory;
            this.hmrMatchersDirectory = hmr.matchersDirectory;
            this._internalKV.set('hmr', true);
            success(`Hot Module Replacement enabled. Watching changes in ${hmr.directory}`, 'HMR');
        } else {
            warn(
                'Hot Module Replacement is disabled. Use "await app.loadRoutes({ hmr: { enabled: true, directory: path } })" to enable it.',
                'HMR',
            );
        }

        return assignRoutes(this, directory, matchersDirectory);
    }

    /**
     *
     * Watches for changes in the routes directory
     */
    private watch() {
        watchDirectory(this.hmrDirectory, true, (op, path, content) => {
            applyRouteHMR(this, op, this.hmrDirectory, this.directory, path, content);
        });

        if (this.hmrMatchersDirectory) {
            watchDirectory(this.hmrMatchersDirectory, true, (op, path, content) => {
                applyMatcherHMR(
                    this,
                    op,
                    this.hmrMatchersDirectory,
                    this.matchersDirectory,
                    path,
                    content,
                );
            });
        }
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
