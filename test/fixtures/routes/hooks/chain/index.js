import { Route } from 'owebjs';

export default class HookChainRoute extends Route {
    handle(req) {
        return {
            hookOrder: req.locals?.hookOrder ?? [],
        };
    }
}