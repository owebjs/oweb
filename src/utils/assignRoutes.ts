import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoutePath, buildRouteURL } from './utils.js';
import { walk, type WalkResult } from './walk';

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

        routes.push({
            url: route.url,
            method: route.method,
            fn: def?.default,
        });
    }

    return routes;
};

export const assignRoutes = async (directory: string, fastify: FastifyInstance) => {
    const files = walk(directory);

    const routes = await generateRoutes(files);

    for (const route of routes) {
        fastify[route.method](route.url, function () {
            new route.fn(...arguments);
        });
    }
};
