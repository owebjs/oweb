import { Route } from '../../../dist/index.js';
import { ChunkUpload } from '../../../dist/plugins/index.js';

export default class extends Route {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        const file = await req.file();
        const buffer = await file.toBuffer();

        await ChunkUpload(
            {
                buffer,
                fileName: file.filename,
                currentChunk: +req.query.currentChunk,
                totalChunks: +req.query.totalChunks,
            },
            {
                path: './uploads',
                maxChunkSize: 10 * 1024 * 1024,
            },
        );

        return res.status(204).send();
    }
}
