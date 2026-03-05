import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { requestJson } from '../helpers/http.js';

describe('ChunkUpload plugin integration', () => {
    let server;
    let uploadDir;

    beforeAll(async () => {
        server = await createTestApp({ registerMultipart: true });
    });

    afterAll(async () => {
        if (server?.close) await server.close();
    });

    afterEach(async () => {
        if (uploadDir) {
            await rm(uploadDir, { recursive: true, force: true });
            uploadDir = null;
        }
    });

    async function uploadChunk({ chunk, currentChunk, totalChunks, fileName = 'payload.txt' }) {
        const form = new FormData();
        const data = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;

        form.append('file', new Blob([data]), fileName);

        return requestJson(
            server.baseUrl,
            `/plugins/chunk-upload?currentChunk=${currentChunk}&totalChunks=${totalChunks}&target=${encodeURIComponent(uploadDir)}`,
            {
                method: 'PUT',
                body: form,
            },
        );
    }

    it('stores chunked uploads and assembles final file', async () => {
        uploadDir = await mkdtemp(path.join(os.tmpdir(), 'oweb-chunk-upload-'));

        const first = await uploadChunk({
            chunk: 'hello ',
            currentChunk: 1,
            totalChunks: 2,
        });

        expect(first.response.status).toBe(200);
        expect(first.body).toEqual({
            status: 'SUCCESS',
            currentChunk: 1,
        });

        const second = await uploadChunk({
            chunk: 'world',
            currentChunk: 2,
            totalChunks: 2,
        });

        expect(second.response.status).toBe(200);
        expect(second.body).toEqual({
            status: 'SUCCESS',
            uploadCompleted: true,
        });

        const saved = await readFile(path.join(uploadDir, 'payload.txt'), 'utf-8');
        expect(saved).toBe('hello world');
    });

    it('returns CHUNK_TOO_LARGE for invalid chunk size', async () => {
        uploadDir = await mkdtemp(path.join(os.tmpdir(), 'oweb-chunk-upload-'));

        const tooLarge = await uploadChunk({
            chunk: Buffer.alloc(2048, 65),
            currentChunk: 1,
            totalChunks: 1,
            fileName: 'big.bin',
        });

        expect(tooLarge.response.status).toBe(413);
        expect(tooLarge.body).toEqual({
            status: 'CHUNK_TOO_LARGE',
        });
    });
});