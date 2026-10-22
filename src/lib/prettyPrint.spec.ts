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
  ])("%j", (expression) => {
    expect(roundTrip(expression)).toEqual(parse(expression));
  });

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
