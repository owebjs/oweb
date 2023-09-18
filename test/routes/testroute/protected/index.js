import { JwtAuth } from '../../../../dist/helpers/JwtAuth.js';
import { register } from '../../../../dist/helpers/PluginRegistrar.js';

export default class extends register(
    JwtAuth({
        secret: 'Your JWT secret',
        onError: (req, res) => {
            res.send(
                "JWT validation failed. Maybe you didn't provide an authorization header in your request or didn't properly set a JWT secret.",
            );
        },
    }),
) {
    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    constructor(req, res) {
        super(req, res); //we need to use this when we are using plugins.
    }

    /**
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} res
     */
    async handle(req, res) {
        console.log(
            'Hello from routes > testroute > subroute > index.js. As you may noticed the _hooks.js inside testroute directory and the routes directory will also take effect in this subroute.',
        );

        console.log('jwt result:', this.jwtResult); //jwtResult property won't be undefined if auth is successful.

        res.send('JWT validation successful.');
    }
}
