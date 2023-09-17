import Oweb from "./src/index.js";

const app = new Oweb();

await app.loadRoutes({ routeDir: "routes" });
await app.listen({ port: 3000 });
