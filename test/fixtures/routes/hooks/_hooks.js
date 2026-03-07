import { Hook } from 'owebjs';

export default class HooksScopeHook extends Hook {
    handle(req, _res, done) {
        req.locals ??= {};
        req.locals.hookOrder ??= [];

        setTimeout(() => {
            req.locals.hookOrder.push('hooks');
            done();
        }, 5);
    }
}