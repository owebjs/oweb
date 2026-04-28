import { setTimeout as delay } from 'node:timers/promises';
import { Route } from 'owebjs';
import { sseAbortState } from '../../sse-abort-state.js';

export default class AbortListenerRoute extends Route {
    async *handle(_req, res) {
        const onAborted = () => {
            sseAbortState.aborted++;
        };
        const onClose = () => {
            sseAbortState.close++;
        };

        res.raw.on?.('aborted', onAborted);
        res.raw.on?.('close', onClose);

        try {
            yield 'listening';
            await delay(10_000);
        } finally {
            res.raw.off?.('aborted', onAborted);
            res.raw.off?.('close', onClose);
        }
    }
}
