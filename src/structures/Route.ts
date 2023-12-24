import type { FastifyReply, FastifyRequest, RouteShorthandOptions } from '../index';
import type { Awaitable } from '../types';

export declare interface Route {
    handle(req: FastifyRequest, res: FastifyReply): Awaitable<any>;
    handleError?(req: FastifyRequest, res: FastifyReply, err: Error): Awaitable<any>;
}

export abstract class Route {
    public _options: RouteShorthandOptions = {};

    public constructor(options?: RouteShorthandOptions) {
        this._options = options ?? {};
    }

    public handle() {
        throw new Error('Route#handle must be implemented');
    }
}
