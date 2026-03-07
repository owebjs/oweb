import { Route } from 'owebjs';

export default class MethodCheckPostRoute extends Route {
    handle(req, res) {
        return res.status(201).send({
            method: req.method,
            body: req.body ?? null,
        });
    }
}