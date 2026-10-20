import { ForbiddenAccessError } from "./CustomErrors";
import { EvalOptions, getEvaluator } from "./Evaluate";
import { parse } from "./ParseToAst";

describe("Evaluation", () => {
  it("Can evaluate properties", () => {
    const r = parse("foo");
    expect(getEvaluator({ foo: false }, {})(r)).toBe(false);
  });
  it("Can chain operators of equal precedence", () => {
    expect(getEvaluator({}, {})(parse("2 * 2 * 2 * 2"))).toBe(16);
  });
  it("should evaluate multiplication with higher precedence", () => {
    expect(getEvaluator({}, {})(parse("1+2*3"))).toBe(7);
  });
  it("should evaluate sequence of operations", () => {
    expect(getEvaluator({}, {})(parse("2*3*5"))).toBe(30);
  });
  it("should evaluate parenthesis", () => {
    expect(getEvaluator({}, {})(parse("(5+8)/13"))).toBe(1);
  });
  it("should evaluate fully parenthesized", () => {
    expect(getEvaluator({}, {})(parse("(5-(2*3))"))).toBe(-1);
  });
  it("should evaluate exponentiation", () => {
    expect(getEvaluator({}, {})(parse("2*2^8"))).toBe(512);
  });
  it("should evaluate negation", () => {
    expect(getEvaluator({}, {})(parse("2^-(2*-2)+-5"))).toBe(11);
  });
  it("Can index into arrays", () => {
    const r = parse("{1, 2, {3, 4}}[2][0]");
    expect(getEvaluator({}, {})(r)).toBe(3);
  });
  it("Safe-navigate index (not null)", () => {
    const r = parse("{1, 2, 3}?[2]");
    expect(getEvaluator({}, {})(r)).toBe(3);
  });
  it("Safe-navigate index (null)", () => {
    const r = parse("null?[2]");
    expect(getEvaluator({}, {})(r)).toBe(null);
  });
  it("can evaluate negative number literals", () => {
    const r = parse("-1");
    expect(getEvaluator({}, {})(r)).toBe(-1);
  });
  it("can evaluate an inline list", () => {
    const r = parse("{1, 2, 3}");
    expect(getEvaluator({}, {})(r)).toEqual([1, 2, 3]);
  });
  it("can evaluate elvis", () => {
    const r1 = parse("1 ?: 2");
    expect(getEvaluator({}, {})(r1)).toBe(1);
    const r2 = parse("null ?: 2");
    expect(getEvaluator({}, {})(r2)).toBe(2);
  });
  it("can evaluate SelectionAll: get evens", () => {
    const r1 = parse("{1, 2, 3, 4, 5}.?[#this % 2 == 0]");
    expect(getEvaluator({}, {})(r1)).toEqual([2, 4]);
  });
  it("Safe nav SelectionAll (not null)", () => {
    const r1 = parse("{1, 2, 3, 4, 5}?.?[#this % 2 == 0]");
    expect(getEvaluator({}, {})(r1)).toEqual([2, 4]);
  });
  it("Safe nav SelectionAll (null)", () => {
    const r1 = parse("null?.?[#this % 2 == 0]");
    expect(getEvaluator({}, {})(r1)).toBe(null);
  });
  it("Can evaluate SelectionLast: get even", () => {
    const r1 = parse("{1, 2, 3, 4, 5}.$[#this % 2 == 0]");
    expect(getEvaluator({}, {})(r1)).toBe(4);
  });
  it("Safe-navigate SelectionLast (not null)", () => {
    const r1 = parse("{1, 2, 3, 4, 5}?.$[#this % 2 == 0]");
    expect(getEvaluator({}, {})(r1)).toBe(4);
  });
  it("Safe-navigation SelectionFirst", () => {
    const r1 = parse("null?.^[#this % 2 == 0]");
    expect(getEvaluator({}, {})(r1)).toBe(null);
  });
  it("Can evaluate Projection: * 2", () => {
    const r1 = parse("{1, 2, 3, 4, 5}.![#this * 2]");
    expect(getEvaluator({}, {})(r1)).toEqual([2, 4, 6, 8, 10]);
  });
  it("Safe-navigate Projection", () => {
    const r1 = parse("{1, 2, 3, 4, 5}?.![#this * 2]");
    expect(getEvaluator({}, {})(r1)).toEqual([2, 4, 6, 8, 10]);
  });
  it("Safe-navigate Projection (null)", () => {
    const r1 = parse("getNull()?.![#this * 2]");
    expect(getEvaluator({ getNull: () => null }, {})(r1)).toBe(null);
  });
  it("can evaluate a method with variable arguments", () => {
    expect(
      getEvaluator(
        { fn: (...args) => args.reduce((prev, curr) => prev + curr, 0) },
        {}
      )(parse("fn(1, 2, 3)"))
    ).toBe(6);
  });

  it("foo.bar.baz != null ? foo.bar.baz : null", () => {
    expect(
      getEvaluator(
        {
          foo: {
            bar: {
              baz: null,
            },
          },
        },
        {}
      )(parse("foo.bar.baz != null ? foo.bar.baz : null"))
    ).toBe(null);
  });

  it(">=", () => {
    expect(getEvaluator({}, {})(parse("5 >= 5"))).toBe(true);
    expect(getEvaluator({}, {})(parse("4 >= 5"))).toBe(false);
  });
  it("number comparison works with nulls and undefined", () => {
    expect(getEvaluator({}, {})(parse("null >= 5"))).toBe(false);
    expect(getEvaluator({}, {})(parse("4 >= null"))).toBe(true);
    expect(
      getEvaluator(
        {
          getUndef: () => undefined,
        },
        {}
      )(parse("4 >= getUndef()"))
    ).toBe(true);
    expect(
      getEvaluator(
        {
          getUndef: () => undefined,
        },
        {}
      )(parse("4 < getUndef()"))
    ).toBe(false);
    expect(
      getEvaluator(
        {
          getUndef: () => undefined,
        },
        {}
      )(parse("4 == getUndef()"))
    ).toBe(false);
  });
  it("Can evaluate functions and variables", () => {
    const evaluate = getEvaluator(
      {
        foo: () => "fromLocals",
        var: "fromLocals",
      },
      {
        foo: () => "fromGlobals",
        var: "fromGlobals",
      }
    );
    expect(evaluate(parse("#foo()"))).toBe("fromGlobals");
    expect(evaluate(parse("foo()"))).toBe("fromLocals");
    expect(evaluate(parse("#var"))).toBe("fromGlobals");
    expect(evaluate(parse("var"))).toBe("fromLocals");
  });
  it("Null behavior with boolean operators", () => {
    expect(
      getEvaluator({}, {}, { disableBoolOpChecks: true })(parse("!null"))
    ).toBe(true);
    expect(
      getEvaluator({}, {}, { disableBoolOpChecks: true })(parse("null || true"))
    ).toBe(true);
    expect(
      getEvaluator({}, {}, { disableBoolOpChecks: true })(parse("null && true"))
    ).toBe(false);
    expect(
      getEvaluator({}, {}, { disableBoolOpChecks: true })(parse("true && null"))
    ).toBe(false);
    expect(
      getEvaluator(
        {},
        {},
        { disableBoolOpChecks: true }
      )(parse("!!(true && null)"))
    ).toBe(false);
  });
  it("Boolean operators short circuit: &&", () => {
    expect(
      getEvaluator(
        {
          foo: false,
        },
        {}
      )(parse("foo && foo()"))
    ).toBe(false);
  });

  it("Boolean operators AND", () => {
    expect(getEvaluator({}, {})(parse("true AND false"))).toBe(false);
    expect(getEvaluator({}, {})(parse("false AND true"))).toBe(false);
    expect(getEvaluator({}, {})(parse("true AND true"))).toBe(true);
    expect(getEvaluator({}, {})(parse("TRUE AND TRUE"))).toBe(true);
  });

  it("Boolean operators OR", () => {
    expect(getEvaluator({}, {})(parse("false OR false"))).toBe(false);
    expect(getEvaluator({}, {})(parse("true OR false"))).toBe(true);
    expect(getEvaluator({}, {})(parse("false or true"))).toBe(true);
    expect(getEvaluator({}, {})(parse("true Or true"))).toBe(true);
    expect(getEvaluator({}, {})(parse("TRUE OR TRUE"))).toBe(true);
  });

  it("Boolean operators short circuit: ||", () => {
    expect(
      getEvaluator(
        {
          foo: true,
        },
        {}
      )(parse("foo || foo()"))
    ).toBe(true);
  });
  it("Ternary function call", () => {
    expect(
      getEvaluator(
        {
          currentUserHasRole: () => false,
        },
        {}
      )(parse("currentUserHasRole('ROLE_SUPER') ? npe() : 'hello'"))
    ).toBe("hello");
    expect(
      getEvaluator(
        {
          currentUserHasRole: () => true,
        },
        {}
      )(parse("currentUserHasRole('ROLE_SUPER') ? 'hello' : npe()"))
    ).toBe("hello");
  });
  it("List literal context", () => {
    expect(getEvaluator({}, {})(parse(`{''}.![#this]`))).toEqual([""]);
  });
  it("string + string", () => {
    expect(getEvaluator({}, {})(parse(`'hi' + 'hi'`))).toBe("hihi");
  });
  it("number + number", () => {
    expect(getEvaluator({}, {})(parse(`1 + 1`))).toBe(2);
  });
  it("number + string", () => {
    expect(getEvaluator({}, {})(parse(`1 + 'hi'`))).toBe("1hi");
  });
  it("string + number", () => {
    expect(getEvaluator({}, {})(parse(`'hi' + '1'`))).toBe("hi1");
  });
  it("string + null", () => {
    expect(getEvaluator({}, {})(parse(`'hi' + null`))).toBe("hinull");
  });
  it("null + string", () => {
    expect(getEvaluator({}, {})(parse(`null + 'hi'`))).toBe("nullhi");
  });
  it("nested properties are traversed in the right order", () => {
    expect(
      getEvaluator(
        {
          a: {
            id: "1",
            b: {
              a: {
                id: "2",
              },
            },
          },
        },
        {}
      )(parse(`a.b.a.id`))
    ).toEqual("2");
  });
  it("Make .length() work on strings", () => {
    expect(getEvaluator({}, {})(parse(`"12345".length()`))).toEqual(5);
    expect(getEvaluator({}, {})(parse(`"12345".length`))).toEqual(5);
    expect(
      getEvaluator(
        {
          getStr: () => "1234",
        },
        {}
      )(parse(`getStr().length()`))
    ).toEqual(4);
  });
  it("example-4-8-23", () => {
    const exp = `record && record?.hasPossibleMatches == true && allowsMerge(getAccessLevelForEntity(viewConfig, resource))`;
    const ast = parse(exp);
    expect(
      getEvaluator(
        {
          record: {
            hasPossibleMatches: false,
          },
          allowsMerge: () => "1",
          getAccessLevelForEntity: () => "2",
        },
        {},
        {
          disableBoolOpChecks: true,
        }
      )(ast)
    ).toBe(false);
    expect(
      getEvaluator(
        {
          record: {
            hasPossibleMatches: true,
          },
          viewConfig: "3",
          resource: "4",
          allowsMerge: () => "1",
          getAccessLevelForEntity: () => "2",
        },
        {},
        {
          disableBoolOpChecks: true,
        }
      )(ast)
    ).toBe(true);
  });

  it("example-4-9-23 - tests method calls binding to the correct 'this'", () => {
    const exp = `#getConcept().group.split(',')`;
    const ast = parse(exp);
    expect(
      getEvaluator(
        {},
        {
          getConcept: () => ({
            group: "NONCOORD,PT,PTA,CAT1",
          }),
        },
        {
          disableBoolOpChecks: true,
        }
      )(ast)
    ).toEqual(["NONCOORD", "PT", "PTA", "CAT1"]);
  });

  it("'matches' operator", () => {
    const exp = `"firstName" matches "f.*"`;
    const ast = parse(exp);
    expect(getEvaluator({}, {})(ast)).toBe(true);
  });

  it("add 'matches' method to strings: true match", () => {
    const exp = `"firstName".matches("f.*")`;
    const ast = parse(exp);
    expect(getEvaluator({}, {})(ast)).toBe(true);
  });
  it("add 'matches' method to strings: non-full match (false in Java/Spel, but true in js). Match Java", () => {
    const exp = `"firstName".matches("f")`;
    const ast = parse(exp);
    expect(getEvaluator({}, {})(ast)).toBe(false);
  });
  it("add 'matches' method to strings: false match", () => {
    const exp = `"firstName".matches("v")`;
    const ast = parse(exp);
    expect(getEvaluator({}, {})(ast)).toBe(false);
  });
  it("ternary boolean checks", () => {
    const exp = `"truthy" ? "y" : "n"`;
    const ast = parse(exp);
    expect(() => getEvaluator({}, {})(ast)).toThrow();
    expect(getEvaluator({}, {}, { disableBoolOpChecks: true })(ast)).toBe("y");
  });

  it("Selection boolean checks", () => {
    const exp = `{1}.?["y"]`;
    const ast = parse(exp);
    expect(() => getEvaluator({}, {})(ast)).toThrow();
    expect(getEvaluator({}, {}, { disableBoolOpChecks: true })(ast)).toEqual([
      1,
    ]);
  });

  it("Resolve properties in scope", () => {
    const exp = `roles.![id][0] + ':' + id`;
    const ast = parse(exp);
    expect(
      getEvaluator(
        {
          roles: [
            {
              id: "innerId",
            },
          ],
          id: "outerId",
        },
        {}
      )(ast)
    ).toEqual("innerId:outerId");
  });
  it("Resolve chained properties correctly - NPE if not the right path", () => {
    const exp = `obj.outer`;
    const ast = parse(exp);
    expect(() =>
      getEvaluator(
        {
          obj: {},
          outer: "outer",
        },
        {}
      )(ast)
    ).toThrow();
  });
  it("NPE by default", () => {
    const exp = `foo`;
    const ast = parse(exp);
    expect(() => getEvaluator({}, {})(ast)).toThrow();
  });
  it("evaluate to null instead of NPE if 'disableNullPointerExceptions' set", () => {
    const exp = `foo`;
    const ast = parse(exp);
    expect(
      getEvaluator({}, {}, { disableNullPointerExceptions: true })(ast)
    ).toBeNull();
  });
  it("Return null when key not found in dict", () => {
    const exp = `{:}["mykey"]`;
    const ast = parse(exp);
    expect(getEvaluator({}, {})(ast)).toBeNull();
  });

  it("Fix this for method calls in compounds.", () => {
    const exp = `foo.identity(#this.a)`;
    const ast = parse(exp);
    expect(
      getEvaluator(
        {
          a: "outerA",
          foo: {
            a: "innerA",
            identity: (identity) => identity,
          },
        },
        {}
      )(ast)
    ).toEqual("outerA");
  });

  it("Fix this for method calls in compounds - make sure we use a stack to keep track multiple outer #this, so we don't lose them", () => {
    const exp = `
    foo.box({
      a: #this.a.transform(#this.value),
      b: {{ a: foo.a }}.![ #this.a.transform(#this.a.value)][0],
      c: #this.a.transform(#this.value),
    }).add("d",  #this.a.transform(#this.value))
    `;
    const ast = parse(exp);
    expect(
      getEvaluator(
        {
          value: 11,
          a: {
            value: 55,
            _id: "outer",
            transform: (value) => value * 2,
          },
          foo: {
            a: {
              value: 55,
              _id: "inner",
              transform: (value) => value + 0.5,
            },
            box: (value) => {
              let v = { ...value };
              return {
                add(key: string, _v) {
                  v[key] = _v;
                  return v;
                },
              };
            },
          },
        },
        {}
      )(ast)
    ).toEqual({ a: 22, b: 55.5, c: 22, d: 22 });
  });

  it("real example: Make sure properties inside of indexes are looked up properly from the outer scope (not the current compound chain)", () => {
    const ast = parse(`(
      investigation?.travel?.inStateItems != null &&
      investigation?.travel?.inStateItems.?[#this.departureDate != null]?.size() > 0 ?
          investigation?.travel?.inStateItems?.![
          #this.departureDate
          ][investigation?.travel?.inStateItems.size() - 1]
      : null
       
      )`);
    expect(
      getEvaluator(
        {
          investigation: {
            travel: {
              inStateItems: [
                {
                  departureDate: "2023-05-24",
                },
              ],
              investigation: "ac110003-8836-1ef1-8188-4b22eb5e315c",
            },
          },
        },
        {}
      )(ast)
    ).toEqual("2023-05-24");
  });
  it("null chaining off function return value", () => {
    const ast = parse(`foo()?.bar`);
    expect(
      getEvaluator(
        {
          foo: () => null,
        },
        {}
      )(ast)
    ).toEqual(null);
  });
  it("null-safe navigation short-circuits the entire compound expression", () => {
    // foo?.bar.baz — if foo is null, the whole expression should be null,
    // not throw because .baz tries to navigate off null.
    expect(getEvaluator({ foo: null }, {})(parse("foo?.bar.baz"))).toEqual(
      null
    );
    // deeper chain
    expect(getEvaluator({ foo: null }, {})(parse("foo?.bar.baz.qux"))).toEqual(
      null
    );
    // null-safe in the middle: foo.bar?.baz.qux — if bar is null, abort from there
    expect(
      getEvaluator({ foo: { bar: null } }, {})(parse("foo.bar?.baz.qux"))
    ).toEqual(null);
    // sanity: if foo is not null, regular chaining still works
    expect(
      getEvaluator({ foo: { bar: { baz: 42 } } }, {})(parse("foo?.bar.baz"))
    ).toEqual(42);
  });
  it("Should compare string values <", () => {
    const ast = parse(`"a" < "b"`);
    expect(getEvaluator({}, {})(ast)).toEqual(true);
  });
  it("Should compare string values <=", () => {
    const ast = parse(`"a" <= "b" && "a" <= "a"`);
    expect(getEvaluator({}, {})(ast)).toEqual(true);
  });
  it("Should compare string values >", () => {
    const ast = parse(`"b" > "a"`);
    expect(getEvaluator({}, {})(ast)).toEqual(true);
  });
  it("Should compare string values >=", () => {
    const ast = parse(`"b" >= "a" && "b" >= "b"`);
    expect(getEvaluator({}, {})(ast)).toEqual(true);
  });

  it("Should maintain correct context inside method calls inside projections", () => {
    const ast = parse(`list.![fn(foo)][0]`);
    expect(
      getEvaluator(
        {
          list: [
            {
              fn: (value) => value,
              foo: 1,
            },
          ],
        },
        {}
      )(ast)
    ).toEqual(1);
  });

  const comparators = [">", ">=", "==", "<", "<="];
  comparators.forEach((cmp) => {
    it("Should have string comparison", () => {
      const ast = parse(`left ${cmp} right`);
      expect(
        getEvaluator(
          {
            left: "foo",
            right: "foo",
          },
          {}
        )(ast)
      ).toEqual(cmp.includes("=") ? true : false);
    });
  });
});

it("Should fallback to functions for method calls if option specified", () => {
  const ast = parse(`foo()`);
  expect(() =>
    getEvaluator(
      {},
      { foo: () => "hi" },
      {
        // default (don't fallback),
      }
    )(ast)
  ).toThrow();
  expect(
    getEvaluator(
      {},
      { foo: () => "hi" },
      {
        fallbackToFunctions: true,
      }
    )(ast)
  ).toEqual("hi");
});

it("Should fallback to variables for missing properties if option specified", () => {
  const ast = parse(`foo`);
  expect(() =>
    getEvaluator(
      {},
      { foo: "hi" },
      {
        // default (don't fallback),
      }
    )(ast)
  ).toThrow();
  expect(
    getEvaluator(
      {},
      { foo: "hi" },
      {
        fallbackToVariables: true,
      }
    )(ast)
  ).toEqual("hi");
  expect(() =>
    getEvaluator(
      { foo: null },
      { bar: 1 },
      {
        fallbackToVariables: true,
      }
    )(parse(`foo.bar`))
  ).toThrow();
  expect(
    getEvaluator(
      { foo: null },
      { bar: 1 },
      {
        fallbackToVariables: true,
      }
    )(parse(`foo?.bar`))
  ).toEqual(null);

  expect(
    getEvaluator(
      { foo: {} },
      { bar: 1 },
      {
        fallbackToVariables: true,
      }
    )(parse(`foo?.bar`))
  ).toEqual(null);
  expect(
    getEvaluator(
      { foo: {} },
      { bar: 1 },
      {
        fallbackToVariables: true,
      }
    )(parse(`bar`))
  ).toEqual(1);
});

it("Should accept an array of fallback function contexts", () => {
  expect(getEvaluator({}, [{ a: 1 }, { b: 2 }], {})(parse(`#a + #b`))).toEqual(
    3
  );
  expect(
    getEvaluator({}, [{}, { foo: null }, { foo: 1 }], {})(parse(`#foo`))
  ).toEqual(null);
  expect(
    getEvaluator({}, [{}, {}, { foo: () => "hi" }], {
      fallbackToFunctions: true,
    })(parse(`foo()`))
  ).toEqual("hi");
  expect(
    getEvaluator({}, [{}, {}, { foo: () => "hi" }], {
      fallbackToFunctions: true,
    })(parse(`foo()`))
  ).toEqual("hi");
});

it("Should handle projection of dictionaries correctly.", () => {
  expect(getEvaluator({}, {})(parse(`{a: 1, b: 2}.![#this.key]`))).toEqual([
    "a",
    "b",
  ]);
  expect(getEvaluator({}, {})(parse(`{a: 1, b: 2}.![#this.value]`))).toEqual([
    1, 2,
  ]);
});

describe("Java-style collection/string method shims", () => {
  describe("isEmpty()", () => {
    it("returns true for an empty inline list", () => {
      expect(getEvaluator({}, {})(parse("{}.isEmpty()"))).toBe(true);
    });
    it("returns false for a non-empty inline list", () => {
      expect(getEvaluator({}, {})(parse("{1}.isEmpty()"))).toBe(false);
    });
    it("returns true for an empty string", () => {
      expect(getEvaluator({}, {})(parse("''.isEmpty()"))).toBe(true);
    });
    it("returns false for a non-empty string", () => {
      expect(getEvaluator({}, {})(parse("'hi'.isEmpty()"))).toBe(false);
    });
    it("returns false for a whitespace-only string (matches Java semantics — use isBlank for whitespace)", () => {
      expect(getEvaluator({}, {})(parse("'  '.isEmpty()"))).toBe(false);
    });
  });

  describe("isBlank()", () => {
    it("returns true for an empty string", () => {
      expect(getEvaluator({}, {})(parse("''.isBlank()"))).toBe(true);
    });
    it("returns true for a whitespace-only string", () => {
      expect(getEvaluator({}, {})(parse("'   '.isBlank()"))).toBe(true);
    });
    it("returns true for a string of mixed whitespace types", () => {
      expect(getEvaluator({}, {})(parse("' \t\n'.isBlank()"))).toBe(true);
    });
    it("returns false for a non-blank string", () => {
      expect(getEvaluator({}, {})(parse("'hi'.isBlank()"))).toBe(false);
    });
    it("returns false for a string with whitespace around content", () => {
      expect(getEvaluator({}, {})(parse("' hi '.isBlank()"))).toBe(false);
    });
  });

  it("isEmpty() composes with negation as the common idiom", () => {
    expect(getEvaluator({}, {})(parse("!{1, 2}.isEmpty()"))).toBe(true);
    expect(getEvaluator({}, {})(parse("!{}.isEmpty()"))).toBe(false);
  });
});

describe("prototype access", () => {
  const evaluate = (
    expression: string,
    context: Record<string, unknown> = {},
    functionsAndVariables: Record<string, unknown> = {},
    options?: EvalOptions
  ) => getEvaluator(context, functionsAndVariables, options)(parse(expression));

  const FORBIDDEN = [
    "constructor",
    "__proto__",
    "prototype",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
  ];

  describe.each(FORBIDDEN)("%s", (name) => {
    it("is refused as a property", () => {
      expect(() => evaluate(`'a'.${name}`)).toThrow(ForbiddenAccessError);
      expect(() => evaluate(`#this.${name}`)).toThrow(ForbiddenAccessError);
    });
    it("is refused as a method name", () => {
      expect(() => evaluate(`'a'.${name}()`)).toThrow(ForbiddenAccessError);
    });
    it("is refused as a bare identifier", () => {
      expect(() => evaluate(name)).toThrow(ForbiddenAccessError);
      expect(() => evaluate(`#${name}`)).toThrow(ForbiddenAccessError);
      expect(() => evaluate(`#${name}()`)).toThrow(ForbiddenAccessError);
    });
    it("is refused as a string index", () => {
      expect(() => evaluate(`obj['${name}']`, { obj: {} })).toThrow(
        ForbiddenAccessError
      );
      expect(() => evaluate(`obj[key]`, { obj: {}, key: name })).toThrow(
        ForbiddenAccessError
      );
    });
    it("is refused under null-safe navigation", () => {
      expect(() => evaluate(`'a'?.${name}`)).toThrow(ForbiddenAccessError);
      expect(() => evaluate(`'a'?.${name}()`)).toThrow(ForbiddenAccessError);
      expect(() => evaluate(`x?.${name}`, { x: null })).toThrow(
        ForbiddenAccessError
      );
    });
    it("is refused when supplied as an own key", () => {
      const own = JSON.parse(`{"${name}": 1}`);
      expect(() => evaluate(name, own)).toThrow(ForbiddenAccessError);
      expect(() => evaluate(`obj.${name}`, { obj: own })).toThrow(
        ForbiddenAccessError
      );
      expect(() => evaluate(`obj['${name}']`, { obj: own })).toThrow(
        ForbiddenAccessError
      );
      expect(() => evaluate(`#${name}`, {}, own)).toThrow(ForbiddenAccessError);
      expect(() =>
        evaluate(`obj.${name}`, { obj: {} }, own, { fallbackToVariables: true })
      ).toThrow(ForbiddenAccessError);
    });
  });

  it("refuses a forbidden function name in functionsAndVariables, including the fallbacks", () => {
    const constructor = jest.fn();
    const funcs = { constructor };
    expect(() => evaluate("#constructor()", {}, funcs)).toThrow(
      ForbiddenAccessError
    );
    expect(() =>
      evaluate("constructor()", {}, funcs, { fallbackToFunctions: true })
    ).toThrow(ForbiddenAccessError);
    expect(constructor).not.toHaveBeenCalled();
  });

  describe("Function constructor guard", () => {
    // Built from source text because ts-jest compiles this file to ES5, which turns
    // async and generator literals into plain functions. Function (not vm) keeps
    // them in Jest's realm, where the evaluator's Function lives.
    const AsyncFunction = Function(
      "return (async function () {}).constructor"
    )();
    const GeneratorFunction = Function(
      "return (function* () {}).constructor"
    )();
    const AsyncGeneratorFunction = Function(
      "return (async function* () {}).constructor"
    )();
    const constructors: Array<[string, unknown]> = [
      ["Function", Function],
      ["AsyncFunction", AsyncFunction],
      ["GeneratorFunction", GeneratorFunction],
      ["AsyncGeneratorFunction", AsyncGeneratorFunction],
    ];

    it.each(constructors)("refuses %s via FunctionReference", (_, F) => {
      expect(() => evaluate("#F('')", {}, { F })).toThrow(ForbiddenAccessError);
    });
    it.each(constructors)("refuses %s via MethodReference", (_, F) => {
      expect(() => evaluate("host.make('')", { host: { make: F } })).toThrow(
        ForbiddenAccessError
      );
      expect(() =>
        evaluate("make('')", {}, { make: F }, { fallbackToFunctions: true })
      ).toThrow(ForbiddenAccessError);
    });
    it.each(constructors)(
      "refuses %s as the receiver of call/apply/bind",
      (_, F) => {
        expect(() => evaluate("F.call(null, '')", { F })).toThrow(
          ForbiddenAccessError
        );
        expect(() => evaluate("F.apply(null, {''})", { F })).toThrow(
          ForbiddenAccessError
        );
        expect(() => evaluate("F.bind(null)", { F })).toThrow(
          ForbiddenAccessError
        );
      }
    );
    it("still calls ordinary host functions", () => {
      expect(evaluate("#double(2)", {}, { double: (x: number) => x * 2 })).toBe(
        4
      );
      expect(
        evaluate("host.greet('a')", {
          host: { greet: (s: string) => "hi " + s },
        })
      ).toBe("hi a");
      expect(
        evaluate("greet.call(null, 'a')", { greet: (s: string) => "hi " + s })
      ).toBe("hi a");
    });
  });

  describe("regressions", () => {
    it("keeps inherited string and array members", () => {
      expect(evaluate("'abc'.toUpperCase()")).toBe("ABC");
      expect(evaluate("'abc'.substring(1)")).toBe("bc");
      expect(evaluate("'abc'.length")).toBe(3);
      expect(evaluate("'abc'.length()")).toBe(3);
      expect(evaluate("{1, 2, 3}.length")).toBe(3);
      expect(evaluate("{1, 2, 3}.size()")).toBe(3);
    });
    it("keeps isEmpty() and isBlank()", () => {
      expect(evaluate("''.isEmpty()")).toBe(true);
      expect(evaluate("{}.isEmpty()")).toBe(true);
      expect(evaluate("' '.isBlank()")).toBe(true);
    });
    it("resolves own data properties with ordinary names", () => {
      const obj = { name: "n", value: 1, key: "k", constructorName: "c" };
      expect(evaluate("obj.name", { obj })).toBe("n");
      expect(evaluate("obj['value']", { obj })).toBe(1);
      expect(evaluate("obj?.key", { obj })).toBe("k");
      expect(evaluate("constructorName", obj)).toBe("c");
      expect(evaluate("{a: 1}.![key + value]")).toEqual(["a1"]);
    });
    it("keeps null-safe short-circuiting for allowed names", () => {
      expect(evaluate("x?.y.z", { x: null })).toBe(null);
      expect(evaluate("x?.foo()", { x: null })).toBe(null);
    });
  });
});
