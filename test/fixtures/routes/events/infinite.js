import { setTimeout as delay } from 'node:timers/promises';
import { Route } from 'owebjs';

export default class InfiniteSseRoute extends Route {
    async *handle() {
        let i = 0;

        while (true) {
            yield `tick-${i++}`;
            await delay(10);
        }
    }
}
