import type { FastifyRequest, FastifyReply } from 'fastify';
import type { OutgoingHttpHeaders } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRoutePath, buildRouteURL } from './utils';
import { walk, type WalkResult } from './walk';
import { Oweb, Route } from '../index';
import { HMROperations } from './watcher';
import { error, success, warn } from './logger';
import { match } from 'path-to-regexp';
import generateFunctionFromTypescript from './generateFunctionFromTypescript';
import { readdirSync } from 'node:fs';

import { WebSocketRoute, WebSocketAdapter } from '../structures/WebSocketRoute';
import { FastifyWebSocketAdapter } from '../structures/FastifyWebSocketAdapter';

import { formatSSE } from './utils';

const WS_REGISTRY_KEY = 'ws:registered-routes';

type MethodHandlerMap = Record<string, Record<string, Function>>;

type RuntimeState = {
    matcherOverrides: Record<string, (...args: any[]) => any>;
    routeFunctions: MethodHandlerMap;
    temporaryRequests: MethodHandlerMap;
    routesCache: GeneratedRoute[];
    compiledRoutes: Record<string, new (...args: any[]) => Route>;
    websocketRoutes: Record<string, WebSocketRoute>;
};

type RequestWithCancellation = FastifyRequest & {
    signal?: AbortSignal;
    _owebAbortController?: AbortController;
};

const runtimeStates = new WeakMap<Oweb, RuntimeState>();

const createMethodMap = (): MethodHandlerMap => ({
    get: {},
    post: {},
    put: {},
    delete: {},
    patch: {},
    options: {},
});

function createRuntimeState(): RuntimeState {
    return {
        matcherOverrides: {},
        routeFunctions: createMethodMap(),
        temporaryRequests: createMethodMap(),
        routesCache: [],
        compiledRoutes: {},
        websocketRoutes: {},
    };
}

function getRuntimeState(oweb: Oweb): RuntimeState {
    let state = runtimeStates.get(oweb);

    if (!state) {
        state = createRuntimeState();
        runtimeStates.set(oweb, state);
    }

    return state;
}

function normalizeFsPath(filePath: string) {
    return path.resolve(filePath).replaceAll('\\', '/').toLowerCase();
}

async function importFreshModule(filePath: string, source?: string) {
    const resolvedHref = pathToFileURL(path.resolve(filePath)).href;
    const cacheBuster = `?t=${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (source?.length && !/['"]\.\.?\//.test(source)) {
        const stampedSource = `${source}\n//# sourceURL=${resolvedHref}${cacheBuster}`;
        const dataUrl = `data:text/javascript;base64,${Buffer.from(stampedSource, 'utf-8').toString('base64')}`;

        try {
            return await import(dataUrl);
        } catch {}
    }

    return import(resolvedHref + cacheBuster);
}

function resetRuntimeCaches(oweb: Oweb) {
    const state = getRuntimeState(oweb);

    state.matcherOverrides = {};
    state.routeFunctions = createMethodMap();
    state.temporaryRequests = createMethodMap();
    state.routesCache = [];
    state.compiledRoutes = {};
    state.websocketRoutes = {};

    oweb._internalKV.delete(WS_REGISTRY_KEY);
}

function removeExtension(filePath: string) {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        return filePath.substring(0, lastDotIndex);
    }
    return filePath;
}

function createWebSocketProxy(oweb: Oweb, url: string) {
    const getHandler = () => getRuntimeState(oweb).websocketRoutes[url];

    return {
        compression: getHandler()?._options.compression,
        maxPayloadLength: getHandler()?._options.maxPayloadLength,
        idleTimeout: getHandler()?._options.idleTimeout,
        sendPingsAutomatically: getHandler()?._options.sendPingsAutomatically,

        open: (ws: WebSocketAdapter, req: any) => {
            const handler = getHandler();
            if (handler?.open) handler.open(ws, req);
        },
        message: (ws: WebSocketAdapter, message: ArrayBuffer, isBinary: boolean) => {
            const handler = getHandler();
            if (handler?.message) handler.message(ws, message, isBinary);
        },
        drain: (ws: WebSocketAdapter) => {
            const handler = getHandler();
            if (handler?.drain) handler.drain(ws);
        },
        close: (ws: WebSocketAdapter, code: number, message: ArrayBuffer) => {
            const handler = getHandler();
            if (handler?.close) handler.close(ws, code, message);
        },
        ping: (ws: WebSocketAdapter, message: ArrayBuffer) => {
            const handler = getHandler();
            if (handler?.ping) handler.ping(ws, message);
        },
        pong: (ws: WebSocketAdapter, message: ArrayBuffer) => {
            const handler = getHandler();
            if (handler?.pong) handler.pong(ws, message);
        },
    };
}

export const applyMatcherHMR = async (
    oweb: Oweb,
    op: HMROperations,
    workingDir: string,
    fallbackDir: string,
    filePath: string,
    content: string,
) => {
    const state = getRuntimeState(oweb);
    let def;

    const fileName = path.basename(filePath);

    if (op === 'delete-file') {
        delete state.matcherOverrides[removeExtension(fileName)];
        success(`Matcher ${filePath} removed in 0ms`, 'HMR');
        return;
    }

    if (filePath.endsWith('.ts')) {
        const start = Date.now();
        def = content.length ? await generateFunctionFromTypescript(content, filePath) : undefined;
        const end = Date.now() - start;

        success(`Matcher ${filePath} compiled and reloaded in ${end}ms`, 'HMR');
    } else {
        const start = Date.now();
        const packageURL = pathToFileURL(path.resolve(filePath)).href;

        const cacheBuster = `?t=${Date.now()}`;
        def = (await import(packageURL + cacheBuster)).default;
        const end = Date.now() - start;

        success(`Matcher ${filePath} reloaded in ${end}ms`, 'HMR');
    }

    if (def) {
        state.matcherOverrides[removeExtension(fileName)] = def;
    }
};

// path is something like test\routes\testroute\[id].js
export const applyRouteHMR = async (
    oweb: Oweb,
    op: HMROperations,
    workingDir: string,
    fallbackDir: string,
    path: string,
    content: string,
) => {
    const state = getRuntimeState(oweb);
    const normalizedChangedPath = normalizeFsPath(path);

    if (path.endsWith('hooks.js') || path.endsWith('hooks.ts')) {
        warn(
            `Hot Module Replacement is not supported for hooks. Restart the server for changes to take effect.`,
            'HMR',
        );
        return;
    }

    if (path.endsWith('.ts')) {
        const start = Date.now();
        state.compiledRoutes[path] = content.length
            ? await generateFunctionFromTypescript(content, path)
            : undefined;
        const end = Date.now() - start;
        success(`File ${path} compiled in ${end}ms`, 'HMR');
    }

    if (op === 'new-file') {
        const start = Date.now();
        const files = await walk(workingDir, [], fallbackDir);
        const routes = await generateRoutes(files, path, state.compiledRoutes);
        state.routesCache = routes;

        const f = routes.find(
            (x) => normalizeFsPath(x.fileInfo.filePath) === normalizedChangedPath,
        );

        if (!f) {
            warn(`HMR could not resolve route metadata for file ${path}`, 'HMR');
            return;
        }

        if (!path.endsWith('.ts') && content.length) {
            const fresh = await importFreshModule(path, content);
            if (fresh?.default) {
                f.fn = fresh.default;
            }
        }

        if (f.fn?.prototype instanceof WebSocketRoute) {
            assignSpecificRoute(oweb, f);
            const end = Date.now() - start;
            success(`WebSocket Route ${f.url} created in ${end}ms`, 'HMR');
            return;
        }
        const method = f.method.toLowerCase();
        const nextHandler = inner(oweb, f);

        if (state.routeFunctions[method][f.url]) {
            state.routeFunctions[method][f.url] = nextHandler;
        } else {
            state.temporaryRequests[method][f.url] = nextHandler;
        }
        const end = Date.now() - start;
        success(`Route ${f.method.toUpperCase()}:${f.url} created in ${end}ms`, 'HMR');
    } else if (op === 'modify-file') {
        const start = Date.now();
        const files = await walk(workingDir, [], fallbackDir);
        const routes = await generateRoutes(files, path, state.compiledRoutes);
        state.routesCache = routes;

        const f = routes.find(
            (x) => normalizeFsPath(x.fileInfo.filePath) === normalizedChangedPath,
        );

        if (!f) {
            warn(`HMR could not resolve route metadata for file ${path}`, 'HMR');
            return;
        }

        if (!path.endsWith('.ts') && content.length) {
            const fresh = await importFreshModule(path, content);
            if (fresh?.default) {
                f.fn = fresh.default;
            }
        }

        if (f.fn?.prototype instanceof WebSocketRoute) {
            state.websocketRoutes[f.url] = new f.fn() as WebSocketRoute;

            const end = Date.now() - start;
            success(`WebSocket Route ${f.url} reloaded in ${end}ms`, 'HMR');
            return;
        }

        const method = f.method.toLowerCase();
        const nextHandler = inner(oweb, f);

        if (state.routeFunctions[method][f.url]) {
            state.routeFunctions[method][f.url] = nextHandler;
        } else if (f.url in state.temporaryRequests[method]) {
            state.temporaryRequests[method][f.url] = nextHandler;
        } else {
            state.routeFunctions[method][f.url] = nextHandler;
        }

        const end = Date.now() - start;
        success(`Route ${f.method.toUpperCase()}:${f.url} reloaded in ${end}ms`, 'HMR');
    } else if (op === 'delete-file') {
        const start = Date.now();
        const newFilePath = path.slice(workingDir.length).replaceAll('\\', '/').slice(0, -3);
        let builded = buildRouteURL(newFilePath);

        if (builded.url.endsWith('/index')) {
            builded.url = builded.url.slice(0, -'/index'.length);
        }

        if (state.websocketRoutes[builded.url]) {
            delete state.websocketRoutes[builded.url];
            const end = Date.now() - start;
            success(`WebSocket Route ${builded.url} removed (shimmed) in ${end}ms`, 'HMR');
            return;
        }

        const f = state.routesCache.find((x) => x.method == builded.method && x.url == builded.url);
        if (f) {
            if (f.url in state.temporaryRequests[f.method.toLowerCase()]) {
                delete state.temporaryRequests[f.method.toLowerCase()][f.url];
            } else {
                delete state.routeFunctions[f.method.toLowerCase()][f.url];
            }
            const end = Date.now() - start;
            success(`Route ${f.method.toUpperCase()}:${f.url} removed in ${end}ms`, 'HMR');
        }
    }
};

type GeneratedRoute = {
    url: string;
    method: string;
    matchers: {
        paramName: string;
        matcherName: string;
    }[];
    fn: new (...args: any[]) => Route;
    fileInfo: WalkResult;
};

export const generateRoutes = async (
    files: WalkResult[],
    onlyGenerateFn?: string,
    compiledRoutes: Record<string, new (...args: any[]) => Route> = {},
) => {
    const routes: GeneratedRoute[] = [];

    for (const file of files) {
        const parsedFile = path.parse(file.rel);
        const packageURL = pathToFileURL(path.resolve(file.filePath)).href;

        const routePath = buildRoutePath(parsedFile);
        const route = buildRouteURL(routePath);

        if (compiledRoutes[file.filePath]) {
            routes.push({
                url: route.url,
                method: route.method,
                matchers: route.matchers,
                fn: compiledRoutes[file.filePath],
                fileInfo: file,
            });

            continue;
        }

        let routeFuncs: new (...args: any[]) => Route;

        if (
            !(onlyGenerateFn && normalizeFsPath(file.filePath) !== normalizeFsPath(onlyGenerateFn))
        ) {
            const cacheBuster = `?t=${Date.now()}`;
            const def = await import(packageURL + cacheBuster);
            routeFuncs = def.default;
        }

        routes.push({
            url: route.url,
            method: route.method,
            matchers: route.matchers,
            fn: routeFuncs,
            fileInfo: file,
        });
    }

    return routes;
};

function inner(oweb: Oweb, route: GeneratedRoute) {
    if (!route.fn) {
        return;
    }

    const routeFunc = new route.fn();
    const matchers = route.matchers;
    const hooks = route.fileInfo.hooks;

    const hasHooks = hooks.length > 0;
    const hasMatchers = matchers.length > 0;
    const isParametric = route.url.includes(':') || route.url.includes('*');

    const handleIsAsync = routeFunc.handle.constructor.name === 'AsyncFunction';
    const hasRouteErrorHandler = typeof routeFunc?.handleError === 'function';

    const hmrEnabled = !!oweb._internalKV.get('hmr');
    const state = getRuntimeState(oweb);

    const checkMatchers = (req: FastifyRequest) => {
        if (!hasMatchers) return true;

        for (const matcher of matchers) {
            const param = req.params[matcher.paramName];
            const fun = state.matcherOverrides[matcher.matcherName];
            if (fun) {
                return fun(param);
            }
        }

        return true;
    };

    const handleError = (req: FastifyRequest, res: FastifyReply, err: unknown) => {
        const normalizedError = err instanceof Error ? err : new Error(String(err));

        if (hasRouteErrorHandler) {
            routeFunc.handleError!(req, res, normalizedError);
        } else {
            oweb._options.OWEB_INTERNAL_ERROR_HANDLER(req, res, normalizedError);
        }
    };

    const ensureRequestSignal = (req: FastifyRequest, res: FastifyReply) => {
        const request = req as RequestWithCancellation;

        if (request._owebAbortController) return request._owebAbortController.signal;

        const controller = new AbortController();
        const raw = res.raw as any;
        const abort = () => {
            if (!controller.signal.aborted) controller.abort();
        };
        const abortIfInterrupted = () => {
            if (raw.writableEnded || (raw.finished && !raw.res?.aborted)) return;
            abort();
        };

        Object.defineProperty(request, 'signal', {
            value: controller.signal,
            configurable: true,
        });

        request._owebAbortController = controller;

        res.raw.on?.('close', abortIfInterrupted);
        res.raw.on?.('aborted', abort);

        return controller.signal;
    };

    const streamResult = async (
        req: FastifyRequest,
        res: FastifyReply,
        result: any,
        isAsyncIterable: boolean,
    ) => {
        // we don't send headers yet. we must pull the first chunk to see
        // if the user executes .send instead of yielding

        const iterator = isAsyncIterable
            ? result[Symbol.asyncIterator]()
            : result[Symbol.iterator]();

        const signal = ensureRequestSignal(req, res);
        let aborted = signal.aborted;
        let resolveAbort: ((value: IteratorResult<any>) => void) | undefined;
        let iteratorReturnCalled = false;

        const abortedResult: IteratorResult<any> = { done: true, value: undefined };

        const abortedPromise = new Promise<IteratorResult<any>>((resolve) => {
            resolveAbort = resolve;
        });

        const closeIterator = () => {
            if (iteratorReturnCalled || typeof iterator.return !== 'function') return;

            iteratorReturnCalled = true;
            Promise.resolve(iterator.return()).catch(() => {});
        };

        const onAborted = () => {
            if (aborted) return;
            aborted = true;
            resolveAbort?.(abortedResult);
            queueMicrotask(closeIterator);
        };

        signal.addEventListener('abort', onAborted, { once: true });

        const rawObj = res.raw as any;

        const cleanupListeners = () => {
            signal.removeEventListener('abort', onAborted);
        };

        const isResponseClosed = () =>
            aborted ||
            res.sent ||
            res.raw.destroyed ||
            res.raw.writableEnded ||
            rawObj?.res?.aborted ||
            rawObj?.res?.finished;

        const nextChunk = async (): Promise<IteratorResult<any>> => {
            if (isResponseClosed()) return abortedResult;

            const next = iterator.next();

            if (!isAsyncIterable) return next;

            return Promise.race([next, abortedPromise]);
        };

        const writeIfOpen = (op: () => void) => {
            if (isResponseClosed()) return false;

            try {
                op();
                return !isResponseClosed();
            } catch (err) {
                if (
                    err?.message?.includes(
                        'uWS.HttpResponse must not be accessed after uWS.HttpResponse.onAborted callback',
                    )
                ) {
                    onAborted();
                    return false;
                }

                throw err;
            }
        };

        let firstChunk;

        try {
            firstChunk = await nextChunk();
        } catch (err) {
            // if occurs before the first yield
            cleanupListeners();
            handleError(req, res, err);
            return;
        }

        if (res.sent) {
            cleanupListeners();
            return;
        }

        if (firstChunk.done) {
            cleanupListeners();

            if (firstChunk.value !== undefined && !isResponseClosed()) {
                res.send(firstChunk.value);
            }

            return;
        }

        writeIfOpen(() => {
            const headers: OutgoingHttpHeaders = {};

            for (const [key, value] of Object.entries(res.getHeaders())) {
                if (value === undefined) continue;
                headers[key] = Array.isArray(value) ? value.map(String) : String(value);
            }

            headers['Content-Type'] = 'text/event-stream';
            headers['Cache-Control'] = 'no-cache';
            headers.Connection = 'keep-alive';

            res.raw.writeHead(200, headers);
            if (res.raw.flushHeaders) res.raw.flushHeaders();
        });

        try {
            writeIfOpen(() => {
                res.raw.write(formatSSE(firstChunk.value));
            });

            while (true) {
                if (isResponseClosed()) break;
                const chunk = await nextChunk();

                if (chunk.done || isResponseClosed()) break;

                writeIfOpen(() => {
                    res.raw.write(formatSSE(chunk.value));
                });
            }
        } catch (err: any) {
            if (!aborted) {
                error(
                    'Error while streaming response for ' +
                        route.method.toUpperCase() +
                        ':' +
                        route.url +
                        ' - ' +
                        err.message,
                    'SSE',
                );
            }
        } finally {
            cleanupListeners();

            if (isResponseClosed()) {
                closeIterator();
            } else {
                writeIfOpen(() => {
                    res.raw.end();
                });
            }
        }
    };

    const finalizeResult = (req: FastifyRequest, res: FastifyReply, result: any) => {
        if (res.sent) return;

        const isIterable = result && typeof result[Symbol.iterator] === 'function';
        const isAsyncIterable = result && typeof result[Symbol.asyncIterator] === 'function';

        if (isIterable || isAsyncIterable) {
            streamResult(req, res, result, isAsyncIterable).catch((err) => {
                handleError(req, res, err);
            });
            return;
        }

        if (!res.sent && result !== undefined) {
            res.send(result);
        }
    };

    const executeRoute = handleIsAsync
        ? async (req: FastifyRequest, res: FastifyReply) => {
              try {
                  const result = await routeFunc.handle(req, res);
                  finalizeResult(req, res, result);
              } catch (error) {
                  handleError(req, res, error);
              }
          }
        : (req: FastifyRequest, res: FastifyReply) => {
              let result;

              try {
                  result = routeFunc.handle(req, res);
              } catch (error) {
                  handleError(req, res, error);
                  return;
              }

              if (result instanceof Promise) {
                  result
                      .then((resolved) => {
                          finalizeResult(req, res, resolved);
                      })
                      .catch((error) => {
                          handleError(req, res, error);
                      });
                  return;
              }

              finalizeResult(req, res, result);
          };

    const isSimpleRoute = !hmrEnabled && !hasHooks && !hasMatchers && !isParametric;

    if (isSimpleRoute) {
        return function (req: FastifyRequest, res: FastifyReply) {
            ensureRequestSignal(req, res);
            executeRoute(req, res);
        };
    }

    const runHooks = (req: FastifyRequest, res: FastifyReply) => {
        let hookIndex = 0;

        const runNextHook = (hookErr?: unknown) => {
            if (hookErr) {
                handleError(req, res, hookErr);
                return;
            }

            if (res.sent) return;

            if (hookIndex >= hooks.length) {
                executeRoute(req, res);
                return;
            }

            const hookFun = hooks[hookIndex++];
            const hookInstance = typeof hookFun === 'function' ? new (hookFun as any)() : hookFun;

            let doneCalled = false;
            const done = (doneErr?: unknown) => {
                if (doneCalled) return;
                doneCalled = true;
                runNextHook(doneErr);
            };

            try {
                hookInstance.handle(req, res, done);
            } catch (err) {
                done(err);
            }
        };

        runNextHook();
    };

    return function (req: FastifyRequest, res: FastifyReply) {
        ensureRequestSignal(req, res);

        if (hmrEnabled && isParametric) {
            const currentPath = req.raw.url.split('?')[0];
            const method = req.method.toLowerCase();
            const specificHandler = state.temporaryRequests[method]?.[currentPath];

            if (specificHandler) {
                return specificHandler(req, res);
            }
        }

        if (!checkMatchers(req)) {
            return send404(req, res);
        }

        if (!hasHooks) {
            executeRoute(req, res);
            return;
        }

        runHooks(req, res);
    };
}

function send404(req: FastifyRequest, res: FastifyReply) {
    return res.status(404).send({
        message: `Route ${req.method}:${req.url} not found`,
        error: 'Not Found',
        statusCode: 404,
    });
}

function getRegisteredWebSocketsForApp(oweb: Oweb): Set<string> {
    let wsRegistry = oweb._internalKV.get(WS_REGISTRY_KEY) as Set<string> | undefined;

    if (!wsRegistry) {
        wsRegistry = new Set<string>();
        oweb._internalKV.set(WS_REGISTRY_KEY, wsRegistry);
    }

    return wsRegistry;
}

function assignSpecificRoute(oweb: Oweb, route: GeneratedRoute) {
    if (!route?.fn) return;
    const state = getRuntimeState(oweb);

    if (route?.fn?.prototype instanceof WebSocketRoute) {
        const wsInstance = new route.fn() as WebSocketRoute;
        state.websocketRoutes[route.url] = wsInstance;

        const registeredWebSockets = getRegisteredWebSocketsForApp(oweb);

        if (!registeredWebSockets.has(route.url)) {
            registeredWebSockets.add(route.url);

            if (oweb._options.uWebSocketsEnabled && oweb.uServer) {
                const proxy = createWebSocketProxy(oweb, route.url);
                oweb.ws(route.url, proxy, route.fileInfo.hooks);
            } else {
                oweb.get(route.url, { websocket: true }, (arg1: any, arg2: any) => {
                    (async () => {
                        let socket: any;
                        let req: any;

                        if (arg1 && arg1.socket) {
                            // @fastify/websocket behavior
                            socket = arg1.socket;
                            req = arg2;
                        } else if (arg1 && arg1.raw && arg1.raw.socket) {
                            // route treated as http or raw request passed
                            // we try to grab the underlying socket though this usually implies handshake failed
                            socket = arg1.raw.socket;
                            req = arg1;
                        } else {
                            // maybe arg1 is the socket?
                            socket = arg1;
                            req = arg2 || {};
                        }

                        // Validation
                        if (!socket || typeof socket.on !== 'function') {
                            error(
                                `Could not find underlying socket for route ${route.url}. Arg1 type: ${typeof arg1}`,
                                'WS',
                            );

                            return;
                        }

                        const adapter = new FastifyWebSocketAdapter(socket, req.raw || req);

                        socket.on('error', (err: Error) => {
                            error(`${route.url}: ${err.message}`, 'WS');
                        });

                        const hooks = route.fileInfo.hooks || [];
                        try {
                            for (const HookClass of hooks) {
                                await new Promise<void>((resolve, reject) => {
                                    const hookInstance =
                                        typeof HookClass === 'function'
                                            ? new (HookClass as any)()
                                            : HookClass;

                                    hookInstance.handle(
                                        req,
                                        {
                                            status: (c) => ({
                                                send: (m) => {
                                                    socket.close(c, m);
                                                    reject('closed');
                                                },
                                            }),
                                            header: () => {},
                                            send: (m) => {
                                                socket.close(1000, m);
                                                reject('closed');
                                            },
                                        },
                                        (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        },
                                    );
                                });
                            }
                        } catch (e) {
                            if (e !== 'closed') {
                                error(`WebSocket Hook Error: ${e}`, 'WS');
                                socket.close(1011);
                            }
                            return;
                        }

                        const getHandler = () => state.websocketRoutes[route.url];

                        socket.on('message', (message: any, isBinary: boolean) => {
                            const h = getHandler();
                            if (h?.message) h.message(adapter, message, isBinary);
                        });

                        socket.on('close', (code: number, reason: Buffer) => {
                            const h = getHandler();
                            adapter.cleanup();
                            if (h?.close) h.close(adapter, code, reason);
                        });

                        socket.on('ping', (data: any) => {
                            const h = getHandler();
                            if (h?.ping) h.ping(adapter, data);
                        });

                        socket.on('pong', (data: any) => {
                            const h = getHandler();
                            if (h?.pong) h.pong(adapter, data);
                        });

                        const handler = getHandler();
                        if (handler?.open) {
                            await handler.open(adapter, req);
                        }
                    })().catch((err) => {
                        error(`Internaal Error on ${route.url}: ${err.message}`, 'WS');

                        if (arg1 && arg1.socket) {
                            try {
                                arg1.socket.close(1011);
                            } catch {}
                        }
                    });
                });
            }
        }
        return;
    }

    const routeFunc = new route.fn();
    const routeHandler = inner(oweb, route);

    if (!routeHandler) return;

    const hmrEnabled = !!oweb._internalKV.get('hmr');

    if (hmrEnabled) {
        state.routeFunctions[route.method][route.url] = routeHandler;

        oweb[route.method](
            route.url,
            routeFunc._options || {},
            function (req: FastifyRequest, res: FastifyReply) {
                if (state.routeFunctions[route.method][route.url]) {
                    return state.routeFunctions[route.method][route.url](req, res);
                } else {
                    // if file was present but later renamed at HMR, this will be useful
                    const vals = state.temporaryRequests[route.method];
                    const keys = Object.keys(vals);

                    if (!vals || !keys.length) {
                        return send404(req, res);
                    }

                    const f = keys.find((tempName) => {
                        const matcher = match(tempName);
                        return matcher(req.url);
                    });

                    if (f && vals[f]) {
                        return vals[f](req, res);
                    } else {
                        return send404(req, res);
                    }
                }
            },
        );

        return;
    }

    oweb[route.method](route.url, routeFunc._options || {}, routeHandler as any);
}

async function loadMatchers(directoryPath: string, state: RuntimeState) {
    const files = readdirSync(directoryPath).filter((f) =>
        ['.js', '.ts'].includes(path.extname(f)),
    );

    for (const file of files) {
        const filePath = path.join(directoryPath, file);

        const fileName = path.basename(filePath);

        const packageURL = pathToFileURL(path.resolve(filePath)).href;

        const def = await import(packageURL);

        state.matcherOverrides[removeExtension(fileName)] = def.default;
    }
}

export const assignRoutes = async (oweb: Oweb, directory: string, matchersDirectory?: string) => {
    resetRuntimeCaches(oweb);
    const state = getRuntimeState(oweb);

    if (matchersDirectory) {
        await loadMatchers(matchersDirectory, state);
    }

    const files = await walk(directory);
    const routes = await generateRoutes(files, undefined, state.compiledRoutes);

    state.routesCache = routes;

    function fallbackHandle(req: FastifyRequest, res: FastifyReply) {
        const vals = state.temporaryRequests[req.method.toLowerCase()];
        const keys = Object.keys(vals);

        if (!vals || !keys.length) {
            return send404(req, res);
        }

        const f = keys.find((tempName) => {
            const matcher = match(tempName);
            return matcher(req.url);
        });

        if (f && vals[f]) {
            return vals[f](req, res);
        } else {
            return send404(req, res);
        }
    }

    if (oweb._internalKV.get('hmr')) {
        for (const element of ['get', 'post', 'put', 'patch', 'delete']) {
            oweb[element]('*', fallbackHandle);
        }
    }

    for (const route of routes) {
        assignSpecificRoute(oweb, route);
    }
};
