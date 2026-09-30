// A small, dependency-free expression evaluator for the on-screen scientific calculator.
// Deliberately not using eval()/Function() — the grammar below is hand-rolled recursive
// descent so we control exactly what's accepted (numbers, + - * / ^ %, parentheses,
// sin/cos/tan/log/ln/sqrt, and the constants pi/e) rather than executing arbitrary JS.

export type AngleMode = "deg" | "rad";

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "^" | "%" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "func"; value: "sin" | "cos" | "tan" | "log" | "ln" | "sqrt" }
  | { type: "const"; value: "pi" | "e" };

const FUNC_NAMES = ["sin", "cos", "tan", "log", "ln", "sqrt"] as const;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  // Normalize the display glyphs the calculator buttons insert into ASCII the tokenizer understands.
  const src = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/√/g, "sqrt").replace(/π/g, "pi");

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const numStr = src.slice(i, j);
      if ((numStr.match(/\./g) ?? []).length > 1) throw new Error("Invalid number");
      tokens.push({ type: "num", value: parseFloat(numStr) });
      i = j;
      continue;
    }
    if ("+-*/^%".includes(ch)) {
      tokens.push({ type: "op", value: ch as "+" | "-" | "*" | "/" | "^" | "%" });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    const rest = src.slice(i);
    const func = FUNC_NAMES.find((f) => rest.startsWith(f));
    if (func) {
      tokens.push({ type: "func", value: func });
      i += func.length;
      continue;
    }
    if (rest.startsWith("pi")) {
      tokens.push({ type: "const", value: "pi" });
      i += 2;
      continue;
    }
    if (ch === "e") {
      tokens.push({ type: "const", value: "e" });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private angleMode: AngleMode) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): number {
    const value = this.parseExpression();
    if (this.pos < this.tokens.length) throw new Error("Unexpected trailing input");
    return value;
  }

  // expression := term (('+' | '-') term)*
  private parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t?.type === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        const rhs = this.parseTerm();
        value = t.value === "+" ? value + rhs : value - rhs;
      } else {
        break;
      }
    }
    return value;
  }

  // term := unary (('*' | '/') unary)*
  private parseTerm(): number {
    let value = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t?.type === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        const rhs = this.parseUnary();
        if (t.value === "/" && rhs === 0) throw new Error("Division by zero");
        value = t.value === "*" ? value * rhs : value / rhs;
      } else {
        break;
      }
    }
    return value;
  }

  // unary := '-' unary | power
  private parseUnary(): number {
    const t = this.peek();
    if (t?.type === "op" && t.value === "-") {
      this.next();
      return -this.parseUnary();
    }
    return this.parsePower();
  }

  // power := postfix ('^' unary)?   (right-associative, unary RHS so 2^-1 works)
  private parsePower(): number {
    const base = this.parsePostfix();
    const t = this.peek();
    if (t?.type === "op" && t.value === "^") {
      this.next();
      const exp = this.parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  // postfix := primary ('%')*   (percent = divide by 100, e.g. "50%" -> 0.5)
  private parsePostfix(): number {
    let value = this.parsePrimary();
    while (this.peek()?.type === "op" && (this.peek() as any).value === "%") {
      this.next();
      value = value / 100;
    }
    return value;
  }

  // primary := number | const | func '(' expression ')' | '(' expression ')'
  private parsePrimary(): number {
    const t = this.next();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.type === "num") return t.value;
    if (t.type === "const") return t.value === "pi" ? Math.PI : Math.E;
    if (t.type === "lparen") {
      const value = this.parseExpression();
      if (this.next()?.type !== "rparen") throw new Error("Missing closing parenthesis");
      return value;
    }
    if (t.type === "func") {
      if (this.next()?.type !== "lparen") throw new Error(`Expected '(' after ${t.value}`);
      const arg = this.parseExpression();
      if (this.next()?.type !== "rparen") throw new Error("Missing closing parenthesis");
      return this.applyFunc(t.value, arg);
    }
    throw new Error("Unexpected token");
  }

  private applyFunc(name: (typeof FUNC_NAMES)[number], arg: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    switch (name) {
      case "sin":
        return Math.sin(this.angleMode === "deg" ? toRad(arg) : arg);
      case "cos":
        return Math.cos(this.angleMode === "deg" ? toRad(arg) : arg);
      case "tan":
        return Math.tan(this.angleMode === "deg" ? toRad(arg) : arg);
      case "log":
        if (arg <= 0) throw new Error("log of non-positive number");
        return Math.log10(arg);
      case "ln":
        if (arg <= 0) throw new Error("ln of non-positive number");
        return Math.log(arg);
      case "sqrt":
        if (arg < 0) throw new Error("sqrt of negative number");
        return Math.sqrt(arg);
    }
  }
}

/** Throws on any malformed input — callers should catch and show a friendly "Error" state. */
export function evaluateExpression(expr: string, angleMode: AngleMode): number {
  if (!expr.trim()) return 0;
  const tokens = tokenize(expr);
  if (tokens.length === 0) return 0;
  const result = new Parser(tokens, angleMode).parse();
  if (!Number.isFinite(result)) throw new Error("Result is not finite");
  return result;
}
