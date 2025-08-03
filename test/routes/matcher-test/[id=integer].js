import { Route } from '../../../dist/index.js';

export default class extends Route {
    /**
     *
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        const id = parseInt(req.params.id);

        res.send({
            message: 'Parameter matcher test successful',
            id: id,
            type: typeof id,
            validationPassed: true,
        });
    }
}
