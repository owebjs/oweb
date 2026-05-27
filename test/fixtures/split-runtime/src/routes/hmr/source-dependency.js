import { Route } from 'owebjs';
import { getSplitMessage } from '@split/split-message';

export default class SourceDependencyRoute extends Route {
    handle() {
        return { message: getSplitMessage() };
    }
}
