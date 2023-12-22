import { FastifyReply, FastifyRequest } from '../index';
import type { Awaitable } from '../types';

export declare interface Hook {
    handle(req: FastifyRequest, res: FastifyReply, done: () => void): Awaitable<any>;
}

export abstract class Hook {
    public handle() {
        throw new Error('Hook#handle must be implemented');
    }
}
