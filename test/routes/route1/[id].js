import { JwtAuth } from '../../../dist/helpers/JwtAuth.js';
import { register } from '../../../dist/helpers/PluginRegistrar.js';

export default class extends register(
    JwtAuth({
        secret: '',
        onError: (req, res) => {
            res.send('olmamis.');
        },
    }),
) {
    constructor(req, res, app) {
        super(req, res, app);
        res.send('deneme');
    }
}
