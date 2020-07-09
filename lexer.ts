enum TokenType {
  EOF = "EOF",
  Identifier = "Identifier",
  Var = "Var",
  String = "String",
  Number = "Number",

  Equal = "Equal",
  EqualEqual = "EqualEqual",
  BangEqual = "BangEqual",
  Plus = "Plus",
  Minus = "Minus",
  Star = "Star",
  Slash = "Slash",
  Greater = "Greater",
  Less = "Less",

  LParen = "LParen",
  RParen = "RParen",

  While = "While",
  Do = "Do",
  Break = "Break",

  If = "If",
  Else = "Else",
  Then = "Then",

  End = "End",

  True = "True",
  False = "False",

  Error = "Error",
};

interface TokenSimple {
  type: TokenType.EOF
    | TokenType.Var
    | TokenType.Equal | TokenType.EqualEqual | TokenType.BangEqual
    | TokenType.Plus | TokenType.Minus | TokenType.Greater | TokenType.Less
    | TokenType.Star | TokenType.Slash
    | TokenType.LParen | TokenType.RParen
    | TokenType.While | TokenType.Do | TokenType.Break
    | TokenType.If | TokenType.Then | TokenType.Else
    | TokenType.True | TokenType.False
    | TokenType.End | TokenType.Error;
}
interface TokenStringValue {
  type: TokenType.Identifier | TokenType.String | TokenType.Number;
  value: string;
}

type Token
  = TokenSimple
  | TokenStringValue;


class Lexer {
  source: string;
  pos: number = 0;
  start: number = 0;
  line: number = 1;

  constructor(source: string) {
    this.source = source;
  }

  private get isAtEnd() {
    return this.pos >= this.source.length;
  }


  private advance(): string {
    if (this.isAtEnd) {
      throw new Error("lex: ran out of input");
    }
    return this.source[this.pos++];
  }

  private peek(offset: number = 0): string {
    return this.source[this.pos + offset];
  }

  private skipWhitespace() {
    while (true) {
      switch (this.peek()) {
        case ' ':  // intentional fallthrough
        case '\t':
          this.advance();
          break;
        case '\n':
          this.line++;
          this.advance();
          break;
        case '\r':
          if (this.peek(1) === '\n') {
            this.line++;
            this.advance();
            this.advance();
          }
          break;
        default:
          return;
      }
    }
  }

  private isAlpha(c: string): boolean {
    if (typeof c === "undefined") {
      return false;
    }
    return /[a-zA-Z]/.test(c);
  }
  private isNumeric(c: string): boolean {
    if (typeof c === "undefined") {
      return false;
    }
    return /[0-9]/.test(c);
  }


  private identifier(): Token {
    while (this.isAlpha(this.peek()) || this.peek() === '_') {
      this.advance();
    }

    const value = this.source.substring(this.start, this.pos);

    switch (value) {

      case "var":   return { type: TokenType.Var };
      case "while": return { type: TokenType.While };
      case "do":    return { type: TokenType.Do };
      case "break": return { type: TokenType.Break };

      case "if":    return { type: TokenType.If };
      case "then":  return { type: TokenType.Then };
      case "else":  return { type: TokenType.Else };

      case "end":   return { type: TokenType.End };

      case "true":  return { type: TokenType.True };
      case "false": return { type: TokenType.False };

      default:
        return {
          type: TokenType.Identifier,
          value: this.source.substring(this.start, this.pos),
        };
    }

  }

  private string(): Token {
    while (this.peek() !== `"`) {
      this.advance();
    }
    this.advance(); // consume the closing quote
    return {
      type: TokenType.String,
      value: this.source.substring(this.start + 1, this.pos - 1),
    };
  }

  private number(): Token {
    while (this.isNumeric(this.peek()) || this.peek() === ".") {
      this.advance();
    }

    return {
      type: TokenType.Number,
      value: this.source.substring(this.start, this.pos),
    };
  }


  getMessageAtCurrentToken(msg: string): string {
    let lineStart = this.pos;
    let lineEnd = this.pos;

    while (lineStart > 0 && this.source[lineStart - 1] !== '\n') {
      lineStart--;
    }

    while (lineEnd < this.source.length && this.source[lineEnd + 1] !== '\n') {
      lineEnd++;
    }

    let errMsg = `flagrant error on line ${this.line}\n`;
    errMsg += `${msg}\n`;
    errMsg += `    ${this.source.substring(lineStart, lineEnd)}\n    `;
    errMsg += new Array(this.pos - lineStart - 1).fill(' ').join('');
    errMsg += '^';

    return errMsg;
  }

  private fatal(msg: string) {
    throw new Error(this.getMessageAtCurrentToken(msg));
  }


  nextToken(): Token {
    this.skipWhitespace();
    this.start = this.pos;

    if (this.isAtEnd) {
      return { type: TokenType.EOF };
    }

    const c = this.advance();

    if (this.isAlpha(c)) {
      return this.identifier();
    }

    if (this.isNumeric(c)) {
      return this.number();
    }

    switch (c) {
      case '=': {
        if (this.peek() === '=') {
          this.advance();
          return { type: TokenType.EqualEqual };
        }
        return { type : TokenType.Equal };
      }

      case '!': {
        if (this.peek() === '=') {
          this.advance();
          return { type: TokenType.BangEqual };
        }
        break;
      }

      case '"': return this.string();
      case '(': return { type: TokenType.LParen };
      case ')': return { type: TokenType.RParen };
      case '+': return { type: TokenType.Plus };
      case '-': return { type: TokenType.Minus };
      case '>': return { type: TokenType.Greater };
      case '<': return { type: TokenType.Less };
      case '*': return { type: TokenType.Star };
      case '/': return { type: TokenType.Slash };
    }

    this.fatal(`unexpected character ${JSON.stringify(c)}`);

    throw new Error("unreachable");
  }
}

export {
  Lexer,
  Token,
  TokenType,
};