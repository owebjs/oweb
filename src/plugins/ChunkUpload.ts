import type { FastifyRequest, FastifyReply } from 'fastify';
import { setTimeout as wait } from 'node:timers/promises';

interface ChunkUploadOptions {
    path: string;
    chunkSize: number;
    maxFileSize: number;
}

export default async function ChunkUpload(
    req: FastifyRequest,
    res: FastifyReply,
    options: ChunkUploadOptions,
) {
    await wait(2000);
    return true;
}
