import { FastifyReply, FastifyRequest } from 'fastify';
import type { Awaitable } from '../types';

export declare interface Route {
    handle(req: FastifyRequest, res: FastifyReply): Awaitable<any>;
    handleError?(req: FastifyRequest, res: FastifyReply, err: Error): Awaitable<any>;
}

export abstract class Route {
    public handle() {
        throw new Error('Route#handle must be implemented');
    }
}
