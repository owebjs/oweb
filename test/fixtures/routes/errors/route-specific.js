import { Route } from 'owebjs';

export default class RouteSpecificErrorRoute extends Route {
    handle() {
        throw new Error('route-specific-error');
    }

    handleError(_req, res, err) {
        return res.status(409).send({
            source: 'route-handleError',
            message: err.message,
        });
    }
}