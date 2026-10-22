import { Ast } from "./Ast";
import { ParsingError } from "./CustomErrors";
import { fastCharCodeIsWhitespace } from "./fastIsWhitespace";
import _stringLiteral from "./stringLiteralSPELStyle";

// turn true for debugging.
const logFlag = false;

export type ParseOptions = {
  offsets?: boolean;
  allowWeirdQuoteCharacters?: boolean;
};

const noRange = (_node: Ast, _start: number, _end: number) => {};
const unranged = (production: () => Ast | null) => production;

/**
 * Produces an AST representing the input SPEL expression
 *
 * ### Example (es module)
 * ```js
 * import { parse } from 'ts-spel'
 * console.log(parse('4'))
 * // => { type: 'NumberLiteral', value: 4 }
 * ```
 *
 * ### Example (commonjs)
 * ```js
 * var double = require('ts-spel').parse;
 * console.log(double(4))
 * // => { type: 'NumberLiteral', value: 4 }
 * ```
 *
 * @param input - SPEL expression
 * @param graceful - if true, will not error if the expression is incomplete -
 *  to be used for autocompletion
 *  (where we need an AST built to the current position to figure out the context of the current cursor position)
 * @param options - `offsets: true` records each node's source range (see `SourceRange`).
 *  A boolean here is the older `allowWeirdQuoteCharacters` argument.
 * @returns AST representing input
 */
export const parse = function (
  input: string,
  graceful = false,
  options: ParseOptions | boolean = {}
): Ast {
  const { offsets = false, allowWeirdQuoteCharacters = false } =
    typeof options === "boolean"
      ? { allowWeirdQuoteCharacters: options }
      : options;
  let index = 0;

  // Opt-in because recording ranges made every parse ~1.6x slower, and graceful parsing runs
  // on every keystroke. Non-enumerable so that toEqual, JSON.stringify and spread see the same
  // AST either way; a node copied by spread loses them, which is right: its text may differ.
  // The extra own properties change node shapes, which would matter if these ASTs fed the
  // evaluator's hot path; the consumer that wants offsets parses once and never evaluates them.
  const setRange = !offsets
    ? noRange
    : (node: Ast, start: number, end: number) => {
        while (
          start < end &&
          fastCharCodeIsWhitespace(input.charCodeAt(start))
        ) {
          start++;
        }
        while (
          end > start &&
          fastCharCodeIsWhitespace(input.charCodeAt(end - 1))
        ) {
          end--;
        }
        Object.defineProperties(node, {
          start: { value: start, writable: true, configurable: true },
          end: { value: end, writable: true, configurable: true },
        });
      };
  // The innermost production that returns a node sets its range; productions that pass a
  // child through unchanged (and parenExpression, so parens stay outside) leave it alone.
  const ranged = !offsets
    ? unranged
    : (production: () => Ast | null) => (): Ast | null => {
        const start = index;
        const node = production();
        if (node && !Object.prototype.hasOwnProperty.call(node, "start")) {
          setRange(node, start, index);
        }
        return node;
      };

  const log = (...args) => {
    if (logFlag) {
      console.log(input.slice(index), ...args);
    }
  };

  const utils = {
    // s : 'a'  ==>  var s = function() { return char('a'); };
    char: function (expected: string): string | null {
      let c: string;
      return index < input.length && (c = input.charAt(index++)) === expected
        ? c
        : (() => {
            if (c && c !== expected) {
              index--;
            }
            return null;
          })();
    },
    chars: function (expected: string): string | null {
      const backtrack = index;
      let success = true;
      for (let i = 0; success && i < expected.length; i++) {
        success = Boolean(utils.char(expected[i]));
      }
      if (!success) {
        index = backtrack;
        return null;
      }
      return expected;
    },
    // s : /[0-9]+/  ==>  var s = function() { return regExp(/[0-9]+/); };
    regExp: function (regexp: RegExp): string | null {
      let match: RegExpMatchArray;
      if (
        index < input.length &&
        (match = regexp.exec(input.substr(index))) &&
        match.index === 0
      ) {
        index += match[0].length;
        return match[0];
      }
      return null;
    },

    // s : s1 | s2  ==>  var s = function() { return firstOf(s1, s2); };
    firstOf: function (...args: (() => null | Ast)[]) {
      const backtrack = index;
      for (let len = args.length, i = 0; i < len; i++) {
        const val = args[i]();
        if (val !== null) {
          return val;
        }
        index = backtrack;
      }
      return null;
    },
    // s : t*  ==>  s : s';  s' : t s' | empty  ==>  var s = function() { return zeroOrMore(t); };
    zeroOrMore: function (func: () => Ast | null) {
      for (;;) {
        const backtrack = index;
        if (!func()) {
          index = backtrack;
          return true;
        }
      }
    },
    whitSpc: function () {
      while (
        index < input.length &&
        fastCharCodeIsWhitespace(input.charCodeAt(index))
      ) {
        index += 1;
      }
      return true;
    },
    identifier: function () {
      return utils.regExp(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    },
    stringLiteral: function (): string | null | -1 {
      const match = _stringLiteral(
        input.slice(index),
        allowWeirdQuoteCharacters
      );
      if (match === -1) {
        if (graceful) {
          return -1;
        }
        throw new ParsingError(input, index, "Non-terminating quoted string");
      }
      if (match) {
        index = index + match[1];
        return match[0];
      }
      return null;
    },
  };

  const someInputRemaining = () => index !== input.length;
  const getOpIsClosed = () =>
    graceful
      ? (() => {
          utils.whitSpc();
          return someInputRemaining();
        })()
      : undefined;

  const expression = ranged(function (): Ast | null {
    log("expression");
    utils.whitSpc();
    const exp1 = logicalOrExpression();
    utils.whitSpc();
    if (utils.char("?")) {
      if (utils.char(":")) {
        log("after elvis operator");
        const exp2 = expression();
        log("after expression eaten post elvis");
        if (!exp2 && !graceful) {
          throw new ParsingError(
            input,
            index,
            "Expected expression after elvis (?:)"
          );
        }
        return {
          type: "Elvis",
          expression: exp1,
          ifFalse: exp2,
          _isClosed: getOpIsClosed(),
        };
      } else {
        let exp2: Ast | null = null;
        let exp3: Ast | null = null;
        if (
          ((exp2 = expression()) && utils.char(":") && (exp3 = expression())) ||
          graceful
        ) {
          return {
            type: "Ternary",
            expression: exp1,
            ifTrue: exp2,
            ifFalse: exp3,
            _isClosed: getOpIsClosed(),
          };
        } else {
          throw new ParsingError(input, index, "Incomplete Ternary");
        }
      }
    } else {
      return exp1;
    }
  });

  const logicalOrExpression = function (): Ast | null {
    log("logicalOrExpression");
    utils.whitSpc();
    const start = index;
    let left: Ast | null = logicalAndExpression();
    utils.whitSpc();
    utils.zeroOrMore(() => {
      utils.whitSpc();
      let right: Ast | null;
      if (utils.char("|")) {
        if (utils.char("|")) {
          if ((right = logicalAndExpression()) || graceful) {
            left = {
              type: "OpOr",
              left,
              right,
              _isClosed: getOpIsClosed(),
            };
            setRange(left, start, index);
            return left;
          } else {
            throw new ParsingError(input, index, "No right operand for ||");
          }
        } else {
          throw new ParsingError(input, index, "Missing Character |");
        }
      }
      // Now opOr
      const backtrack = index;
      const keyword = utils.identifier();
      if (keyword?.toLowerCase() === "or") {
        if ((right = relationalExpression()) || graceful) {
          left = {
            type: "OpOr",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
          setRange(left, start, index);
          return left;
        } else {
          throw new ParsingError(input, index, "No right operand for OR");
        }
      } else {
        index = backtrack;
      }
      return null;
    });
    return left;
  };

  const logicalAndExpression = function (): Ast | null {
    log("logicalAndExpression");
    utils.whitSpc();
    const start = index;
    let left: Ast | null = relationalExpression();
    utils.whitSpc();
    utils.zeroOrMore(() => {
      utils.whitSpc();
      let right: Ast | null;
      if (utils.char("&")) {
        if (utils.char("&")) {
          if ((right = relationalExpression()) || graceful) {
            left = {
              type: "OpAnd",
              left,
              right,
              _isClosed: getOpIsClosed(),
            };
            setRange(left, start, index);
            return left;
          } else {
            throw new ParsingError(input, index, "No right operand for &&");
          }
        } else {
          throw new ParsingError(input, index, "Missing Character &");
        }
      }
      // Now try AND/and
      const backtrack = index;
      const keyword = utils.identifier();
      if (keyword?.toLowerCase() === "and") {
        if ((right = relationalExpression()) || graceful) {
          left = {
            type: "OpAnd",
            left,
            right,
          };
          setRange(left, start, index);
          return left;
        } else {
          throw new ParsingError(input, index, "No right operand for AND");
        }
      } else {
        index = backtrack;
      }

      return null;
    });
    return left;
  };

  /*
  OPEQ NOT IMPLEMENTED!!
  */
  const relationalExpression = ranged(function (): Ast | null {
    log("relationalExpression");
    utils.whitSpc();
    const left: Ast | null = sumExpression();
    let right: Ast | null = null;
    const backtrack = index;
    utils.whitSpc();
    if (utils.char(">")) {
      if (utils.char("=")) {
        if ((right = sumExpression()) || graceful) {
          return {
            type: "OpGE",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
        } else {
          throw new ParsingError(input, index, "No right operand for >=");
        }
      } else if ((right = sumExpression()) || graceful) {
        return {
          type: "OpGT",
          left,
          right,
          _isClosed: getOpIsClosed(),
        };
      } else {
        throw new ParsingError(input, index, "No right operand for >");
      }
    } else if (utils.char("<")) {
      if (utils.char("=")) {
        if ((right = sumExpression()) || graceful) {
          return {
            type: "OpLE",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
        } else {
          throw new ParsingError(input, index, "No right operand for <=");
        }
      } else if ((right = sumExpression()) || graceful) {
        return {
          type: "OpLT",
          left,
          right,
          _isClosed: getOpIsClosed(),
        };
      } else {
        throw new ParsingError(input, index, "No right operand for <");
      }
    } else if (utils.char("!")) {
      if (utils.char("=")) {
        if ((right = sumExpression()) || graceful) {
          return {
            type: "OpNE",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
        } else {
          throw new ParsingError(input, index, "No right operand for !=");
        }
      } else {
        index = backtrack;
      }
    } else if (utils.char("=")) {
      log("got =");
      if (utils.char("=")) {
        if ((right = sumExpression()) || graceful) {
          return {
            type: "OpEQ",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
        } else {
          throw new ParsingError(input, index, "No right operand for ==");
        }
      } else {
        throw new ParsingError(input, index, "Assignment not allowed");
      }
    } else {
      const backtrack = index;
      let keyword = utils.identifier();
      if (keyword === "matches") {
        if ((right = sumExpression()) || graceful) {
          return {
            type: "OpMatches",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
        } else {
          throw new ParsingError(
            input,
            index,
            "No right operand for 'matches'"
          );
        }
      } else if (keyword === "between") {
        if ((right = sumExpression()) || graceful) {
          return {
            type: "OpBetween",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
        } else {
          throw new ParsingError(
            input,
            index,
            "No right operand for 'between'"
          );
        }
      } else {
        if (keyword && !["and", "or"].includes(keyword?.toLowerCase())) {
          if (!graceful) {
            throw new ParsingError(
              input,
              index,
              "Not an Operator",
              `"${keyword}" is not an operator`
            );
          }
        }
        index = backtrack;
      }
    }
    log("fell through");
    return left;
  });

  const sumExpression = function (): Ast | null {
    log("sumExpression");
    utils.whitSpc();
    const start = index;
    let left: Ast | null = productExpression();
    utils.whitSpc();
    log("sumExpression left", left);
    utils.zeroOrMore(() => {
      utils.whitSpc();
      log("in zeroOrMore");
      let right: Ast | null = null;
      if (utils.char("+")) {
        log("pluscase");
        right = productExpression();
        if (!right && !graceful) {
          throw new ParsingError(input, index, "No right operand for +");
        }
        left = {
          type: "OpPlus",
          left,
          right,
          _isClosed: getOpIsClosed(),
        };
        setRange(left, start, index);
        return left;
      } else if (utils.char("-")) {
        log("minuscase");
        right = productExpression();
        if (!right && !graceful) {
          throw new ParsingError(input, index, "No right operand for -");
        }
        left = {
          type: "OpMinus",
          left,
          right,
          _isClosed: getOpIsClosed(),
        };
        setRange(left, start, index);
        return left;
      } else {
        log("missed all");
      }
      return null;
    });

    return left;
  };
  const productExpression = function (): Ast | null {
    log("productExpression");
    utils.whitSpc();
    const start = index;
    let left: Ast | null = powerExpression();
    utils.whitSpc();
    utils.zeroOrMore(() => {
      let right: Ast | null = null;
      if (utils.char("*")) {
        if (!left) {
          throw new ParsingError(input, index - 1, "No left operand for *");
        }
        right = powerExpression();
        if (right || graceful) {
          left = {
            type: "OpMultiply",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
          setRange(left, start, index);
          return left;
        }
        throw new ParsingError(input, index, "No right operand for *");
      } else if (utils.char("/")) {
        if (!left) {
          throw new ParsingError(input, index - 1, "No left operand for /");
        }
        right = powerExpression();
        if (right || graceful) {
          left = {
            type: "OpDivide",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
          setRange(left, start, index);
          return left;
        }
        throw new ParsingError(input, index, "No right operand for /");
      } else if (utils.char("%")) {
        if (!left) {
          throw new ParsingError(input, index - 1, "No left operand for %");
        }
        right = powerExpression();
        if (right || graceful) {
          left = {
            type: "OpModulus",
            left,
            right,
            _isClosed: getOpIsClosed(),
          };
          setRange(left, start, index);
          return left;
        }
        throw new ParsingError(input, index, "No right operand for %");
      }
      return null;
    });
    return left;
  };
  const powerExpression = ranged(function (): Ast | null {
    log("powerExpression");
    utils.whitSpc();
    const left: Ast | null = unaryExpression();
    utils.whitSpc();
    const backtrack = index;
    if (utils.char("^")) {
      const right: Ast | null = unaryExpression();
      return {
        type: "OpPower",
        base: left,
        expression: right,
        _isClosed: getOpIsClosed(),
      };
    } else {
      index = backtrack;
    }
    return left;
  });
  const unaryExpression = ranged(function (): Ast | null {
    log("unaryExpression");
    return utils.firstOf(negative, not, primaryExpression);
  });
  const negative = function (): Ast | null {
    log("negative");
    let operand: Ast | null = null;
    if (utils.char("-") && (operand = unaryExpression())) {
      return {
        type: "Negative",
        value: operand,
      };
    }
    log("negative (null)");
    return null;
  };
  const not = function (): Ast | null {
    log("not");
    let operand: Ast | null = null;
    if (utils.char("!") && ((operand = unaryExpression()) || graceful)) {
      return {
        type: "OpNot",
        expression: operand,
      };
    }
    return null;
  };
  const primaryExpression = function (): Ast | null {
    log("primaryExpression");
    utils.whitSpc();
    const sn: Ast | null = startNode();
    log("after startNode got");
    const continuations: Ast[] = [];
    utils.zeroOrMore(() => {
      utils.whitSpc();
      let nextNode: Ast | null = null;
      if ((nextNode = node())) {
        continuations.push(nextNode);
        return nextNode;
      }
      return null;
    });
    if (continuations.length > 0) {
      return {
        type: "CompoundExpression",
        expressionComponents: [sn, ...continuations],
      };
    }
    return sn;
  };
  const startNode = ranged(function (): Ast | null {
    log("startNode");
    return utils.firstOf(
      parenExpression,
      literal,
      functionOrVar,
      () => methodOrProperty(false),
      inlineListOrMap
    );
  });
  const node = ranged(function (): Ast | null {
    log("node");
    return utils.firstOf(
      projection,
      selection,
      navProperty,
      indexExp,
      functionOrVar
    );
  });
  const navProperty = function (): Ast | null {
    log("navProperty");
    if (utils.char(".")) {
      return (
        methodOrProperty(false) ||
        (() => {
          if (graceful) {
            return {
              type: "PropertyReference",
              propertyName: "",
              nullSafeNavigation: false,
            };
          }
          throw new ParsingError(input, index, "Expected property after .");
        })()
      );
    }
    const backtrack = index;
    if (utils.char("?") && utils.char(".")) {
      return (
        methodOrProperty(true) ||
        (() => {
          if (graceful) {
            return {
              type: "PropertyReference",
              propertyName: "",
              nullSafeNavigation: true,
            };
          }
          throw new ParsingError(input, index, "Expected property after ?.");
        })()
      );
    } else {
      index = backtrack;
    }
    return null;
  };

  const indexExp = function (): Ast | null {
    log("indexExp");
    return utils.firstOf(nullSafeIndex, notNullSafeIndex);
  };
  const nullSafeIndex = function (): Ast | null {
    log("nullSafeIndex");
    const backtrack = index;
    let innerExpression: Ast | null = null;
    if (utils.char("?") && utils.char("[")) {
      if ((innerExpression = expression()) || graceful) {
        if (utils.char("]")) {
          return {
            type: "Indexer",
            nullSafeNavigation: true,
            index: innerExpression,
          };
        } else if (graceful) {
          return {
            type: "Indexer",
            nullSafeNavigation: true,
            index: innerExpression,
            __unclosed: true,
          };
        }
        throw new ParsingError(input, index, "Expected ]");
      } else {
        if (utils.char("]")) {
          index -= 1;
          throw new ParsingError(input, index, "Expression expected in []");
        }
        throw new ParsingError(input, index, "Expected ]");
      }
    } else {
      index = backtrack;
    }
    return null;
  };
  const notNullSafeIndex = function (): Ast | null {
    log("notNullSafeIndex");
    const backtrack = index;
    let innerExpression: Ast | null = null;
    if (utils.char("[")) {
      if ((innerExpression = expression()) || graceful) {
        if (utils.char("]")) {
          return {
            type: "Indexer",
            nullSafeNavigation: false,
            index: innerExpression,
          };
        } else if (graceful) {
          return {
            type: "Indexer",
            nullSafeNavigation: false,
            index: innerExpression,
            __unclosed: true,
          };
        }
        throw new ParsingError(input, index, "Expected ]");
      } else {
        if (utils.char("]")) {
          index -= 1;
          throw new ParsingError(input, index, "Expression expected in []");
        }
        throw new ParsingError(input, index, "Expected ]");
      }
    } else {
      index = backtrack;
    }
    return null;
  };
  const methodOrProperty = function (nullSafeNavigation: boolean): Ast | null {
    log("methodOrProperty");
    utils.whitSpc();
    const args: Ast[] = [];
    let ident: string | null = null;
    if ((ident = utils.identifier())) {
      const fnbacktrack = index;
      if (utils.char("(")) {
        let precededByComma = false;
        if (
          utils.zeroOrMore(() => {
            const arg = expression();
            if (arg) {
              args.push(arg);
              precededByComma = Boolean(utils.char(","));
              return arg;
            } else if (graceful && precededByComma) {
              args.push(null);
            }
            return null;
          })
        ) {
          if (utils.char(")")) {
            return {
              type: "MethodReference",
              nullSafeNavigation,
              methodName: ident,
              args,
            };
          } else if (graceful) {
            return {
              type: "MethodReference",
              nullSafeNavigation,
              methodName: ident,
              args,
              __unclosed: true,
            };
          }
        }
        throw new ParsingError(input, index, "Expected ) for method call");
      } else {
        index = fnbacktrack;
        return {
          type: "PropertyReference",
          propertyName: ident,
          nullSafeNavigation,
        };
      }
    }
    return null;
  };
  const functionOrVar = function (): Ast | null {
    log("functionOrVar");
    utils.whitSpc();
    const args: Ast[] = [];
    let ident: string | null = null;
    if (utils.char("#") && (ident = utils.identifier())) {
      const fnbacktrack = index;
      if (utils.char("(")) {
        if (
          utils.zeroOrMore(() => {
            const arg = expression();
            if (arg) {
              args.push(arg);
              utils.char(",");
              return arg;
            }
            return null;
          })
        ) {
          if (utils.char(")")) {
            return {
              type: "FunctionReference",
              nullSafeNavigation: false,
              functionName: ident,
              args,
            };
          } else if (graceful) {
            return {
              type: "FunctionReference",
              nullSafeNavigation: false,
              functionName: ident,
              args,
              __unclosed: true,
            };
          }
        }
        throw new ParsingError(input, index, "Expected ) for function call");
      } else {
        index = fnbacktrack;
        return {
          type: "VariableReference",
          variableName: ident,
        };
      }
    }
    return null;
  };
  const selection = function (): Ast | null {
    log("selection");
    utils.whitSpc();
    const backtrack = index;
    const nullSafeNavigation = (() => {
      if (utils.char("?")) {
        if (utils.char(".")) {
          return true;
        } else {
          index = backtrack;
          return null;
        }
      } else if (utils.char(".")) {
        return false;
      } else {
        return null;
      }
    })();
    log("nullSafeNavigation " + nullSafeNavigation);
    if (nullSafeNavigation === null) {
      return null;
    }

    const result = utils.firstOf(
      () => {
        let exp: Ast | null;
        if (utils.char("?") && utils.char("[")) {
          if (
            utils.whitSpc() &&
            (exp = expression()) &&
            utils.whitSpc() &&
            utils.char("]")
          ) {
            return {
              type: "SelectionAll",
              nullSafeNavigation,
              expression: exp,
            };
          } else if (graceful) {
            return {
              type: "SelectionAll",
              nullSafeNavigation,
              expression: exp,
              __unclosed: true,
            };
          } else {
            throw new ParsingError(
              input,
              index,
              "Expected ] for selection expression ?["
            );
          }
        }
        return null;
      },
      () => {
        let exp: Ast | null;
        if (utils.char("^") && utils.char("[")) {
          if ((exp = expression()) && utils.char("]")) {
            return {
              type: "SelectionFirst",
              nullSafeNavigation,
              expression: exp,
            };
          } else if (graceful) {
            return {
              type: "SelectionFirst",
              nullSafeNavigation,
              expression: exp,
              __unclosed: true,
            };
          } else {
            throw new ParsingError(
              input,
              index,
              "Expected ] for selection expression ^["
            );
          }
        }
        return null;
      },
      () => {
        let exp: Ast | null;
        if (utils.char("$") && utils.char("[")) {
          if ((exp = expression()) && utils.char("]")) {
            return {
              type: "SelectionLast",
              nullSafeNavigation,
              expression: exp,
            };
          } else if (graceful) {
            return {
              type: "SelectionLast",
              nullSafeNavigation,
              expression: exp,
              __unclosed: true,
            };
          } else {
            throw new ParsingError(
              input,
              index,
              "Expected ] for selection expression $["
            );
          }
        }
        return null;
      }
    );
    if (result === null) {
      index = backtrack;
      return null;
    }
    return result;
  };
  const projection = function (): Ast | null {
    log("projection");
    utils.whitSpc();
    const backtrack = index;
    const nullSafeNavigation = (() => {
      if (utils.char("?")) {
        if (utils.char(".")) {
          return true;
        } else {
          index = backtrack;
          return null;
        }
      } else if (utils.char(".")) {
        return false;
      } else {
        return null;
      }
    })();
    if (nullSafeNavigation === null) {
      return null;
    }
    let exp: Ast | null;
    if (utils.char("!") && utils.char("[")) {
      if ((exp = expression()) && utils.char("]")) {
        return {
          type: "Projection",
          nullSafeNavigation,
          expression: exp,
        };
      } else if (graceful) {
        return {
          type: "Projection",
          nullSafeNavigation,
          expression: exp,
          __unclosed: true,
        };
      } else {
        throw new ParsingError(
          input,
          index,
          "Expected ] for Projection expression !["
        );
      }
    } else {
      index = backtrack;
    }
    return null;
  };

  const string = (): (Ast & { type: "StringLiteral" }) | null => {
    const stringLiteral = utils.stringLiteral();
    if (typeof stringLiteral === "string") {
      log("returning stringLiteral", stringLiteral);
      return {
        type: "StringLiteral",
        value: stringLiteral,
      };
    }
    if (stringLiteral === -1) {
      // it's unclosed, so let's just capture the rest
      const value = input.slice(index).trim().slice(1);
      index = input.length;
      return {
        type: "StringLiteral",
        value,
        __unclosed: true,
      };
    }
    return null;
  };
  const literal = function (): Ast | null {
    log("literal");
    return utils.firstOf(
      string,
      number,
      () =>
        utils.regExp(/true/i) && {
          type: "BooleanLiteral",
          value: true,
        },
      () =>
        utils.regExp(/false/i) && {
          type: "BooleanLiteral",
          value: false,
        },
      () =>
        utils.regExp(/null/i) && {
          type: "NullLiteral",
        }
    );
  };
  const parenExpression = function (): Ast | null {
    log("parenExpression");
    let exp: Ast | null;
    if (utils.char("(")) {
      if ((exp = expression()) || graceful) {
        if (utils.char(")") || graceful) {
          return exp;
        }
        throw new ParsingError(input, index, "Expected )");
      }
      if (utils.char(")")) {
        index -= 1;
        throw new ParsingError(input, index, "Expected expression in ()");
      }
      throw new ParsingError(input, index, "Expected )");
    }
    return null;
  };

  const inlineListOrMap = function (): Ast | null {
    log("inlineListOrMap");
    const listElements: Ast[] = [];
    const dict: {
      [key: string]: Ast;
    } = {};

    /**
     * If we're in graceful mode, let's store any lists we find, and only return them if we don't also find a possible 'map'
     */
    let foundGracefulList: Ast;
    let gracefulListEnd: number;
    const start = index;
    // The map attempt below moves index past the list's text; range the list where it ended.
    const returnGracefulList = () => {
      setRange(foundGracefulList, start, gracefulListEnd);
      index = gracefulListEnd;
      return foundGracefulList;
    };
    utils.whitSpc();
    if (utils.char("{")) {
      const fnbacktrack = index;
      // look for comma seperated list items
      if (
        utils.zeroOrMore(() => {
          const elem = expression();
          if (elem) {
            // backtrack early if we hit a color: we're in a map
            // so don't push the item onto listElements
            const storeIx = index;
            const foundColon = utils.char(":");
            if (foundColon) {
              index = storeIx;
              return null;
            }

            listElements.push(elem);
            utils.char(",");
            utils.whitSpc();
            return elem;
          }
          return null;
        })
      ) {
        if (utils.char("}")) {
          return {
            type: "InlineList",
            elements: listElements,
          };
        } else if (graceful) {
          // check for map first.
          foundGracefulList = {
            type: "InlineList",
            elements: listElements,
            __unclosed: true,
          };
          gracefulListEnd = index;
        }
      }
      index = fnbacktrack;

      // empty dict
      if (
        utils.whitSpc() &&
        utils.char(":") &&
        utils.whitSpc() &&
        utils.char("}")
      ) {
        return {
          type: "InlineMap",
          elements: {},
        };
      }
      index = fnbacktrack;
      // look for dictionary key/value pairs
      let wasComma = false;
      if (
        utils.zeroOrMore(() => {
          utils.whitSpc();
          let ident: string | null;
          let identInQuotes: (Ast & { type: "StringLiteral" }) | null;
          let elem: Ast | null;
          if (
            (ident =
              utils.identifier() ??
              (() => {
                const identInQuotes = string();
                if (!identInQuotes) {
                  return null;
                }
                if (identInQuotes.__unclosed) {
                  throw new ParsingError(
                    input,
                    index,
                    "Non-terminating quoted string"
                  );
                }
                return identInQuotes.value;
              })()) !== null
          ) {
            if (utils.char(":") && ((elem = expression()) || graceful)) {
              dict[ident] = elem;
              wasComma = Boolean(utils.char(","));
              return elem;
            }
          } else if (wasComma && graceful) {
            // we ended on a ','
            dict[""] = null;
            return null;
          }
          return null;
        }) &&
        utils.whitSpc()
      ) {
        if (utils.char("}")) {
          return {
            type: "InlineMap",
            elements: dict,
          };
        } else if (graceful) {
          if (Object.keys(dict).length === 0) {
            return foundGracefulList ? returnGracefulList() : foundGracefulList;
          }
          return {
            type: "InlineMap",
            elements: dict,
            __unclosed: true,
          };
        }
      } else {
        index = fnbacktrack;
      }
      if (graceful && foundGracefulList) {
        return returnGracefulList();
      }
      throw new ParsingError(input, index, "Expected }");
    }
    return null;
  };

  // number : /\d+(?:\.\d+)?/
  const number = function (): Ast | null {
    utils.whitSpc();
    const str = utils.regExp(/\d+(?:\.\d+)?/);
    if (str) {
      return {
        type: "NumberLiteral",
        value: parseFloat(str),
      };
    }
    return null;
  };

  const result = expression();
  utils.whitSpc();
  if (index !== input.length && !graceful) {
    throw new ParsingError(
      input,
      index,
      "Expression Remaining",
      `input remaining: ${input.slice(index)}`
    );
  }
  if (result === null && !graceful) {
    throw new ParsingError(input, index, "Generic");
  }
  return result;
};
