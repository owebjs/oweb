import { Hook } from 'owebjs';

export default class RootHook extends Hook {
    handle(req, _res, done) {
        req.locals ??= {};
        req.locals.hookOrder ??= [];
        req.locals.hookOrder.push('root');
        done();
    }
}