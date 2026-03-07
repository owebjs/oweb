import { Route } from 'owebjs';
import { ChunkUpload, ChunkUploadStatus } from 'owebjs/dist/plugins';

export default class ChunkUploadRoute extends Route {
    async handle(req, res) {
        const file = await req.file();
        const buffer = await file.toBuffer();

        const currentChunk = Number(req.query.currentChunk);
        const totalChunks = Number(req.query.totalChunks);
        const target =
            typeof req.query.target === 'string' && req.query.target.length
                ? req.query.target
                : './test-uploads';

        const result = await ChunkUpload(
            {
                buffer,
                fileName: file.filename,
                currentChunk,
                totalChunks,
            },
            {
                path: target,
                maxChunkSize: 1024,
                maxFileSize: 4096,
            },
        );

        if (
            result.status === ChunkUploadStatus.ChunkTooLarge ||
            result.status === ChunkUploadStatus.FileTooLarge
        ) {
            return res.status(413).send(result);
        }

        if (result.status === ChunkUploadStatus.InvalidChunk) {
            return res.status(400).send(result);
        }

        return res.status(200).send(result);
    }
}