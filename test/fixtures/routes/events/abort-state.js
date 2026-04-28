import { Route } from 'owebjs';
import { resetSseAbortState, sseAbortState } from '../../sse-abort-state.js';

export default class AbortStateRoute extends Route {
    handle(req) {
        if (req.query?.reset === '1') {
            resetSseAbortState();
        }

        return { ...sseAbortState };
    }
}
