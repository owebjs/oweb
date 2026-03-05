import { Hook } from 'owebjs';

export default class HookFailHook extends Hook {
    handle(_req, _res, done) {
        done(new Error('hook-failure'));
    }
}