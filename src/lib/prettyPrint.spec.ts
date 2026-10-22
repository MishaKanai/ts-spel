import { getEvaluator } from "./Evaluate";
import { parse } from "./ParseToAst";
import prettyPrint from "./prettyPrint";
import sampleExpressions from "./sampleExpressions.testdata";

const roundTrip = (expression: string) => parse(prettyPrint(parse(expression)));

describe("prettyPrint round-trips", () => {
  it.each([
    ...sampleExpressions,
    // each of these printed text that re-parsed differently before 1.0.58
    '\'a""b"c\'',
    "'one\ntwo'",
    "'one\n\"two\"'",
    "{'a-b': 1}",
    '{\'a b\': 1, "q""q": 2}',
    "{:}",
    "(a + b).c",
    "(a ?: b).c()",
    "(-a).b",
    "m?['k']",
    "a?.b?['k'].c",
    "(a.b).c",
    "(a?.b).c",
    "(a.b)['k']",
    "{'': 1}",
    "0.0000001",
    "1000000000000000000000",
  ])("%j", (expression) => {
    expect(roundTrip(expression)).toEqual(parse(expression));
  });

  it("keeps a parenthesized null-safe chain's meaning", () => {
    const expression = "(a?.b).c";
    const evaluate = (ast: ReturnType<typeof parse>) =>
      getEvaluator({ a: null }, {})(ast);
    expect(() => evaluate(parse(expression))).toThrow(
      'Cannot chain property "c" off of null'
    );
    expect(() => evaluate(parse(prettyPrint(parse(expression))))).toThrow(
      'Cannot chain property "c" off of null'
    );
  });

  it.each(["0.0000001", "1000000000000000000000", "123456789012345678901234"])(
    "prints %s in plain decimal",
    (expression) => {
      const printed = prettyPrint(parse(expression));
      expect(printed).toMatch(/^\d+(\.\d+)?$/);
      expect(parse(printed)).toEqual(parse(expression));
    }
  );

  it("keeps the existing output style", () => {
    expect(prettyPrint(parse("a+b*(c+d)"))).toBe("a + b * (c + d)");
    expect(prettyPrint(parse("a+b+c"))).toBe("(a + b) + c");
    expect(prettyPrint(parse("x?.y.z(1,'s')"))).toBe('x?.y.z(1, "s")');
    expect(prettyPrint(parse("{a:1,'b c':2}"))).toBe('{a: 1,\n"b c": 2}');
    expect(prettyPrint(parse("'it''s'"))).toBe('"it\'s"');
  });

  it("prints multi-line strings as ordinary literals", () => {
    expect(prettyPrint(parse("'say \"hi\"\nbye'"))).toBe('"say ""hi""\nbye"');
  });
});
