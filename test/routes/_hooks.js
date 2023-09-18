export default class {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    handle(req, res, done) {
        console.log('hello from hook!', req.url);
        done();
    }
}
