import { Route } from '../../../dist/index.js';

export default class extends Route {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        res.send('You sent: ' + req.params.id);
    }
}
