import { writeFileSync } from 'fs';
import { Hook } from '../../../../dist/index.js';

export default class extends Hook {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        const avatar = req.body['avatar'];

        const buffer = await avatar.toBuffer();

        writeFileSync('avatar.png', buffer);

        res.send('ok');
    }
}
