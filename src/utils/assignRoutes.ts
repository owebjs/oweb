import type { FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoutePath, buildRouteURL } from './utils';
import { walk, type WalkResult } from './walk';
import { Oweb, Route } from '../index';
import { HMROperations } from './watcher';
import { success, warn } from './logger';
import { match } from 'path-to-regexp';
import generateFunctionFromTypescript from './generateFunctionFromTypescript';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let matcherOverrides = {};

let routeFunctions = {};

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
        const routes = await generateRoutes(files);

        routesCache = routes;

        const f = routes.find((x) => x.fileInfo.filePath == path);

        temporaryRequests[f.method.toLowerCase()][f.url] = inner(oweb, f);

        const end = Date.now() - start;

        success(`Route ${f.method.toUpperCase()}:${f.url} created in ${end}ms`, 'HMR');
    } else if (op === 'modify-file') {
        const start = Date.now();
        const files = await walk(workingDir, [], fallbackDir);
        const routes = await generateRoutes(files);

        routesCache = routes;

        const f = routes.find((x) => x.fileInfo.filePath == path);

        if (f.url in temporaryRequests[f.method.toLowerCase()]) {
            temporaryRequests[f.method.toLowerCase()][f.url] = inner(oweb, f);
        } else {
            routeFunctions[f.fileInfo.filePath] = inner(oweb, f);
        }

        const end = Date.now() - start;

        success(`Route ${f.method.toUpperCase()}:${f.url} reloaded in ${end}ms`, 'HMR');
    } else if (op === 'delete-file') {
        const start = Date.now();
        const f = routesCache.find((x) => x.fileInfo.filePath == path);

        if (f.url in temporaryRequests[f.method.toLowerCase()]) {
            delete temporaryRequests[f.method.toLowerCase()][f.url];
        } else {
            delete routeFunctions[f.fileInfo.filePath];
        }

        const end = Date.now() - start;

        success(`Route ${f.method.toUpperCase()}:${f.url} removed in ${end}ms`, 'HMR');
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

export const generateRoutes = async (files: WalkResult[]) => {
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

        const cacheBuster = `?t=${Date.now()}`;
        const def = await import(packageURL + cacheBuster);

        const routeFuncs = def.default;

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

    return function (req: FastifyRequest, res: FastifyReply) {
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

        const handle = () => {
            if (routeFunc.handle.constructor.name == 'AsyncFunction') {
                routeFunc.handle(req, res).catch((error) => {
                    if (routeFunc?.handleError) {
                        routeFunc.handleError(req, res, error);
                    } else {
                        oweb._options.OWEB_INTERNAL_ERROR_HANDLER(req, res, error);
                    }
                });
            } else {
                try {
                    routeFunc.handle(req, res);
                } catch (error) {
                    if (routeFunc?.handleError) {
                        routeFunc.handleError(req, res, error);
                    } else {
                        oweb._options.OWEB_INTERNAL_ERROR_HANDLER(req, res, error);
                    }
                }
            }
        };

        //assign hooks if exists
        if (route.fileInfo.hooks.length) {
            for (let index = 0; index < route.fileInfo.hooks.length; index++) {
                const hookFun = route.fileInfo.hooks[index];
                hookFun.prototype.handle(req, res, () => {
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
    if (!route.fn) return;

    const routeFunc = new route.fn();

    routeFunctions[route.fileInfo.filePath] = inner(oweb, route);

    oweb[route.method](
        route.url,
        routeFunc._options || {},
        function (req: FastifyRequest, res: FastifyReply) {
            if (routeFunctions[route.fileInfo.filePath]) {
                return routeFunctions[route.fileInfo.filePath](req, res);
            } else {
                // if file was present but later renamed at HMR, this will be useful
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
        },
    );
}

async function loadMatchers(directoryPath: string) {
    const files = readdirSync(directoryPath);

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
