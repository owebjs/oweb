export default class {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    handle(req, res, done) {
        console.log('Hello from routes > _hooks.js');
        done();
    }
}
