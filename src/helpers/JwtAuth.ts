import type { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

interface JwtAuthOptions {
    secret: string;
    onError?: (req: FastifyRequest, res: FastifyReply, app: FastifyInstance) => void;
}

export const JwtAuth = ({ secret, onError }: JwtAuthOptions) => {
    return function (Base) {
        return class JWT extends Base {
            constructor(req: FastifyRequest, res: FastifyReply, app: FastifyInstance) {
                super();

                let token = req?.headers?.authorization;

                if (token) {
                    token = token.trim();
                    token = token.slice(Math.max(token.lastIndexOf(' '), 0));
                }

                if (secret) {
                    try {
                        this.jwtResult = jwt.verify(token, secret);
                    } catch {
                        if (onError) onError(req, res, app);
                    }
                } else {
                    throw new Error('JWT Secret not provided!');
                }
            }
        };
    };
};
