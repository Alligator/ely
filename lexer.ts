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
  Comma = "Comma",
  Colon = "Colon",

  LParen = "LParen",
  RParen = "RParen",
  LSquare = "LSquare",
  RSquare = "RSquare",
  LCurly = "LCurly",
  RCurly = "RCurly",

  Function = "Function",
  Return = "Return",

  While = "While",
  Do = "Do",
  Break = "Break",

  If = "If",
  Else = "Else",
  ElseIf = "ElseIf",
  Then = "Then",

  End = "End",

  And = "And",
  Or = "Or",
  Not = "Not",

  True = "True",
  False = "False",

  Error = "Error",
};

interface TokenSimple {
  type: TokenSimpleType;
  line: number;
}
type TokenSimpleType
  = TokenType.EOF
  | TokenType.Var
  | TokenType.Equal
  | TokenType.EqualEqual
  | TokenType.BangEqual
  | TokenType.Plus
  | TokenType.Minus
  | TokenType.Star
  | TokenType.Slash
  | TokenType.Greater
  | TokenType.Less
  | TokenType.Comma
  | TokenType.Colon
  | TokenType.LParen
  | TokenType.RParen
  | TokenType.LSquare
  | TokenType.RSquare
  | TokenType.LCurly
  | TokenType.RCurly
  | TokenType.Function
  | TokenType.Return
  | TokenType.While
  | TokenType.Do
  | TokenType.Break
  | TokenType.If
  | TokenType.Else
  | TokenType.ElseIf
  | TokenType.Then
  | TokenType.End
  | TokenType.And
  | TokenType.Or
  | TokenType.Not
  | TokenType.True
  | TokenType.False
  | TokenType.Error

interface TokenStringValue {
  type: TokenStringValueType;
  value: string;
  line: number;
}

type TokenStringValueType = TokenType.Identifier | TokenType.String | TokenType.Number;

type Token
  = TokenSimple
  | TokenStringValue;

function tokenToString(token: Token): string {
  if (
    token.type === TokenType.Identifier
    || token.type === TokenType.String
    || token.type === TokenType.Number
  ) {
    return `${token.type}(${token.value})`;
  }

  return token.type;
}

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

  private simpleToken(type: TokenSimpleType): TokenSimple {
    return {
      type,
      line: this.line,
    };
  }

  private stringValueToken(type: TokenStringValueType, value: string): TokenStringValue {
    return {
      type,
      value,
      line: this.line,
    };
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
        case '#': {
          // comments
          while (!this.isAtEnd && this.peek() !== '\n') {
            this.advance();
          }
          break;
        }
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

      case "function": return this.simpleToken(TokenType.Function);
      case "return":   return this.simpleToken(TokenType.Return);

      case "var":   return this.simpleToken(TokenType.Var);
      case "while": return this.simpleToken(TokenType.While);
      case "do":    return this.simpleToken(TokenType.Do);
      case "break": return this.simpleToken(TokenType.Break);

      case "if":    return this.simpleToken(TokenType.If);
      case "then":  return this.simpleToken(TokenType.Then);
      case "else":  return this.simpleToken(TokenType.Else);
      case "elseif":return this.simpleToken(TokenType.ElseIf);

      case "end":   return this.simpleToken(TokenType.End);

      case "true":  return this.simpleToken(TokenType.True);
      case "false": return this.simpleToken(TokenType.False);

      case "and":   return this.simpleToken(TokenType.And);
      case "or":    return this.simpleToken(TokenType.Or);
      case "not":   return this.simpleToken(TokenType.Not);

      default:
        return this.stringValueToken(TokenType.Identifier, this.source.substring(this.start, this.pos));
    }

  }

  private string(): Token {
    while (this.peek() !== `"`) {
      this.advance();
    }
    this.advance(); // consume the closing quote
    return this.stringValueToken(TokenType.String, this.source.substring(this.start + 1, this.pos - 1));
  }

  private number(): Token {
    while (this.isNumeric(this.peek()) || this.peek() === ".") {
      this.advance();
    }

    return this.stringValueToken(TokenType.Number, this.source.substring(this.start, this.pos));
  }


  getMessageAtCurrentToken(msg: string): string {
    let lineStart = this.pos;
    let lineEnd = this.pos;

    if (this.pos === this.source.length) {
      lineStart--;
      lineEnd--;
    }

    while (lineStart > 0 && this.source[lineStart - 1] !== '\n') {
      lineStart--;
    }

    while (lineEnd < this.source.length && this.source[lineEnd] !== '\n') {
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
      return this.simpleToken(TokenType.EOF);
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
          return this.simpleToken(TokenType.EqualEqual);
        }
        return this.simpleToken(TokenType.Equal);
      }

      case '!': {
        if (this.peek() === '=') {
          this.advance();
          return this.simpleToken(TokenType.BangEqual);
        }
        break;
      }

      case '"': return this.string();
      case '(': return this.simpleToken(TokenType.LParen);
      case ')': return this.simpleToken(TokenType.RParen);
      case '[': return this.simpleToken(TokenType.LSquare);
      case ']': return this.simpleToken(TokenType.RSquare);
      case '{': return this.simpleToken(TokenType.LCurly);
      case '}': return this.simpleToken(TokenType.RCurly);
      case '+': return this.simpleToken(TokenType.Plus);
      case '-': return this.simpleToken(TokenType.Minus);
      case '>': return this.simpleToken(TokenType.Greater);
      case '<': return this.simpleToken(TokenType.Less);
      case '*': return this.simpleToken(TokenType.Star);
      case '/': return this.simpleToken(TokenType.Slash);
      case ',': return this.simpleToken(TokenType.Comma);
      case ':': return this.simpleToken(TokenType.Colon);
    }

    this.fatal(`unexpected character ${JSON.stringify(c)}`);

    throw new Error("unreachable");
  }
}

export {
  Lexer,
  Token,
  TokenType,
  tokenToString,
};
