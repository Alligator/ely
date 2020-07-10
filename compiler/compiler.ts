import { Lexer, TokenType, Token, tokenToString } from "../lexer.ts";
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
  [TokenType.EqualEqual]: { prec: Precedence.Equality,                                   infixFn: c => c.binary()        },
  [TokenType.BangEqual]:  { prec: Precedence.Equality,                                   infixFn: c => c.binary()        },
  [TokenType.Plus]:       { prec: Precedence.Sum,                                        infixFn: c => c.binary()        },
  [TokenType.Minus]:      { prec: Precedence.Sum,                                        infixFn: c => c.binary()        },
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
  [TokenType.Equal]:      { prec: Precedence.Assignment                                                                  },
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

function padOrTruncateString(str: string, length: number): string {
  if (str.length >= length) {
    return str.substring(0, length - 3) + "...";
  }
  return `${str}                                   `.substring(0, length);
}

type Locals = {
  variables: { [name: string]: number },
  parent: Locals | null;
}

class Compiler {
  output: Array<RawValue> = [];
  lexer: Lexer;
  current: Token = { type: TokenType.Error }
  previous: Token = { type: TokenType.Error }
  debug: boolean = false;

  locals: Locals = {
    variables: {},
    parent: null,
  };
  localCount = 0;
  scopeDepth = 0;

  callDepth = 0;

  constructor() {
    this.lexer = new Lexer("");
  }

  private debugEnter(msg: string) {
    this.callDepth++;
    if (this.debug) {
      const padding = new Array(this.callDepth).fill(' ').join('');
      let message = padOrTruncateString(`${padding}${msg}`, 20);
      message += ' ';
      message += padOrTruncateString(tokenToString(this.current), 20);
      message += ' ';
      message += padOrTruncateString(tokenToString(this.previous), 20);
      console.error(message);
      // console.error(`${msg}\n   cur: ${JSON.stringify(this.current)}\n  prev: ${JSON.stringify(this.previous)}`);
    }
  }

  private debugLeave() {
    this.callDepth--;
  }


  fatal(msg: string): never {
    throw new Error(this.lexer.getMessageAtCurrentToken(msg));
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

    this.fatal(`expected ${type} but found ${this.current?.type}`);
  }


  emit(rawVal: RawValue) {
    this.output.push(rawVal);
  }

  emitConstant(val: Value) {
    this.emit(OpCode.Constant);
    this.emit(val.value);
  }


  beginScope() {
    const newLocals: Locals = {
      variables: {},
      parent: this.locals,
    };
    this.locals = newLocals;
    this.scopeDepth++;
  }

  endScope() {
    if (!this.locals.parent) {
      this.fatal("ended a scope with no parent");
    }
    for (let i = 0; i < Object.keys(this.locals.variables).length; i++) {
      this.emit(OpCode.Pop);
      this.localCount--;
    }
    this.locals = this.locals.parent;
    this.scopeDepth--;
  }


  number() {
    this.debugEnter("number");

    if (this.previous && this.previous.type === TokenType.Number) {
      const value = createValue(parseFloat(this.previous.value));
      this.emitConstant(value);

      this.debugLeave();
      return;
    }

    this.fatal(`expected a number but found ${this.previous}`);
  }

  statement() {
    this.debugEnter('statement');

    switch (this.current.type) {
      case TokenType.Var: {
        this.consume(TokenType.Var);

        // parse var declaration
        this.consume(TokenType.Identifier);
        const name = this.previous;

        if (name.type === TokenType.Identifier) {
          this.consume(TokenType.Equal);

          this.expression();

          if (this.scopeDepth > 0) {
            this.locals.variables[name.value] = this.localCount++;
          } else {
            this.emit(OpCode.DefineGlobal);
            this.emit(name.value);
          }
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

      default:
        this.expression();
        break;
    }

    this.debugLeave();
  }

  block() {
    this.debugEnter('block');

    this.beginScope();
    while (this.current.type != TokenType.End) {
      this.statement();
    }
    this.consume(TokenType.End);
    this.endScope();

    this.debugLeave();
  }

  expression(precedence: Precedence = Precedence.Assignment) {
    this.debugEnter('expression');

    this.advance();

    const token = this.previous;
    const prefix = rules[token.type];

    if (!prefix) {
      this.fatal(`parse: could not parse ${JSON.stringify(token)}`);
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

    this.debugLeave();
  }

  binary() {
    this.debugEnter('binary');

    this.advance();

    const token = this.previous;
    const precedence = rules[token.type]?.prec;

    // compile the right side (the left side is already compiled)
    this.expression(precedence);

    switch(token.type) {
      case TokenType.Plus:
        this.emit(OpCode.Add);
        break;
      case TokenType.Minus:
        this.emit(OpCode.Sub);
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
        this.fatal(`parse: invalid operator ${token.type}`);
    }

    this.debugLeave();
  }

  functionCall() {
    this.debugEnter("functionCall");

    const name = this.previous;

    if (name.type !== TokenType.Identifier) {
      this.fatal("parse: expected an identifier");
    }

    this.consume(TokenType.LParen);
    if (this.current.type !== TokenType.RParen) {
      this.expression();
    }
    this.consume(TokenType.RParen);

    this.emit(OpCode.Call);
    this.emit(1); // num of args

    this.debugLeave();
  }

  literal() {
    this.debugEnter("literal");

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
        this.fatal("parse: literal must be string or number");
    }

    this.debugLeave();
  }

  private findLocal(name: string): number | undefined {
    let current: Locals | null = this.locals;
    while (true) {
      if (name in current.variables) {
        return current.variables[name];
      }
      current = current.parent;
      if (current === null) {
        return;
      }
    }
  }

  identifier() {
    this.debugEnter("identifier");

    const token = this.previous;
    if (token.type !== TokenType.Identifier) {
      this.fatal("parse: expected an identifier");
    }

    let arg: string | number | undefined = this.findLocal(token.value);
    let getOp = OpCode.GetLocal;
    let setOp = OpCode.SetLocal;

    if (typeof arg === "undefined") {
      arg = token.value;
      getOp = OpCode.GetGlobal;
      setOp = OpCode.SetGlobal;
    }

    if (this.current.type === TokenType.Equal) {
      this.consume(TokenType.Equal);
      this.expression();
      this.emit(setOp);
      this.emit(arg);
    } else {
      this.emit(getOp);
      this.emit(arg);
    }

    this.debugLeave();
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