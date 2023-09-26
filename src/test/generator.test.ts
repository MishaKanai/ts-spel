import { parse } from "../lib/ParseToAst";
import prettyPrint from "../lib/prettyPrint";
import gen from "./generator";
describe("Generator test", () => {
  for (let i = 0; i < 1000; i++) {
    const ast = gen(25);
    const printed = prettyPrint(ast);
    it(printed, () => {
      const compiled2 = parse(printed);
      const printed2 = prettyPrint(compiled2);
      expect(printed).toBe(printed2);
    });
  }
});
