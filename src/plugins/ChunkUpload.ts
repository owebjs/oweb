import fs from 'node:fs';
import nodePath from 'node:path';

export interface FileData {
    buffer: Buffer;
    fileName: string;
    currentChunk: number;
    totalChunks: number;
}

export interface ChunkUploadOptions {
    /**
     * Path to save file
     */
    path: string;
    /**
     * Max chunk size in bytes
     */
    maxChunkSize: number;
    /**
     * Max file size in bytes
     */
    maxFileSize?: number;
}

export interface ChunkUploadResult {
    statusCode: ChunkUploadStatusCode;
    uploadCompleted?: true;
    currentChunk?: number;
}

export enum ChunkUploadStatusCode {
    Success = 200,
    FileTooLarge = 413,
    ChunkTooLarge = 413,
    InvalidChunk = 400,
}

export async function ChunkUpload(
    file: FileData,
    options: ChunkUploadOptions,
): Promise<ChunkUploadResult> {
    const { buffer, fileName, currentChunk, totalChunks } = file;
    const { path, maxChunkSize, maxFileSize } = options;

    if (
        typeof currentChunk !== 'number' ||
        typeof totalChunks !== 'number' ||
        currentChunk < 1 ||
        totalChunks < 1 ||
        currentChunk > totalChunks
    ) {
        return { statusCode: ChunkUploadStatusCode.InvalidChunk };
    }

    if (buffer.length > maxChunkSize) {
        return { statusCode: ChunkUploadStatusCode.ChunkTooLarge };
    }

    const filePath = nodePath.join(path, fileName);
    const chunkPath = nodePath.join(path, `${fileName}.tmp`);

    fs.mkdirSync(path, { recursive: true });

    if (currentChunk === totalChunks) {
        if (fs.existsSync(chunkPath)) {
            fs.appendFileSync(chunkPath, buffer);
            fs.renameSync(chunkPath, filePath);
        } else {
            fs.writeFileSync(filePath, buffer);
        }

        const fileSize = fs.statSync(filePath).size;

        if (typeof maxFileSize === 'number' && fileSize > maxFileSize) {
            fs.unlinkSync(filePath);
            return { statusCode: ChunkUploadStatusCode.FileTooLarge };
        }

        return { statusCode: ChunkUploadStatusCode.Success, uploadCompleted: true };
    } else if (currentChunk === 1) {
        fs.writeFileSync(chunkPath, buffer);
    } else {
        fs.appendFileSync(chunkPath, buffer);
    }

    return { statusCode: ChunkUploadStatusCode.Success, currentChunk };
}
