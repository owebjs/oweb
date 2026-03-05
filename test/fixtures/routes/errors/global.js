import { Route } from 'owebjs';

export default class GlobalErrorRoute extends Route {
    handle() {
        throw new Error('global-route-error');
    }
}