import { Route } from 'owebjs';

export default class HelloRoute extends Route {
    handle() {
        return { message: 'hello-world' };
    }
}