import { AssignRoutes } from "./utils/AssignRoutes.js";
import Fastify from "fastify";

const app = Fastify();

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
    return AssignRoutes(routeDir, app);
  }
}
