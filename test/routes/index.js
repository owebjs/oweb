import { Route } from '../../dist/index.js';

export default class extends Route {
    /**
     *
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    handle(req, res) {
        res.send('Hello, World!');
    }
}
