import Fastify, { FastifyInstance as _FastifyInstance } from 'fastify';
import { assignRoutes } from './utils/assignRoutes';

const app = Fastify();

interface FastifyInstance extends _FastifyInstance {}

class FastifyInstance {
    constructor() {
        Object.assign(this, app);
    }
}

export default class Oweb extends FastifyInstance {
    constructor() {
        super();
    }

    loadRoutes({ routeDir }) {
        return assignRoutes(routeDir, app);
    }
}
