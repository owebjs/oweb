import { setTimeout as delay } from 'node:timers/promises';
import { Route } from 'owebjs';
import { sseAbortState } from '../../sse-abort-state.js';

export default class SignalRoute extends Route {
    async *handle(req) {
        const onAbort = () => {
            sseAbortState.signal++;
        };

        req.signal.addEventListener('abort', onAbort, { once: true });

        try {
            yield 'signal-listening';
            await delay(10_000, undefined, { signal: req.signal });
        } catch (err) {
            if (!req.signal.aborted) throw err;
        } finally {
            req.signal.removeEventListener('abort', onAbort);
        }
    }
}
