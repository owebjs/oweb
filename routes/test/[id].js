import { JwtAuth } from "../../src/helpers/JwtAuth.js";
import { register } from "../../src/helpers/PluginRegistrar.js";

export default class extends register(
  JwtAuth({
    jwtSecret: "testsecret",
    onError: (req, res) => {
      res.send("olmamis.");
    },
  })
) {
  constructor(req, res) {
    super(req, res);
    console.log(this.jwtResult);
    res.send("deneme");
  }
}
