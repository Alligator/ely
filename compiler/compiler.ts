import { Lexer, TokenType, Token } from "../lexer.ts";
import { RawValue, createValue, Value } from "../vm/value.ts";
import { OpCode } from "../vm/vm.ts";

enum Precedence {
  None,
  Assignment,
  Equality,
  Comparison,
  Sum,
  Product,
  Unary,
  Call,
}

type Rule = {
  prefixFn?: (c: Compiler) => void;
  infixFn?: (c: Compiler, token: Token) => void;
  prec: Precedence;
};

const rules: { [K in TokenType]: Rule } = {
  [TokenType.Number]:     { prec: Precedence.None,        prefixFn: c => c.number()                                      },
  [TokenType.ColonEqual]: { prec: Precedence.Assignment,                                                                 },
  [TokenType.EqualEqual]: { prec: Precedence.Equality,                                   infixFn: c => c.binary()        },
  [TokenType.BangEqual]:  { prec: Precedence.Equality,                                   infixFn: c => c.binary()        },
  [TokenType.Plus]:       { prec: Precedence.Sum,                                        infixFn: c => c.binary()        },
  [TokenType.Star]:       { prec: Precedence.Product,                                    infixFn: c => c.binary()        },
  [TokenType.Slash]:      { prec: Precedence.Product,                                    infixFn: c => c.binary()        },
  [TokenType.Greater]:    { prec: Precedence.Comparison,                                 infixFn: c => c.binary()        },
  [TokenType.Less]:       { prec: Precedence.Comparison,                                 infixFn: c => c.binary()        },
  [TokenType.LParen]:     { prec: Precedence.Call,                                       infixFn: c => c.functionCall()  },
  [TokenType.Identifier]: { prec: Precedence.None,        prefixFn: c => c.identifier()                                  },
  [TokenType.String]:     { prec: Precedence.None,        prefixFn: c => c.literal()                                     },
  [TokenType.True]:       { prec: Precedence.None,        prefixFn: c => c.literal()                                     },
  [TokenType.False]:      { prec: Precedence.None,        prefixFn: c => c.literal()                                     },
  [TokenType.EOF]:        { prec: Precedence.None                                                                        },
  [TokenType.Var]:        { prec: Precedence.None                                                                        },
  [TokenType.Equal]:      { prec: Precedence.None                                                                        },
  [TokenType.RParen]:     { prec: Precedence.None                                                                        },
  [TokenType.While]:      { prec: Precedence.None                                                                        },
  [TokenType.Do]:         { prec: Precedence.None                                                                        },
  [TokenType.Break]:      { prec: Precedence.None                                                                        },
  [TokenType.If]:         { prec: Precedence.None                                                                        },
  [TokenType.Else]:       { prec: Precedence.None                                                                        },
  [TokenType.Then]:       { prec: Precedence.None                                                                        },
  [TokenType.End]:        { prec: Precedence.None                                                                        },
  [TokenType.Error]:      { prec: Precedence.None                                                                        },
};

class Compiler {
  output: Array<RawValue> = [];
  lexer: Lexer;
  current: Token = { type: TokenType.Error }
  previous: Token = { type: TokenType.Error }
  debug: boolean = false;

  constructor() {
    this.lexer = new Lexer("");
  }


  debugLog(msg: string) {
    if (this.debug) {
      console.error(`${msg}\n   cur: ${JSON.stringify(this.current)}\n  prev: ${JSON.stringify(this.previous)}`);
    }
  }


  advance() {
    this.previous = this.current;
    this.current = this.lexer.nextToken();
  }

  consume(type: TokenType) {
    if (this.current?.type === type) {
      this.advance();
      return;
    }

    throw new Error(`expected ${type} but found ${this.current?.type}`);
  }


  emit(rawVal: RawValue) {
    this.output.push(rawVal);
  }

  emitConstant(val: Value) {
    this.emit(OpCode.Constant);
    this.emit(val.value);
  }


  number() {
    if (this.previous && this.previous.type === TokenType.Number) {
      const value = createValue(parseInt(this.previous.value, 10));
      this.emitConstant(value);
      return;
    }

    throw new Error(`expected a number but found ${this.previous}`);
  }

  statement() {
    this.debugLog('statement');

    switch (this.current.type) {
      case TokenType.Var: {
        this.consume(TokenType.Var);

        // parse var declaration
        this.consume(TokenType.Identifier);
        const name = this.previous;

        if (name.type === TokenType.Identifier) {
          this.consume(TokenType.ColonEqual);

          this.expression();

          this.emit(OpCode.DefineLocal);
          this.emit(name.value);
        }
        break;
      }

      case TokenType.While: {
        this.consume(TokenType.While);

        const startPos = this.output.length;

        this.expression();
        this.consume(TokenType.Do);

        this.emit(OpCode.JumpIfFalse);
        const endJump = this.output.length;
        this.emit(999);

        this.block();

        this.emit(OpCode.Jump);
        this.emit(startPos);

        const endPos = this.output.length;
        this.output[endJump] = endPos;
        break;
      }

      case TokenType.If: {
        this.consume(TokenType.If);

        this.expression();
        this.consume(TokenType.Then);

        this.emit(OpCode.JumpIfFalse);
        const endJump = this.output.length;
        this.emit(999);

        this.block();

        const endPos = this.output.length;
        this.output[endJump] = endPos;
        break;
      }

      case TokenType.Identifier: {
        this.expression();
        break;
      }

      default:
        throw new Error(`parse: expected a statement`);
        break;
    }
  }

  block() {
    this.debugLog('block');
    while (this.current.type != TokenType.End) {
      this.statement();
    }
    this.consume(TokenType.End);
  }

  expression(precedence: Precedence = Precedence.Assignment) {
    this.debugLog('expression');
    this.advance();

    const token = this.previous;
    const prefix = rules[token.type];

    if (!prefix) {
      throw new Error(`parse: could not parse ${JSON.stringify(token)}`);
    }

    if (prefix.prefixFn) {
      // compile the left side
      prefix.prefixFn(this);
    }

    while (precedence <= rules[this.current.type].prec) {
      const infix = rules[this.current.type];
      if (infix.infixFn) {
        infix.infixFn(this, token);
      }
    }
  }

  binary() {
    this.debugLog('binary');
    this.advance();

    const token = this.previous;
    const precedence = rules[token.type]?.prec;

    // compile the right side (the left side is already compiled)
    this.expression(precedence);

    switch(token.type) {
      case TokenType.Plus:
        this.emit(OpCode.Add);
        break;
      case TokenType.Star:
        this.emit(OpCode.Multiply);
        break;
      case TokenType.Slash:
        this.emit(OpCode.Divide);
        break;
      case TokenType.Greater:
        this.emit(OpCode.Greater);
        break;
      case TokenType.Less:
        this.emit(OpCode.Less);
        break;
      case TokenType.EqualEqual:
        this.emit(OpCode.Equal);
        break;
      case TokenType.BangEqual:
        this.emit(OpCode.Equal);
        this.emit(OpCode.Not);
        break;
      default:
        throw new Error(`parse: invalid operator ${token.type}`);
    }
  }

  functionCall() {
    this.debugLog("functionCall");

    const name = this.previous;

    if (name.type !== TokenType.Identifier) {
      throw new Error("parse: expected an identifier");
    }

    this.consume(TokenType.LParen);
    this.expression();
    this.consume(TokenType.RParen);

    this.emit(OpCode.Call);
    this.emit(1); // num of args
  }

  literal() {
    this.debugLog("literal");

    const token = this.previous;

    switch (token.type) {
      case TokenType.Number:    // intentional fallthrough
      case TokenType.String: {
        this.emit(OpCode.PushImmediate);
        this.emit(token.value);
        break;
      }

      case TokenType.True: {
        this.emit(OpCode.PushImmediate);
        this.emit(true);
        break;
      }
      case TokenType.False: {
        this.emit(OpCode.PushImmediate);
        this.emit(false);
        break;
      }

      default:
        throw new Error("parse: literal must be string or number");
    }
  }

  identifier() {
    this.debugLog("identifier");

    const token = this.previous;
    if (token.type !== TokenType.Identifier) {
      throw new Error("parse: expected an identifier");
    }

    this.emit(OpCode.PushVariable);
    this.emit(token.value);
  }


  compile(code: string): Array<RawValue> {
    this.output = [];
    this.lexer = new Lexer(code);

    this.advance();

    while (this.current.type !== TokenType.EOF) {
      this.statement();
    }

    this.emit(OpCode.Halt);
    this.consume(TokenType.EOF);

    return this.output;
  }
}

export {
  Compiler,
};