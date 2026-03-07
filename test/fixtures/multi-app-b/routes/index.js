import { Route } from '../../../../dist/index.js';

export default class extends Route {
    handle(req, res) {
        res.send({ app: 'b', ok: true });
    }
}
