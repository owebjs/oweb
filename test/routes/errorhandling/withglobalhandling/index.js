export default class {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        throw new Error(
            'Boom 💥. Handled by the setInternalErrorHandler function inside index.js or handled by Oweb if no setInternalErrorHandler defined in index.js.',
        );
    }
}
