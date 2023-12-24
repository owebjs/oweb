import type { FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoutePath, buildRouteURL } from './utils';
import { walk, type WalkResult } from './walk';
import { Oweb } from '../index';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const generateRoutes = async (files: WalkResult[]) => {
    const routes = [];

    for (const file of files) {
        const parsedFile = path.parse(file.rel);
        const filePath = file.filePath.replaceAll('\\', '/');

        const packageURL = new URL(
            path.resolve(filePath),
            `file://${__dirname}`,
        ).pathname.replaceAll('\\', '/');

        const routePath = buildRoutePath(parsedFile);
        const route = buildRouteURL(routePath);
        const def = await import(packageURL);

        const routeFuncs = def.default;

        routes.push({
            url: route.url,
            method: route.method,
            fn: routeFuncs,
            fileInfo: file,
        });
    }

    return routes;
};

export const assignRoutes = async (directory: string, oweb: Oweb) => {
    const files = await walk(directory);
    const routes = await generateRoutes(files);

    for (const route of routes) {
        const routeFunc = new route.fn();

        oweb[route.method](
            route.url,
            routeFunc._options || {},
            function (req: FastifyRequest, res: FastifyReply) {
                const handle = () => {
                    if (routeFunc.handle.constructor.name == 'AsyncFunction') {
                        routeFunc.handle(...arguments).catch((error) => {
                            const handleErrorArgs = [...arguments, error];
                            if (routeFunc?.handleError) {
                                routeFunc.handleError(...handleErrorArgs);
                            } else {
                                oweb._options.OWEB_INTERNAL_ERROR_HANDLER(...handleErrorArgs);
                            }
                        });
                    } else {
                        try {
                            routeFunc.handle(...arguments);
                        } catch (error) {
                            const handleErrorArgs = [...arguments, error];
                            if (routeFunc?.handleError) {
                                routeFunc.handleError(...handleErrorArgs);
                            } else {
                                oweb._options.OWEB_INTERNAL_ERROR_HANDLER(...handleErrorArgs);
                            }
                        }
                    }
                };

                //assign hooks if exists
                if (route.fileInfo.hooks.length) {
                    for (let index = 0; index < route.fileInfo.hooks.length; index++) {
                        const hookFun = route.fileInfo.hooks[index];
                        new hookFun().handle(req, res, () => {
                            //callback
                            if (index + 1 == route.fileInfo.hooks.length) {
                                //means all of the hooks passed through

                                handle();
                            }
                        });
                    }
                } else {
                    handle();
                }
            },
        );
    }
};
