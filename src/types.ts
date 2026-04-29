export type Awaitable<T> = T | Promise<T>;

declare module 'fastify' {
    interface FastifyRequest {
        /**
         * Aborts when the underlying client connection is closed.
         * Useful for cancelling SSE generators, long-running work, and abortable awaits.
         */
        readonly signal: AbortSignal;
    }
}
