import { Route } from '../../../dist/index.js';

export default class extends Route {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        console.log(
            'Hello from routes > testroute > index.js. As you may noticed the _hooks.js inside testroute directory and the routes directory will also take effect in this route.',
        );

        res.send('Check your console!');
    }
}
