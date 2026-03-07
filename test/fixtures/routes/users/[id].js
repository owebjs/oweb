import { Route } from 'owebjs';

export default class UserRoute extends Route {
    handle(req) {
        return { id: req.params.id };
    }
}