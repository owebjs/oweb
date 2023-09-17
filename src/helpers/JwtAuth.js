import jwt from "jsonwebtoken";

export function JwtAuth({ jwtSecret, onError }) {
  return function (Base) {
    return class JWT extends Base {
      constructor(req, res) {
        super();

        let token = req?.headers?.authorization;

        if (token) {
          token = token.trim();
          token = token.slice(Math.max(token.lastIndexOf(" "), 0));
        }

        if (jwtSecret && token?.length > 0) {
          try {
            this.jwtResult = jwt.verify(token, jwtSecret);
          } catch {
            if (onError) onError(req, res);
          }
        }
      }
    };
  };
}
