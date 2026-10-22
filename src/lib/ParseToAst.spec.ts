import { Ast } from "./Ast";
import { ParsingError } from "./CustomErrors";
import { parse } from "./ParseToAst";

it("should parse empty string", () => {
  expect(parse('""')).toEqual({
    type: "StringLiteral",
    value: "",
  });
});

it("should parse integer", () => {
  expect(parse("144")).toEqual({
    type: "NumberLiteral",
    value: 144,
  });
});

it("should parse float", () => {
  expect(parse("1.618")).toEqual({
    type: "NumberLiteral",
    value: 1.618,
  });
});
it("should parse negative integer", () => {
  expect(parse("-13")).toEqual({
    type: "Negative",
    value: {
      type: "NumberLiteral",
      value: 13,
    },
  });
});
it("should parse resulting zero", () => {
  expect(parse("14-13")).toEqual({
    type: "OpMinus",
    left: {
      type: "NumberLiteral",
      value: 14,
    },
    right: {
      type: "NumberLiteral",
      value: 13,
    },
  });
});

it("should parse with whitespace", () => {
  expect(parse("14 - 13")).toEqual({
    type: "OpMinus",
    left: {
      type: "NumberLiteral",
      value: 14,
    },
    right: {
      type: "NumberLiteral",
      value: 13,
    },
  });
});
it("should parse starting with zero", () => {
  expect(parse("0-5")).toEqual({
    type: "OpMinus",
    left: {
      type: "NumberLiteral",
      value: 0,
    },
    right: {
      type: "NumberLiteral",
      value: 5,
    },
  });
});
it("should parse containing zero", () => {
  expect(parse("13+0*1")).toEqual({
    type: "OpPlus",
    left: {
      type: "NumberLiteral",
      value: 13,
    },
    right: {
      type: "OpMultiply",
      left: {
        type: "NumberLiteral",
        value: 0,
      },
      right: {
        type: "NumberLiteral",
        value: 1,
      },
    },
  });
});
it("Property parsing", () => {
  expect(parse("foo")).toEqual({
    type: "PropertyReference",
    nullSafeNavigation: false,
    propertyName: "foo",
  });
});
it("Simple string parsing", () => {
  expect(parse(' "foo" ')).toEqual({
    type: "StringLiteral",
    value: "foo",
  });
});
it("Simple string parsing single quotes", () => {
  expect(parse(" 'foo' ")).toEqual({
    type: "StringLiteral",
    value: "foo",
  });
});
it("String parsing: escape characters 1 deep", () => {
  expect(parse(' "-?> ""foo"" dfs9 " ')).toEqual({
    type: "StringLiteral",
    value: '-?> "foo" dfs9 ',
  });
});
it("String parsing: escape characters 2 deep", () => {
  expect(parse('  "hello, I was told "" Say """"hi"""" "" " ')).toEqual({
    type: "StringLiteral",
    value: 'hello, I was told " Say ""hi"" " ',
  });
});
it("quoting", () => {
  expect(
    parse('  "hello, I was told "" Say \\""hi \'jack\' \\"" "" " ')
  ).toEqual({
    type: "StringLiteral",
    value: 'hello, I was told " Say \\"hi \'jack\' \\" " ',
  });
});
it("mixed but starting with sq", () => {
  expect(parse("  'they said, \" tell them ''I said hi'' \" ' ")).toEqual({
    type: "StringLiteral",
    value: "they said, \" tell them 'I said hi' \" ",
  });
});
it("literal (null)", () => {
  expect(parse("  null ")).toEqual({
    type: "NullLiteral",
  });
});

it("null", () => {
  expect(parse("null ?: 1")).toEqual({
    type: "Elvis",
    expression: {
      type: "NullLiteral",
    },
    ifFalse: {
      type: "NumberLiteral",
      value: 1,
    },
  });
});
it("Inline Lists", () => {
  expect(parse("{1,2,3,4}")).toEqual({
    type: "InlineList",
    elements: [
      {
        type: "NumberLiteral",
        value: 1,
      },
      {
        type: "NumberLiteral",
        value: 2,
      },
      {
        type: "NumberLiteral",
        value: 3,
      },
      {
        type: "NumberLiteral",
        value: 4,
      },
    ],
  });
  expect(parse("{'a', 'b'}")).toEqual({
    type: "InlineList",
    elements: [
      {
        type: "StringLiteral",
        value: "a",
      },
      {
        type: "StringLiteral",
        value: "b",
      },
    ],
  });
});
it("Empty Inline Map", () => {
  expect(parse("{:}")).toEqual({
    type: "InlineMap",
    elements: {},
  });
});
it("Inline Map", () => {
  expect(parse("{foo: 1 + 1, bar: 3 }")).toEqual({
    type: "InlineMap",
    elements: {
      foo: {
        type: "OpPlus",
        left: {
          type: "NumberLiteral",
          value: 1,
        },
        right: {
          type: "NumberLiteral",
          value: 1,
        },
      },
      bar: {
        type: "NumberLiteral",
        value: 3,
      },
    },
  });
});
it('Parsing: this == "z"', () => {
  expect(parse('#this == "z"')).toEqual({
    type: "OpEQ",
    left: {
      type: "VariableReference",
      variableName: "this",
    },
    right: {
      type: "StringLiteral",
      value: "z",
    },
  });
});
it('Parsing: a == "a" || b == ""', () => {
  expect(parse('a == "a" || b == ""')).toEqual({
    type: "OpOr",
    left: {
      type: "OpEQ",
      left: {
        type: "PropertyReference",
        nullSafeNavigation: false,
        propertyName: "a",
      },
      right: {
        type: "StringLiteral",
        value: "a",
      },
    },
    right: {
      type: "OpEQ",
      left: {
        type: "PropertyReference",
        nullSafeNavigation: false,
        propertyName: "b",
      },
      right: {
        type: "StringLiteral",
        value: "",
      },
    },
  });
});
it('Parsing: foo.?[#this == "z"]', () => {
  expect(parse('foo.?[#this == "z"]')).toEqual({
    type: "CompoundExpression",
    expressionComponents: [
      {
        type: "PropertyReference",
        nullSafeNavigation: false,
        propertyName: "foo",
      },
      {
        type: "SelectionAll",
        nullSafeNavigation: false,
        expression: {
          type: "OpEQ",
          left: {
            type: "VariableReference",
            variableName: "this",
          },
          right: {
            type: "StringLiteral",
            value: "z",
          },
        },
      },
    ],
  });
});

it("Parsing: {1}.$[#this % 2 == 0]", () => {
  expect(parse("{1}.$[#this % 2 == 0]")).toEqual({
    type: "CompoundExpression",
    expressionComponents: [
      {
        type: "InlineList",
        elements: [
          {
            type: "NumberLiteral",
            value: 1,
          },
        ],
      },
      {
        type: "SelectionLast",
        nullSafeNavigation: false,
        expression: {
          type: "OpEQ",
          left: {
            type: "OpModulus",
            left: {
              type: "VariableReference",
              variableName: "this",
            },
            right: {
              type: "NumberLiteral",
              value: 2,
            },
          },
          right: {
            type: "NumberLiteral",
            value: 0,
          },
        },
      },
    ],
  });
});
it("Inline Lists with negative elements", () => {
  expect(parse("{1, 2, -3}")).toEqual({
    type: "InlineList",
    elements: [
      {
        type: "NumberLiteral",
        value: 1,
      },
      {
        type: "NumberLiteral",
        value: 2,
      },
      {
        type: "Negative",
        value: {
          type: "NumberLiteral",
          value: 3,
        },
      },
    ],
  });
});
it("elvis with trailing negative", () => {
  expect(parse("null ?: -7")).toEqual({
    type: "Elvis",
    expression: {
      type: "NullLiteral",
    },
    ifFalse: {
      type: "Negative",
      value: {
        type: "NumberLiteral",
        value: 7,
      },
    },
  });
});
it("Parsing: {1, 2, -3}?.$[#this % 2 == 0] ?: -7", () => {
  expect(parse("{1, 2, -3}?.$[#this % 2 == 0] ?: -7")).toEqual({
    type: "Elvis",
    expression: {
      type: "CompoundExpression",
      expressionComponents: [
        {
          type: "InlineList",
          elements: [
            {
              type: "NumberLiteral",
              value: 1,
            },
            {
              type: "NumberLiteral",
              value: 2,
            },
            {
              type: "Negative",
              value: {
                type: "NumberLiteral",
                value: 3,
              },
            },
          ],
        },
        {
          type: "SelectionLast",
          nullSafeNavigation: true,
          expression: {
            type: "OpEQ",
            left: {
              type: "OpModulus",
              left: {
                type: "VariableReference",
                variableName: "this",
              },
              right: {
                type: "NumberLiteral",
                value: 2,
              },
            },
            right: {
              type: "NumberLiteral",
              value: 0,
            },
          },
        },
      ],
    },
    ifFalse: {
      type: "Negative",
      value: {
        type: "NumberLiteral",
        value: 7,
      },
    },
  });
});
it("Parsing: {1}.![#this * 2]", () => {
  expect(parse("{1}.![#this * 2]")).toEqual({
    type: "CompoundExpression",
    expressionComponents: [
      {
        type: "InlineList",
        elements: [
          {
            type: "NumberLiteral",
            value: 1,
          },
        ],
      },
      {
        type: "Projection",
        nullSafeNavigation: false,
        expression: {
          type: "OpMultiply",
          left: {
            type: "VariableReference",
            variableName: "this",
          },
          right: {
            type: "NumberLiteral",
            value: 2,
          },
        },
      },
    ],
  });
});

it("Parsing: simple ternary", () => {
  expect(parse('true ? "true" : "false"')).toEqual({
    type: "Ternary",
    expression: {
      type: "BooleanLiteral",
      value: true,
    },
    ifTrue: {
      type: "StringLiteral",
      value: "true",
    },
    ifFalse: {
      type: "StringLiteral",
      value: "false",
    },
  });
});

it('Parsing: foo() && arr?[0] > 0 || "fooc"', () => {
  expect(parse('foo() && arr?[0] > 0 || "fooc"')).toEqual({
    type: "OpOr",
    left: {
      type: "OpAnd",
      left: {
        type: "MethodReference",
        nullSafeNavigation: false,
        methodName: "foo",
        args: [],
      },
      right: {
        type: "OpGT",
        left: {
          type: "CompoundExpression",
          expressionComponents: [
            {
              type: "PropertyReference",
              nullSafeNavigation: false,
              propertyName: "arr",
            },
            {
              type: "Indexer",
              nullSafeNavigation: true,
              index: {
                type: "NumberLiteral",
                value: 0,
              },
            },
          ],
        },
        right: {
          type: "NumberLiteral",
          value: 0,
        },
      },
    },
    right: {
      type: "StringLiteral",
      value: "fooc",
    },
  });
});

it('Parsing:  myfunc(")", x) ', () => {
  expect(parse(' myfunc(")", x) ')).toEqual({
    type: "MethodReference",
    nullSafeNavigation: false,
    methodName: "myfunc",
    args: [
      {
        type: "StringLiteral",
        value: ")",
      },
      {
        type: "PropertyReference",
        nullSafeNavigation: false,
        propertyName: "x",
      },
    ],
  });
});

it("Parsing:  prop ", () => {
  expect(parse(" prop ")).toEqual({
    type: "PropertyReference",
    nullSafeNavigation: false,
    propertyName: "prop",
  });
});
it("Parsing: prop.![#this.foo + #this.bar.baz] ", () => {
  expect(parse(" prop.![#this.foo + #this.bar.baz] ")).toEqual({
    type: "CompoundExpression",
    expressionComponents: [
      {
        type: "PropertyReference",
        nullSafeNavigation: false,
        propertyName: "prop",
      },
      {
        type: "Projection",
        nullSafeNavigation: false,
        expression: {
          type: "OpPlus",
          left: {
            type: "CompoundExpression",
            expressionComponents: [
              {
                type: "VariableReference",
                variableName: "this",
              },
              {
                type: "PropertyReference",
                nullSafeNavigation: false,
                propertyName: "foo",
              },
            ],
          },
          right: {
            type: "CompoundExpression",
            expressionComponents: [
              {
                type: "VariableReference",
                variableName: "this",
              },
              {
                type: "PropertyReference",
                nullSafeNavigation: false,
                propertyName: "bar",
              },
              {
                type: "PropertyReference",
                nullSafeNavigation: false,
                propertyName: "baz",
              },
            ],
          },
        },
      },
    ],
  });
});

it("Parsing: foo.bar.baz != null ? foo.bar.baz : null  ", () => {
  expect(parse(" foo.bar.baz != null ? foo.bar.baz : null ")).toEqual({
    type: "Ternary",
    expression: {
      type: "OpNE",
      left: {
        type: "CompoundExpression",
        expressionComponents: [
          {
            type: "PropertyReference",
            nullSafeNavigation: false,
            propertyName: "foo",
          },
          {
            type: "PropertyReference",
            nullSafeNavigation: false,
            propertyName: "bar",
          },
          {
            type: "PropertyReference",
            nullSafeNavigation: false,
            propertyName: "baz",
          },
        ],
      },
      right: {
        type: "NullLiteral",
      },
    },
    ifTrue: {
      type: "CompoundExpression",
      expressionComponents: [
        {
          type: "PropertyReference",
          nullSafeNavigation: false,
          propertyName: "foo",
        },
        {
          type: "PropertyReference",
          nullSafeNavigation: false,
          propertyName: "bar",
        },
        {
          type: "PropertyReference",
          nullSafeNavigation: false,
          propertyName: "baz",
        },
      ],
    },
    ifFalse: {
      type: "NullLiteral",
    },
  });
});

it("Parsing: arr?.![#this + 1]", () => {
  expect(parse(" arr?.![#this + 1] ")).toEqual({
    type: "CompoundExpression",
    expressionComponents: [
      {
        type: "PropertyReference",
        nullSafeNavigation: false,
        propertyName: "arr",
      },
      {
        type: "Projection",
        nullSafeNavigation: true,
        expression: {
          type: "OpPlus",
          left: {
            type: "VariableReference",
            variableName: "this",
          },
          right: {
            type: "NumberLiteral",
            value: 1,
          },
        },
      },
    ],
  });
});

test("Parsing: !(lookupEntityData('Provider', parentProviderId, 'hasMiisSa' ))", () => {
  expect(
    parse("!(lookupEntityData('Provider', parentProviderId, 'hasMiisSa' ))")
  ).toEqual({
    type: "OpNot",
    expression: {
      type: "MethodReference",
      nullSafeNavigation: false,
      methodName: "lookupEntityData",
      args: [
        {
          type: "StringLiteral",
          value: "Provider",
        },
        {
          type: "PropertyReference",
          nullSafeNavigation: false,
          propertyName: "parentProviderId",
        },
        {
          type: "StringLiteral",
          value: "hasMiisSa",
        },
      ],
    },
  });
});

it('Parsing:  foo() && arr?[0] > 0 || "fooc" ? arr?.![#this + 1] : null ', () => {
  expect(
    parse(' foo() && arr?[0] > 0 || "fooc" ? arr?.![#this + 1] : null ')
  ).toEqual({
    type: "Ternary",
    expression: {
      type: "OpOr",
      left: {
        type: "OpAnd",
        left: {
          type: "MethodReference",
          nullSafeNavigation: false,
          methodName: "foo",
          args: [],
        },
        right: {
          type: "OpGT",
          left: {
            type: "CompoundExpression",
            expressionComponents: [
              {
                type: "PropertyReference",
                nullSafeNavigation: false,
                propertyName: "arr",
              },
              {
                type: "Indexer",
                nullSafeNavigation: true,
                index: {
                  type: "NumberLiteral",
                  value: 0,
                },
              },
            ],
          },
          right: {
            type: "NumberLiteral",
            value: 0,
          },
        },
      },
      right: {
        type: "StringLiteral",
        value: "fooc",
      },
    },
    ifTrue: {
      type: "CompoundExpression",
      expressionComponents: [
        {
          type: "PropertyReference",
          nullSafeNavigation: false,
          propertyName: "arr",
        },
        {
          type: "Projection",
          nullSafeNavigation: true,
          expression: {
            type: "OpPlus",
            left: {
              type: "VariableReference",
              variableName: "this",
            },
            right: {
              type: "NumberLiteral",
              value: 1,
            },
          },
        },
      ],
    },
    ifFalse: {
      type: "NullLiteral",
    },
  });
});

it("Parsing:  Object with quoted keys ", () => {
  expect(parse(`{"9ego": 1}`)).toEqual({
    elements: {
      "9ego": {
        type: "NumberLiteral",
        value: 1,
      },
    },
    type: "InlineMap",
  });
});

it("takes allowWeirdQuoteCharacters as a boolean or an option", () => {
  const expected: Ast = { type: "StringLiteral", value: "a" };
  expect(parse("“a”", false, true)).toEqual(expected);
  expect(parse("“a”", false, { allowWeirdQuoteCharacters: true })).toEqual(
    expected
  );
  expect(() => parse("“a”")).toThrow();
});

it("treats null options as no options", () => {
  // Plain-JS callers passed null for the old allowWeirdQuoteCharacters boolean.
  expect(parse("a", false, null as any)).toEqual(parse("a"));
});

it("refuses a number literal too large for a finite double", () => {
  expect(() => parse("9".repeat(400))).toThrow(ParsingError);
  expect(parse("1" + "0".repeat(308))).toEqual({
    type: "NumberLiteral",
    value: 1e308,
  });
});
