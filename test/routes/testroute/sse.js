import { Route } from '../../../dist/index.js';

export default class extends Route {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async *handle(req, res) {
        yield 'conn 1';

        await new Promise((r) => setTimeout(r, 1000));
        yield { message: 'obj' };

        await new Promise((r) => setTimeout(r, 1000));
        yield 1; // ?
    }
}
