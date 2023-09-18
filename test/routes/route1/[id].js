import { JwtAuth } from '../../../dist/helpers/JwtAuth.js';
import { register } from '../../../dist/helpers/PluginRegistrar.js';

export default class {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        console.log(req.routeOptions.url);
        res.send('deneme');
    }
}
