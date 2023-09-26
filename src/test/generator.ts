import PD from "probability-distributions";
import type { Ast } from "../lib/Ast";

type Extends<T, U extends T> = U;

// TODO
// Possibly extend this to include functions/methods and variables/properties which we create ad-hoc
type TerminatingTypeAllowed = Extends<
  Ast["type"],
  "BooleanLiteral" | "NullLiteral" | "NumberLiteral" | "StringLiteral"
>;

const randomString = () => (Math.random() + 1).toString(36).substring(7);

const generateType = (allowedType: TerminatingTypeAllowed): Ast => {
  switch (allowedType) {
    case "BooleanLiteral":
      return {
        type: "BooleanLiteral",
        value: withProbability(0.5),
      };
    case "NullLiteral":
      return {
        type: "NullLiteral",
      };
    case "NumberLiteral": {
      return {
        type: "NumberLiteral",
        value: PD.rint(1, 0, 20, 1)[0],
      };
    }
    case "StringLiteral": {
      return {
        type: "StringLiteral",
        value: randomString(),
      };
    }
  }
};

const withProbability = (prob: number) => {
  return PD.rbinom(1, 1, prob)[0] === 1;
};

const allLiterals: TerminatingTypeAllowed[] = [
  "BooleanLiteral",
  "NullLiteral",
  "NumberLiteral",
  "StringLiteral",
];

const allLegalTypes: Ast["type"][] = [
  "BooleanLiteral",
  "CompoundExpression",
  "FunctionReference",
  "InlineList",
  "InlineMap",
  "MethodReference",
  "NullLiteral",
  "PropertyReference",
  "VariableReference",
  "StringLiteral",
  "NumberLiteral",
];

const gen = (litProbInv: number, legalTypes: Ast["type"][] = allLegalTypes) => {
  const generateLiteral = withProbability(1.0 / Math.max(litProbInv, 1.0));
  if (generateLiteral) {
    const typesToPick = allLiterals.filter((literalType) =>
      legalTypes.includes(literalType)
    );
    if (!typesToPick) {
      throw new Error(
        "None of the legal types are literals - I would not expect this."
      );
    }
    const ix = PD.rint(1, 0, typesToPick.length - 1, 1)[0];
    return generateType(typesToPick[ix]);
  }
  const procedures: [
    generate: () => Ast,
    possibleTypesGenerated: Ast["type"][]
  ][] = [
    [
      () => ({
        type: "Ternary",
        expression: gen(litProbInv / 2, ["BooleanLiteral"]),
        ifFalse: gen(litProbInv / 2, legalTypes),
        ifTrue: gen(litProbInv / 2, legalTypes),
      }),
      legalTypes,
    ],
    [
      () => ({
        type: "OpPower",
        base: gen(litProbInv / 2, ["NumberLiteral"]),
        expression: gen(litProbInv / 2, ["NumberLiteral"]),
      }),
      ["NumberLiteral"],
    ],
    [
      () => ({
        type: (() => {
          const types = [
            "OpPlus",
            "OpMinus",
            "OpMultiply",
            "OpDivide",
            "OpModulus",
          ] as const;
          return types[PD.rint(1, 0, types.length - 1, 1)[0]];
        })(),
        left: gen(litProbInv / 2, ["NumberLiteral"]),
        right: gen(litProbInv / 2, ["NumberLiteral"]),
      }),
      ["NumberLiteral"],
    ],
    [
      () => ({
        type: (() => {
          const types = ["OpOr", "OpAnd"] as const;
          return types[PD.rint(1, 0, types.length - 1, 1)[0]];
        })(),
        left: gen(litProbInv / 2, ["BooleanLiteral"]),
        right: gen(litProbInv / 2, ["BooleanLiteral"]),
      }),
      ["BooleanLiteral"],
    ],
    [
      () => ({
        type: "OpNot",
        expression: gen(litProbInv / 2, ["BooleanLiteral"]),
      }),
      ["BooleanLiteral"],
    ],
    [
      () => ({
        type: "Negative",
        value: gen(litProbInv / 2, ["NumberLiteral"]),
      }),
      ["NumberLiteral"],
    ],
    [
      () => ({
        type: (() => {
          const types = ["OpGE", "OpLE", "OpLT", "OpGT"] as const;
          return types[PD.rint(1, 0, types.length - 1, 1)[0]];
        })(),
        left: gen(litProbInv / 2, ["NumberLiteral"]),
        right: gen(litProbInv / 2, ["NumberLiteral"]),
      }),
      ["BooleanLiteral"],
    ],
    [
      () => ({
        type: (() => {
          const types = ["OpNE", "OpEQ"] as const;
          return types[PD.rint(1, 0, types.length - 1, 1)[0]];
        })(),
        left: gen(litProbInv / 2, legalTypes),
        right: gen(litProbInv / 2, legalTypes),
      }),
      ["BooleanLiteral"],
    ],
    [
      () => ({
        type: (() => {
          const types = ["OpMatches"] as const;
          return types[PD.rint(1, 0, types.length - 1, 1)[0]];
        })(),
        left: gen(litProbInv / 2, ["StringLiteral"]),
        right: gen(litProbInv / 2, ["StringLiteral"]),
      }),
      ["BooleanLiteral"],
    ],
    // ignore between
    [
      () => ({
        type: "InlineMap",
        elements: (() => {
          const r = {};
          const l = PD.rint(1, 0, 6, 1)[0];
          for (let i = 0; i < l; i++) {
            r[randomString()] = gen(litProbInv / 2, legalTypes);
          }
          return r;
        })(),
      }),
      ["InlineMap"],
    ],
    [
      () => ({
        type: "InlineList",
        elements: (() => {
          const r = [];
          const l = PD.rint(1, 0, 6, 1)[0];
          for (let i = 0; i < l; i++) {
            r.push(gen(litProbInv / 2, legalTypes));
          }
          return r;
        })(),
      }),
      ["InlineList"],
    ],
    [
      () => ({
        type: "Elvis",
        expression: gen(litProbInv / 2, legalTypes),
        ifFalse: gen(litProbInv / 2, legalTypes),
      }),
      legalTypes,
    ],
    // TODO: compounds
  ];
  const legalGenerators = procedures
    .filter(([procedure, returnTypes]) => {
      return returnTypes.every((type) => legalTypes.includes(type));
    })
    .map(([fn]) => fn);

  return legalGenerators[PD.rint(1, 0, legalGenerators.length - 1, 1)[0]]();
};

export default gen;
