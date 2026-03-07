import { setTimeout as delay } from 'node:timers/promises';
import { Route } from 'owebjs';

export default class SseRoute extends Route {
    async *handle(req, res) {
        if (req.query?.deny === '1') {
            return res.status(401).send({ code: 'error.unauthorized' });
        }

        yield 'event-1';
        await delay(20);

        yield { step: 2 };
        await delay(20);

        yield 3;
    }
}