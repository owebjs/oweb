import { Route } from 'owebjs';
import { getHmrMessage } from '../../hmr-message.js';

export default class HmrDependencyLiveRoute extends Route {
    handle() {
        return { message: getHmrMessage() };
    }
}
