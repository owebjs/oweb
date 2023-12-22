import { Hook } from '../../dist/index.js';

export default class extends Hook {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    handle(req, res, done) {
        console.log('Hello from routes > _hooks.js');
        done();
    }
}
