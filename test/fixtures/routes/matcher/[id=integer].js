import { Route } from 'owebjs';

export default class MatcherRoute extends Route {
    handle(req) {
        return {
            id: Number(req.params.id),
            valid: true,
        };
    }
}