/**
 * Where `parse(input, graceful, { offsets: true })` found a node: the half-open range
 * [start, end) of UTF-16 code units in the parsed string, so `input.slice(node.start, node.end)`
 * is the node's source text. Without `offsets` no node has them.
 *
 * - Leading and trailing whitespace is excluded.
 * - Parentheses around the node itself are excluded; a parent's range covers its children's
 *   parentheses. In `(a + b) * c` the OpPlus is `a + b` and the OpMultiply is the whole string.
 * - In a CompoundExpression, every component after the first includes its navigation syntax:
 *   `.b`, `?.b`, `.m(1)`, `['k']`, `?['k']`, `.![x]`, `?.?[x]`. Such a slice does not parse alone
 *   (prefix a start node, `x` + slice); every other node's slice re-parses to an AST equal to it.
 * - In graceful mode an incomplete node covers the text consumed for it.
 *
 * Both properties are non-enumerable: equality checks, JSON.stringify and object spread do not
 * see them, and nodes built or copied outside the parser have none.
 */
export type SourceRange = {
  start?: number;
  end?: number;
};

export type Ast = AstNode & SourceRange;

type AstNode =
  | {
      type: "StringLiteral";
      value: string;
      __unclosed?: true;
    }
  | {
      type: "Ternary";
      expression: Ast;
      ifTrue: Ast;
      ifFalse: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "VariableReference";
      variableName: string;
    }
  | {
      type: "SelectionFirst";
      nullSafeNavigation: boolean;
      expression: Ast;
      __unclosed?: true;
    }
  | {
      type: "SelectionLast";
      nullSafeNavigation: boolean;
      expression: Ast;
      __unclosed?: true;
    }
  | {
      type: "SelectionAll";
      nullSafeNavigation: boolean;
      expression: Ast;
      __unclosed?: true;
    }
  | {
      type: "PropertyReference";
      nullSafeNavigation: boolean;
      propertyName: string;
    }
  | {
      type: "Projection";
      nullSafeNavigation: boolean;
      expression: Ast;
      __unclosed?: true;
    }
  | {
      type: "OpPower";
      base: Ast;
      expression: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpPlus";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpOr";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpNot";
      expression: Ast;
    }
  | {
      type: "OpNE";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpMultiply";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpModulus";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpMinus";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpMatches";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpBetween";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpLT";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpLE";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpGT";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpGE";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpEQ";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpDivide";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "OpAnd";
      left: Ast;
      right: Ast;
      _isClosed?: boolean;
    }
  | {
      type: "Negative";
      value: Ast;
    }
  | {
      type: "NumberLiteral";
      value: number;
    }
  | {
      type: "NullLiteral";
    }
  | {
      type: "MethodReference";
      nullSafeNavigation: boolean;
      methodName: string;
      args: (Ast | null)[]; // null if graceful
      __unclosed?: true;
    }
  | {
      type: "FunctionReference";
      nullSafeNavigation: boolean;
      functionName: string;
      args: Ast[];
      __unclosed?: true;
    }
  | {
      type: "InlineMap";
      elements: {
        [elem: string]: Ast;
      };
      __unclosed?: true;
    }
  | {
      type: "InlineList";
      elements: Ast[];
      __unclosed?: true;
    }
  | {
      type: "Indexer";
      nullSafeNavigation: boolean;
      index: Ast;
      __unclosed?: true;
    }
  | {
      type: "Elvis";
      expression: Ast;
      ifFalse: Ast;
      _isClosed?: boolean;
    }
  | {
      // Represents a dot-separated expression sequence, such as 'property1.property2.methodOne()'
      type: "CompoundExpression";
      expressionComponents: Ast[];
    }
  | {
      type: "BooleanLiteral";
      value: boolean;
    };
