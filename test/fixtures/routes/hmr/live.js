import { Route } from 'owebjs';

export default class HmrLiveRoute extends Route {
    handle(req, res) {
        return res.send({ version: 'v1' });
    }
}
