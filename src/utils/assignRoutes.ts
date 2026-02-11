import type { FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const websocketRoutes: Record<string, WebSocketRoute> = {};
const registeredWebSockets = new Set<string>();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let matcherOverrides = {};

let routeFunctions: Record<string, Record<string, Function>> = {
    get: {},
    post: {},
    put: {},
    delete: {},
    patch: {},
    options: {},
};

const temporaryRequests: Record<string, Record<string, Function>> = {
    get: {},
    post: {},
    put: {},
    delete: {},
    patch: {},
    options: {},
};

let routesCache: GeneratedRoute[] = [];

const compiledRoutes = {};

function removeExtension(filePath: string) {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        return filePath.substring(0, lastDotIndex);
    }
    return filePath;
}

function createWebSocketProxy(url: string) {
    const getHandler = () => websocketRoutes[url];

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
    let def;

    const fileName = path.basename(filePath);

    if (op === 'delete-file') {
        delete matcherOverrides[removeExtension(fileName)];
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
        const newFilePath = filePath.replaceAll('\\', '/');

        const packageURL = new URL(
            path.resolve(newFilePath),
            `file://${__dirname}`,
        ).pathname.replaceAll('\\', '/');

        const cacheBuster = `?t=${Date.now()}`;
        def = (await import(packageURL + cacheBuster)).default;
        const end = Date.now() - start;

        success(`Matcher ${filePath} reloaded in ${end}ms`, 'HMR');
    }

    if (def) {
        matcherOverrides[removeExtension(fileName)] = def;
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
    if (path.endsWith('hooks.js') || path.endsWith('hooks.ts')) {
        warn(
            `Hot Module Replacement is not supported for hooks. Restart the server for changes to take effect.`,
            'HMR',
        );
        return;
    }

    if (path.endsWith('.ts')) {
        const start = Date.now();
        compiledRoutes[path] = content.length
            ? await generateFunctionFromTypescript(content, path)
            : undefined;
        const end = Date.now() - start;
        success(`File ${path} compiled in ${end}ms`, 'HMR');
    }

    if (op === 'new-file') {
        const start = Date.now();
        const files = await walk(workingDir, [], fallbackDir);
        const routes = await generateRoutes(files, path);
        routesCache = routes;

        const f = routes.find((x) => x.fileInfo.filePath == path);

        if (f?.fn?.prototype instanceof WebSocketRoute) {
            assignSpecificRoute(oweb, f);
            const end = Date.now() - start;
            success(`WebSocket Route ${f.url} created in ${end}ms`, 'HMR');
            return;
        }

        temporaryRequests[f.method.toLowerCase()][f.url] = inner(oweb, f);
        const end = Date.now() - start;
        success(`Route ${f.method.toUpperCase()}:${f.url} created in ${end}ms`, 'HMR');
    } else if (op === 'modify-file') {
        const start = Date.now();
        const files = await walk(workingDir, [], fallbackDir);
        const routes = await generateRoutes(files, path);
        routesCache = routes;

        const f = routes.find((x) => x.fileInfo.filePath == path);

        if (f?.fn?.prototype instanceof WebSocketRoute) {
            websocketRoutes[f.url] = new f.fn() as WebSocketRoute;

            const end = Date.now() - start;
            success(`WebSocket Route ${f.url} reloaded in ${end}ms`, 'HMR');
            return;
        }

        if (f.url in temporaryRequests[f.method.toLowerCase()]) {
            temporaryRequests[f.method.toLowerCase()][f.url] = inner(oweb, f);
        } else {
            routeFunctions[f.method.toLowerCase()][f.url] = inner(oweb, f);
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

        if (websocketRoutes[builded.url]) {
            delete websocketRoutes[builded.url];
            const end = Date.now() - start;
            success(`WebSocket Route ${builded.url} removed (shimmed) in ${end}ms`, 'HMR');
            return;
        }

        const f = routesCache.find((x) => x.method == builded.method && x.url == builded.url);
        if (f) {
            if (f.url in temporaryRequests[f.method.toLowerCase()]) {
                delete temporaryRequests[f.method.toLowerCase()][f.url];
            } else {
                delete routeFunctions[f.method.toLowerCase()][f.url];
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

export const generateRoutes = async (files: WalkResult[], onlyGenerateFn?: string) => {
    const routes: GeneratedRoute[] = [];

    for (const file of files) {
        const parsedFile = path.parse(file.rel);
        const filePath = file.filePath.replaceAll('\\', '/');

        const packageURL = new URL(
            path.resolve(filePath),
            `file://${__dirname}`,
        ).pathname.replaceAll('\\', '/');

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

        if (!(onlyGenerateFn && file.filePath !== onlyGenerateFn)) {
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

    const isParametric = route.url.includes(':') || route.url.includes('*');

    return function (req: FastifyRequest, res: FastifyReply) {
        if (oweb._internalKV.get('hmr') && isParametric) {
            const currentPath = req.raw.url.split('?')[0];

            const method = req.method.toLowerCase();

            const specificHandler = temporaryRequests[method]?.[currentPath];

            if (specificHandler && specificHandler !== temporaryRequests[route.method][route.url]) {
                return specificHandler(req, res);
            }
        }

        const checkMatchers = () => {
            for (const matcher of matchers) {
                const param = req.params[matcher.paramName];
                const fun = matcherOverrides[matcher.matcherName];
                if (fun) {
                    return fun(param);
                }
            }
            return true;
        };

        const handle = async () => {
            let result;

            try {
                if (routeFunc.handle.constructor.name === 'AsyncFunction') {
                    result = await routeFunc.handle(req, res);
                } else {
                    result = routeFunc.handle(req, res);
                    if (result instanceof Promise) {
                        result = await result;
                    }
                }
            } catch (error) {
                if (routeFunc?.handleError) {
                    routeFunc.handleError(req, res, error);
                } else {
                    oweb._options.OWEB_INTERNAL_ERROR_HANDLER(req, res, error);
                }
                return;
            }

            const isIterable = result && typeof result[Symbol.iterator] === 'function';
            const isAsyncIterable = result && typeof result[Symbol.asyncIterator] === 'function';

            if ((isIterable || isAsyncIterable) && !res.sent) {
                const rawObj = res.raw as any;
                const uwsRes =
                    rawObj.res && typeof rawObj.res.cork === 'function' ? rawObj.res : null;

                const corkedOp = (op: () => void) => {
                    if (uwsRes) {
                        uwsRes.cork(op);
                    } else {
                        op();
                    }
                };

                corkedOp(() => {
                    res.raw.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        Connection: 'keep-alive',
                        'Access-Control-Allow-Origin': '*', // probably should change this in the near future tho
                    });

                    if (res.raw.flushHeaders) {
                        res.raw.flushHeaders();
                    }
                });

                let aborted = false;
                const onAborted = () => {
                    aborted = true;
                };

                if (res.raw.on) {
                    res.raw.on('close', onAborted);
                    res.raw.on('aborted', onAborted);
                } else if (rawObj['onAborted']) {
                    rawObj['onAborted'](onAborted);
                }

                try {
                    if (isAsyncIterable) {
                        for await (const chunk of result) {
                            if (aborted || res.raw.destroyed) break;

                            corkedOp(() => {
                                res.raw.write(formatSSE(chunk));
                            });
                        }
                    } else {
                        for (const chunk of result) {
                            if (aborted || res.raw.destroyed) break;

                            corkedOp(() => {
                                res.raw.write(formatSSE(chunk));
                            });
                        }
                    }
                } catch (err) {
                    error(
                        `Error while streaming response for ${route.method.toUpperCase()}:${route.url} - ${err.message}`,
                        'SSE',
                    );
                } finally {
                    if (res.raw.off) {
                        res.raw.off('close', onAborted);
                        res.raw.off('aborted', onAborted);
                    }

                    if (!aborted && !res.raw.destroyed) {
                        corkedOp(() => {
                            res.raw.end();
                        });
                    }
                }
                return;
            }

            if (!res.sent && result !== undefined) {
                res.send(result);
            }
        };

        //assign hooks if exists
        if (route.fileInfo.hooks.length) {
            for (let index = 0; index < route.fileInfo.hooks.length; index++) {
                const hookFun = route.fileInfo.hooks[index];
                const hookInstance =
                    typeof hookFun === 'function' ? new (hookFun as any)() : hookFun;

                hookInstance.handle(req, res, () => {
                    //callback

                    if (index + 1 == route.fileInfo.hooks.length) {
                        //means all of the hooks passed through

                        if (!checkMatchers()) {
                            send404(req, res);
                        } else {
                            handle();
                        }
                    }
                });
            }
        } else {
            if (!checkMatchers()) {
                send404(req, res);
            } else {
                handle();
            }
        }
    };
}

function send404(req: FastifyRequest, res: FastifyReply) {
    return res.status(404).send({
        message: `Route ${req.method}:${req.url} not found`,
        error: 'Not Found',
        statusCode: 404,
    });
}

function assignSpecificRoute(oweb: Oweb, route: GeneratedRoute) {
    if (!route?.fn) return;

    if (route?.fn?.prototype instanceof WebSocketRoute) {
        const wsInstance = new route.fn() as WebSocketRoute;
        websocketRoutes[route.url] = wsInstance;

        if (!registeredWebSockets.has(route.url)) {
            registeredWebSockets.add(route.url);

            if (oweb._options.uWebSocketsEnabled && oweb.uServer) {
                const proxy = createWebSocketProxy(route.url);
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

                        const getHandler = () => websocketRoutes[route.url];

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

    routeFunctions[route.method][route.url] = inner(oweb, route);

    oweb[route.method](
        route.url,
        routeFunc._options || {},
        function (req: FastifyRequest, res: FastifyReply) {
            if (routeFunctions[route.method][route.url]) {
                return routeFunctions[route.method][route.url](req, res);
            } else {
                // if file was present but later renamed at HMR, this will be useful
                const vals = temporaryRequests[route.method];
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
}

async function loadMatchers(directoryPath: string) {
    const files = readdirSync(directoryPath).filter((f) =>
        ['.js', '.ts'].includes(path.extname(f)),
    );

    for (const file of files) {
        const filePath = path.join(directoryPath, file).replaceAll('\\', '/');

        const fileName = path.basename(filePath);

        const packageURL = new URL(
            path.resolve(filePath),
            `file://${__dirname}`,
        ).pathname.replaceAll('\\', '/');

        const def = await import(packageURL);

        matcherOverrides[removeExtension(fileName)] = def.default;
    }
}

export const assignRoutes = async (oweb: Oweb, directory: string, matchersDirectory?: string) => {
    if (matchersDirectory) {
        loadMatchers(matchersDirectory);
    }

    const files = await walk(directory);
    const routes = await generateRoutes(files);

    routesCache = routes;

    function fallbackHandle(req: FastifyRequest, res: FastifyReply) {
        const vals = temporaryRequests[req.method.toLowerCase()];
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

    for (const element of ['get', 'post', 'put', 'patch', 'delete']) {
        oweb[element]('*', fallbackHandle);
    }

    for (const route of routes) {
        assignSpecificRoute(oweb, route);
    }
};
