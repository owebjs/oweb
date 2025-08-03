import type { FastifyReply, FastifyRequest, RouteShorthandOptions } from '../index';
import type { Awaitable } from '../types';

export abstract class Route {
    public _options: RouteShorthandOptions = {};

    public constructor(options?: RouteShorthandOptions) {
        this._options = options ?? {};
    }

    abstract handle(req: FastifyRequest, res: FastifyReply): Awaitable<any>;
    handleError?(req: FastifyRequest, res: FastifyReply, err: Error): Awaitable<any>;
}
