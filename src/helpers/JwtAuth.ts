import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

interface JwtAuthOptions {
    secret: string;
    required?: boolean;
    onError?: (req: FastifyRequest, res: FastifyReply) => void;
}

export const JwtAuth = ({ secret, required = true, onError }: JwtAuthOptions) => {
    return function (Base) {
        return class JWT extends Base {
            constructor(req: FastifyRequest, res: FastifyReply) {
                super();

                let token = req?.headers?.authorization;

                if (token) {
                    token = token.trim();
                    token = token.slice(Math.max(token.lastIndexOf(' '), 0));
                }

                if (secret && token?.length > 0) {
                    try {
                        this.jwtResult = jwt.verify(token, secret);
                    } catch {
                        if (onError) onError(req, res);
                    }
                }
            }
        };
    };
};
