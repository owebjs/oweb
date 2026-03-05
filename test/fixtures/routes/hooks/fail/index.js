import { Route } from 'owebjs';

export default class HookFailRoute extends Route {
    handle() {
        return {
            reached: true,
        };
    }
}