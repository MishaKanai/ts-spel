import { Ast } from "./Ast";

type Some<R = unknown> = {
  _tag: "some";
  isSome: true;
  value: R;
};
const some = <R = unknown>(value: R): Some<R> => ({
  _tag: "some",
  isSome: true,
  value,
});

const none = {
  _tag: "none",
  isSome: false,
} as const;

type None = typeof none;

type Maybe<R = unknown> = Some<R> | None;

const isSome = <R = unknown>(maybe: Maybe<R>): maybe is Some<R> => {
  return maybe._tag === "some";
};
const isNone = <R = unknown>(maybe: Maybe<R>): maybe is None => {
  return maybe._tag === "none";
};

const maybeFromUndefined = (value: unknown) => {
  if (typeof value === "undefined") {
    return none;
  }
  return some(value);
};

export const getEvaluator = (
  rootContext: Record<string, unknown>,
  functionsAndVariables: Record<string, unknown>
) => {
  const stack: unknown[] = [rootContext]; // <- could be a class.
  const getHead = () => {
    if (stack.length > 0) {
      return stack[stack.length - 1];
    }
    throw new Error("Stack is empty.");
  };
  const getValueInProvidedFuncsAndVars = (variableName: string): Maybe => {
    if (variableName === "this") {
      return some(getHead());
    } else if (variableName === "root") {
      return some(stack[0]);
    } else {
      return maybeFromUndefined(functionsAndVariables[variableName]);
    }
  };
  const getPropertyValueInContext = (variable: string): Maybe => {
    return stack.reduce<Maybe>((prev, curr) => {
      if (isSome(prev)) {
        return prev;
      } else if (variable === "this") {
        return some(curr);
      } else if (curr !== null && typeof curr !== "undefined") {
        return maybeFromUndefined(curr[variable]);
      } else {
        return none;
      }
    }, none);
  };
  const binFloatOp = <Out extends number | boolean>(
    op: (a: number, b: number) => Out
  ) => (_left: Ast, _right: Ast) => {
    const left = evaluate(_left);
    const right = evaluate(_right);
    if (typeof left !== "number") {
      throw new Error(JSON.stringify(left) + " is not a float");
    }
    if (typeof right !== "number") {
      throw new Error(JSON.stringify(right) + " is not a float");
    }
    return op(left, right);
  };
  const binStringOp = <Out extends number | boolean>(
    op: (a: string, b: string) => Out
  ) => (_left: Ast, _right: Ast) => {
    const left = evaluate(_left);
    const right = evaluate(_right);
    if (typeof left !== "string") {
      throw new Error(JSON.stringify(left) + " is not a string");
    }
    if (typeof right !== "string") {
      throw new Error(JSON.stringify(right) + " is not a string");
    }
    return op(left, right);
  };
  const find = <E extends unknown>(
    array: E[],
    expression: Ast,
    reverse: boolean
  ) => {
    const value = reverse ? array.reverse() : array;
    const result = value.find((e) => {
      stack.push(e);
      const result = evaluate(expression);
      stack.pop();
      if (typeof result !== "boolean") {
        throw new Error("Result of selection expression is not Boolean");
      }
      return result === true;
    });
    return typeof result === "undefined" ? null : result;
  };
  const evaluate = (ast: Ast): unknown => {
    switch (ast.type) {
      case "BooleanLiteral":
        return ast.value;
      case "CompoundExpression": {
        const res = ast.expressionComponents.reduce((_, curr) => {
          const res = evaluate(curr);
          stack.push(res);
          return res;
        }, rootContext);
        ast.expressionComponents.forEach(() => {
          stack.pop();
        });
        return res;
      }
      case "Elvis": {
        const expr = evaluate(ast.expression);
        if (expr === null) {
          return evaluate(ast.ifFalse);
        } else {
          return expr;
        }
      }
      case "FunctionReference": {
        const maybeProvidedFunction = getValueInProvidedFuncsAndVars(
          ast.functionName
        );
        const evaluatedArguments = ast.args.map(evaluate);
        if (isNone(maybeProvidedFunction)) {
          if (!ast.nullSafeNavigation) {
            throw new Error("Method " + ast.functionName + " not found.");
          } else {
            return null;
          }
        }
        const { value } = maybeProvidedFunction;
        if (typeof value !== "function") {
          throw new Error(
            "Variable " + ast.functionName + " is not a function."
          );
        }
        return value(...evaluatedArguments);
      }
      case "Indexer": {
        const head = getHead();
        if (head === null && ast.nullSafeNavigation) {
          return null;
        }
        const index = evaluate(ast.index);
        if (typeof head === "string" && typeof index === "number") {
          if (index >= 0 && index < head.length) {
            return head[index];
          }
          throw new Error(
            "index " +
              index +
              " is out of range on string " +
              JSON.stringify(head)
          );
        } else if (Array.isArray(head) && typeof index === "number") {
          if (index >= 0 && index < head.length) {
            return head[index];
          }
          throw new Error(
            "index " +
              index +
              " is out of range on array " +
              JSON.stringify(head)
          );
        } else if (
          head &&
          typeof head === "object" &&
          (typeof index === "string" || typeof index === "number")
        ) {
          if (Object.prototype.hasOwnProperty.call(head, index)) {
            return head[index];
          } else {
            throw new Error(
              "key " +
                index +
                " not found in dictionary " +
                JSON.stringify(head)
            );
          }
        }
        throw new Error(
          "Not supported: indexing into " +
            JSON.stringify(head) +
            " with " +
            JSON.stringify(index)
        );
      }
      case "InlineList": {
        return ast.elements.map(evaluate);
      }
      case "InlineMap": {
        return Object.entries(ast.elements).reduce((prev, [k, v]) => {
          prev[k] = evaluate(v);
          return prev;
        }, {});
      }
      case "MethodReference": {
        const valueInContext = getPropertyValueInContext(ast.methodName);
        if (isSome(valueInContext)) {
          const { value } = valueInContext;
          const evaluatedArguments = ast.args.map(evaluate); // <- arguments are evaluated lazily
          if (typeof value === "function") {
            return value(...evaluatedArguments);
          }
        } else {
          const currentContext = getHead();
          if (Array.isArray(currentContext)) {
            if (ast.methodName === "size") {
              return currentContext.length;
            }
            if (ast.methodName === "contains") {
              return currentContext.includes(evaluate(ast.args[0]));
            }
          }
          if (!ast.nullSafeNavigation) {
            throw new Error("Method " + ast.methodName + " not found.");
          }
        }
        return null;
      }
      case "Negative": {
        const operand = evaluate(ast.value);
        if (typeof operand === "number") {
          return operand * -1;
        }
        throw new Error(
          "unary (-) operator applied to " + JSON.stringify(operand)
        );
      }
      case "NullLiteral": {
        return null;
      }
      case "NumberLiteral": {
        return ast.value;
      }
      case "OpAnd": {
        const left = evaluate(ast.left);
        const right = evaluate(ast.right);
        // maybe remove checks so we can do 0, '', etc. checks as well.
        if (left !== null && typeof left !== "boolean") {
          throw new Error(JSON.stringify(left) + " is not a null/boolean");
        }
        if (right !== null && typeof right !== "boolean") {
          throw new Error(JSON.stringify(right) + " is not a null/boolean");
        }
        return left && right;
      }
      case "OpDivide": {
        return binFloatOp((a, b) => a / b)(ast.left, ast.right);
      }
      case "OpEQ": {
        const left = evaluate(ast.left);
        const right = evaluate(ast.right);
        // boolean, number, string, null
        return left === right;
      }
      case "OpGE": {
        return binFloatOp((a, b) => a >= b)(ast.left, ast.right);
      }
      case "OpGT": {
        return binFloatOp((a, b) => a > b)(ast.left, ast.right);
      }
      case "OpLE": {
        return binFloatOp((a, b) => a <= b)(ast.left, ast.right);
      }
      case "OpLT": {
        return binFloatOp((a, b) => a < b)(ast.left, ast.right);
      }
      case "OpMatches": {
        return binStringOp((a, b) => RegExp(b).test(a))(ast.left, ast.right);
      }
      case "OpBetween": {
        const left = evaluate(ast.left);
        const right = evaluate(ast.right);
        if (!Array.isArray(right) || right.length !== 2) {
          throw new Error(
            "Right operand for the between operator has to be a two-element list"
          );
        }
        const [firstValue, secondValue] = right;

        return firstValue <= left && left <= secondValue;
      }
      case "OpMinus": {
        return binFloatOp((a, b) => a - b)(ast.left, ast.right);
      }
      case "OpModulus": {
        return binFloatOp((a, b) => a % b)(ast.left, ast.right);
      }
      case "OpMultiply": {
        return binFloatOp((a, b) => a * b)(ast.left, ast.right);
      }
      case "OpNE": {
        const left = evaluate(ast.left);
        const right = evaluate(ast.right);
        // boolean, number, string, null
        return left !== right;
      }
      case "OpNot": {
        const exp = evaluate(ast.expression);
        return !exp;
      }
      case "OpOr": {
        const left = evaluate(ast.left);
        const right = evaluate(ast.right);
        return Boolean(left || right);
      }
      case "OpPlus": {
        return binFloatOp((a, b) => a + b)(ast.left, ast.right);
      }
      case "OpPower": {
        return binFloatOp((a, b) => a ** b)(ast.base, ast.expression);
      }
      case "Projection": {
        const { nullSafeNavigation, expression } = ast;
        const head = getHead();
        if (head === null && nullSafeNavigation) {
          return null;
        }
        if (Array.isArray(head)) {
          return head.map((v) => {
            stack.push(v);
            const result = evaluate(expression);
            stack.pop();
            return result;
          });
        }
        if (head && typeof head === "object") {
          return Object.values(head).map((v) => {
            stack.push(v);
            const result = evaluate(expression);
            stack.pop();
            return result;
          });
        }
        throw new Error(
          "Cannot run expression on non-array " + JSON.stringify(head)
        );
      }
      case "PropertyReference": {
        const { nullSafeNavigation, propertyName } = ast;
        const valueInContext: Maybe<unknown> = getPropertyValueInContext(
          propertyName
        );
        if (isNone(valueInContext)) {
          if (nullSafeNavigation) {
            return null;
          }
          throw new Error(
            "Null Pointer Exception: Property " +
              JSON.stringify(propertyName) +
              " not found in context " +
              JSON.stringify(stack)
          );
        }
        return valueInContext.value;
      }
      case "SelectionAll": {
        const { nullSafeNavigation, expression } = ast;
        const head = getHead();
        if (head === null && nullSafeNavigation) {
          return null;
        }
        if (Array.isArray(head)) {
          return head.filter((v, i) => {
            stack.push(v);
            const result = evaluate(expression);
            stack.pop();
            if (typeof result !== "boolean") {
              throw new Error(
                "Result " +
                  JSON.stringify(result) +
                  " at index " +
                  i +
                  " of selection expression is not Boolean"
              );
            }
            return result === true;
          });
        }
        if (head && typeof head === "object") {
          // pojo
          return Object.fromEntries(
            Object.entries(head).filter(([key, value], i) => {
              stack.push({ key, value });
              const result = evaluate(expression);
              stack.pop();
              if (typeof result !== "boolean") {
                throw new Error(
                  "Result " +
                    JSON.stringify(result) +
                    " at index " +
                    i +
                    " of selection expression is not Boolean"
                );
              }
              return result === true;
            })
          );
        }
        throw new Error(
          "Cannot run selection expression on non-collection " +
            JSON.stringify(head)
        );
      }
      case "SelectionFirst": {
        const { nullSafeNavigation, expression } = ast;
        const head = getHead();
        if (head === null && nullSafeNavigation) {
          return null;
        }

        if (Array.isArray(head)) {
          return find(head, expression, false);
        }
        if (head && typeof head === "object") {
          const result = find(
            Object.entries(head).map(([key, value]) => ({ key, value })),
            expression,
            false
          );
          return result && { [result.key]: result.value };
        }
        throw new Error(
          "Cannot run selection expression on non-array " + JSON.stringify(head)
        );
      }
      case "SelectionLast": {
        const { nullSafeNavigation, expression } = ast;
        const head = getHead();
        if (head === null && nullSafeNavigation) {
          return null;
        }

        if (Array.isArray(head)) {
          return find(head, expression, true);
        }
        if (head && typeof head === "object") {
          const result = find(
            Object.entries(head).map(([key, value]) => ({ key, value })),
            expression,
            true
          );
          return result && { [result.key]: result.value };
        }
        throw new Error(
          "Cannot run selection expression on non-array " + JSON.stringify(head)
        );
      }
      case "StringLiteral": {
        return ast.value;
      }
      case "Ternary": {
        const { expression, ifTrue, ifFalse } = ast;
        const conditionResult = evaluate(expression);
        if (conditionResult === true) {
          return evaluate(ifTrue);
        } else if (conditionResult === false || conditionResult === null) {
          return evaluate(ifFalse);
        } else {
          throw new Error(
            "Unexpected non boolean/null in Ternary conditional expression: " +
              JSON.stringify(conditionResult)
          );
        }
      }
      case "VariableReference": {
        const valueInFuncsAndVars = getValueInProvidedFuncsAndVars(
          ast.variableName
        );
        if (isNone(valueInFuncsAndVars)) {
          throw new Error(
            "Null Pointer Exception: variable " +
              JSON.stringify(ast.variableName) +
              " not found"
          );
        }
        return valueInFuncsAndVars.value;
      }
    }
  };
  return evaluate;
};
