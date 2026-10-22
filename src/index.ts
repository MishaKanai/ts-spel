import { getEvaluator } from "./lib/Evaluate";
import { parse } from "./lib/ParseToAst";
import { ForbiddenAccessError } from "./lib/CustomErrors";
import prettyPrint from "./lib/prettyPrint";

export type { Ast, SourceRange } from "./lib/Ast";
export type { ParseOptions } from "./lib/ParseToAst";
export { parse, getEvaluator, ForbiddenAccessError, prettyPrint };
