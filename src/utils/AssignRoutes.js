import { generateRoutes, walkTree } from "./RecursiveFS.js";

export async function AssignRoutes(routeDir, fastifyInstance) {
  const files = walkTree(routeDir);

  const routes = await generateRoutes(files);

  for (const route of routes) {
    fastifyInstance[route.method](route.url, function () {
      new route.fn(...arguments);
    });
  }
}
