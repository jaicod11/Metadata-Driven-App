// src/lib/runtime/expression.ts
//
// A deliberately tiny expression language for computed fields.
//
// The whole grammar is:
//
//   expression := term (("+" | "-") term)*
//   term       := factor (("*" | "/") factor)*
//   factor     := "-" factor | primary
//   primary    := number | string | fieldName | "(" expression ")"
//
// There are no function calls, no property access, no indexing, no assignment,
// and no way to name anything that isn't a field of the record being rendered.
// Identifiers resolve only against the caller's scope object, by own-property
// lookup, so nothing from Object.prototype is reachable.
//
// It is a hand-written tokeniser and recursive-descent parser on purpose:
// eval() and new Function() would hand user-supplied config the whole runtime.
// Nothing here throws — a malformed expression is an error string.

export type BinaryOperator = "+" | "-" | "*" | "/";

export type ExprNode =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "field"; name: string }
  | { kind: "unary"; operand: ExprNode }
  | { kind: "binary"; op: BinaryOperator; left: ExprNode; right: ExprNode };

export interface ParsedExpression {
  ast: ExprNode | null;
  error: string | null;
  /** Field names referenced, in first-seen order. */
  fields: string[];
}

/** Bounds, so a pathological config can't spin the parser. */
const MAX_LENGTH = 500;
const MAX_DEPTH = 32;

// ─── Tokeniser ────────────────────────────────────────────────────────────────

type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "field"; value: string }
  | { type: "op"; value: BinaryOperator | "(" | ")" };

class ExpressionError extends Error {}

function fail(message: string): never {
  throw new ExpressionError(message);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

function tokenise(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "(" || ch === ")") {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let value = "";
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < source.length) {
          const next = source[i + 1];
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          i += 2;
          continue;
        }
        value += source[i];
        i += 1;
      }
      if (i >= source.length) fail(`Unterminated string — missing a closing ${quote}`);
      i += 1; // closing quote
      tokens.push({ type: "string", value });
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      let raw = "";
      let seenDot = false;
      while (i < source.length && (isDigit(source[i]) || (source[i] === "." && !seenDot))) {
        if (source[i] === ".") seenDot = true;
        raw += source[i];
        i += 1;
      }
      const value = Number(raw);
      if (!isFinite(value)) fail(`"${raw}" is not a valid number`);
      tokens.push({ type: "number", value });
      continue;
    }

    if (isIdentStart(ch)) {
      let name = "";
      while (i < source.length && isIdentPart(source[i])) {
        name += source[i];
        i += 1;
      }
      tokens.push({ type: "field", value: name });
      continue;
    }

    fail(`Unexpected character "${ch}" at position ${i + 1}`);
  }

  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseTokens(tokens: Token[]): ExprNode {
  let position = 0;
  let depth = 0;

  const peek = (): Token | undefined => tokens[position];

  const eatOperator = (...ops: string[]): string | null => {
    const token = peek();
    if (token && token.type === "op" && ops.includes(token.value)) {
      position += 1;
      return token.value;
    }
    return null;
  };

  function parseExpr(): ExprNode {
    if (++depth > MAX_DEPTH) fail("Expression is nested too deeply");
    let left = parseTerm();
    let op: string | null;
    while ((op = eatOperator("+", "-"))) {
      left = { kind: "binary", op: op as BinaryOperator, left, right: parseTerm() };
    }
    depth -= 1;
    return left;
  }

  function parseTerm(): ExprNode {
    let left = parseFactor();
    let op: string | null;
    while ((op = eatOperator("*", "/"))) {
      left = { kind: "binary", op: op as BinaryOperator, left, right: parseFactor() };
    }
    return left;
  }

  function parseFactor(): ExprNode {
    if (eatOperator("-")) return { kind: "unary", operand: parseFactor() };
    return parsePrimary();
  }

  function parsePrimary(): ExprNode {
    const token = peek();
    if (!token) fail("Expression ends early — something is missing after the last operator");

    if (token.type === "number") {
      position += 1;
      return { kind: "number", value: token.value };
    }
    if (token.type === "string") {
      position += 1;
      return { kind: "string", value: token.value };
    }
    if (token.type === "field") {
      position += 1;
      return { kind: "field", name: token.value };
    }
    if (token.value === "(") {
      position += 1;
      const inner = parseExpr();
      if (!eatOperator(")")) fail("Missing a closing parenthesis");
      return inner;
    }

    fail(`Unexpected "${token.value}"`);
  }

  const ast = parseExpr();
  if (position < tokens.length) {
    const extra = tokens[position];
    fail(`Unexpected "${"value" in extra ? extra.value : ""}" after the end of the expression`);
  }
  return ast;
}

function collectFields(node: ExprNode, into: string[]) {
  switch (node.kind) {
    case "field":
      if (!into.includes(node.name)) into.push(node.name);
      return;
    case "unary":
      collectFields(node.operand, into);
      return;
    case "binary":
      collectFields(node.left, into);
      collectFields(node.right, into);
      return;
    default:
      return;
  }
}

// Parsing is pure, and the same handful of expressions is evaluated once per
// row, so results are cached by source text.
const cache = new Map<string, ParsedExpression>();

export function parseExpression(source: string): ParsedExpression {
  const cached = cache.get(source);
  if (cached) return cached;

  let result: ParsedExpression;
  try {
    if (typeof source !== "string" || source.trim() === "") {
      fail("Expression is empty");
    }
    if (source.length > MAX_LENGTH) {
      fail(`Expression is too long (max ${MAX_LENGTH} characters)`);
    }

    const ast = parseTokens(tokenise(source));
    const fields: string[] = [];
    collectFields(ast, fields);
    result = { ast, error: null, fields };
  } catch (err) {
    result = {
      ast: null,
      fields: [],
      error:
        err instanceof ExpressionError
          ? err.message
          : "Expression could not be parsed",
    };
  }

  cache.set(source, result);
  return result;
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/** Own-property lookup only — nothing inherited is reachable from an expression. */
function lookup(scope: Record<string, unknown>, name: string): unknown {
  if (name === "__proto__" || name === "constructor" || name === "prototype") {
    return undefined;
  }
  return Object.prototype.hasOwnProperty.call(scope, name)
    ? scope[name]
    : undefined;
}

/** Blank and missing values count as 0 in arithmetic. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  return Number(value);
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function evaluateNode(node: ExprNode, scope: Record<string, unknown>): unknown {
  switch (node.kind) {
    case "number":
      return node.value;
    case "string":
      return node.value;
    case "field":
      return lookup(scope, node.name);
    case "unary":
      return -toNumber(evaluateNode(node.operand, scope));
    case "binary": {
      const left = evaluateNode(node.left, scope);
      const right = evaluateNode(node.right, scope);

      // "+" concatenates as soon as either side is text, and adds otherwise.
      if (node.op === "+" && (typeof left === "string" || typeof right === "string")) {
        return toText(left) + toText(right);
      }

      const a = toNumber(left);
      const b = toNumber(right);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return b === 0 ? null : a / b;
      }
    }
  }
  return null;
}

/**
 * Evaluate a parsed expression against a record. Returns null rather than NaN,
 * Infinity or a thrown error, so a bad expression renders as blank.
 */
export function evaluateAst(
  ast: ExprNode,
  scope: Record<string, unknown>
): unknown {
  try {
    const value = evaluateNode(ast, scope);
    if (typeof value === "number" && !isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Parse (cached) and evaluate in one step. */
export function evaluateExpression(
  source: string,
  scope: Record<string, unknown>
): unknown {
  const parsed = parseExpression(source);
  if (!parsed.ast) return null;
  return evaluateAst(parsed.ast, scope);
}

/** Field names an expression reads — used to validate it at config load. */
export function expressionFields(source: string): string[] {
  return parseExpression(source).fields;
}
