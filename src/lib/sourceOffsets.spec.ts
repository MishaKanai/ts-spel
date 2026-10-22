import { Ast } from "./Ast";
import { parse } from "./ParseToAst";
import sampleExpressions from "./sampleExpressions.testdata";

type Visit = { node: Ast; parent: Ast | null; isContinuation: boolean };

const children = (node: Ast): Ast[] => {
  const out: Ast[] = [];
  Object.values(node).forEach((v) => {
    if (Array.isArray(v)) {
      v.forEach((c) => c && out.push(c));
    } else if (v && typeof v === "object") {
      if ("type" in v) {
        out.push(v as Ast);
      } else {
        // InlineMap elements
        Object.values(v).forEach((c) => c && out.push(c as Ast));
      }
    }
  });
  return out;
};

const walk = (root: Ast): Visit[] => {
  const visits: Visit[] = [];
  const go = (node: Ast, parent: Ast | null, isContinuation: boolean) => {
    visits.push({ node, parent, isContinuation });
    children(node).forEach((child, i) =>
      go(child, node, node.type === "CompoundExpression" && i > 0)
    );
  };
  go(root, null, false);
  return visits;
};

describe("source offsets", () => {
  describe.each(sampleExpressions)("%j", (expression) => {
    const ast = parse(expression);
    const visits = walk(ast);

    it("gives every node a whitespace-trimmed range inside its parent", () => {
      visits.forEach(({ node, parent }) => {
        expect(typeof node.start).toBe("number");
        expect(typeof node.end).toBe("number");
        const text = expression.slice(node.start, node.end);
        expect(text).toBe(text.trim());
        expect(text.length).toBeGreaterThan(0);
        if (parent) {
          expect(node.start).toBeGreaterThanOrEqual(parent.start!);
          expect(node.end).toBeLessThanOrEqual(parent.end!);
        }
      });
    });

    it("slices to text that re-parses to the node", () => {
      visits.forEach(({ node, isContinuation }) => {
        const text = expression.slice(node.start, node.end);
        if (isContinuation) {
          const reparsed = parse("x" + text);
          expect(reparsed.type).toBe("CompoundExpression");
          expect(
            (reparsed as Ast & { type: "CompoundExpression" })
              .expressionComponents
          ).toEqual([
            {
              type: "PropertyReference",
              propertyName: "x",
              nullSafeNavigation: false,
            },
            node,
          ]);
        } else {
          expect(parse(text)).toEqual(node);
        }
      });
    });
  });

  it("excludes the node's own parentheses but not its children's", () => {
    const expression = " ( a + b ) * c ";
    const ast = parse(expression) as Ast & { type: "OpMultiply" };
    expect(expression.slice(ast.start, ast.end)).toBe("( a + b ) * c");
    expect(expression.slice(ast.left.start, ast.left.end)).toBe("a + b");
  });

  it("includes navigation syntax on compound continuations", () => {
    const expression = "a?.b['k'].![x]";
    const ast = parse(expression) as Ast & { type: "CompoundExpression" };
    expect(
      ast.expressionComponents.map((c) => expression.slice(c.start, c.end))
    ).toEqual(["a", "?.b", "['k']", ".![x]"]);
  });

  it("keeps offsets out of enumerable keys", () => {
    const ast = parse("a + 1");
    expect(Object.keys(ast)).not.toContain("start");
    expect(JSON.stringify(ast)).not.toContain("start");
  });
});
