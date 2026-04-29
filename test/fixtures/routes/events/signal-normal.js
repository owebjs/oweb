import { Route } from 'owebjs';
import { sseAbortState } from '../../sse-abort-state.js';

export default class SignalNormalRoute extends Route {
    handle(req) {
        req.signal.addEventListener(
            'abort',
            () => {
                sseAbortState.signal++;
            },
            { once: true },
        );

        return { aborted: req.signal.aborted };
    }
}
