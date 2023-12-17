export default class {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        throw new Error('Boom 💥. Handled by the handleError function inside the route file.');
    }

    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     * @param {Error} err
     */
    handleError(req, res, err) {
        console.log(err);
        res.send('handled from handleError function');
    }
}
