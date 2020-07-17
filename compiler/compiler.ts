import { Lexer, TokenType, Token, tokenToString } from "../lexer.ts";
import { RawValue, createValue, Value, ValueType, Program, createFunctionValue } from "../vm/value.ts";
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

const rules: { [K in TokenType]?: Rule } = {
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
  [TokenType.Equal]:      { prec: Precedence.Assignment                                                                  },
};

function getRule(type: TokenType): Rule {
  return rules[type] || { prec: Precedence.None };
}

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

type CompileFunctionResult = {
  program: Program;
  arity: number;
  previous: Token;
  current: Token;
};

class Compiler {
  output: Array<RawValue> = [];
  lexer: Lexer;
  current: Token = { type: TokenType.Error, line: 0, }
  previous: Token = { type: TokenType.Error, line: 0 }
  debug: boolean = false;

  locals: Locals = {
    variables: {},
    parent: null,
  };
  localCount = 0;
  scopeDepth = 0;

  callDepth = 0;

  constructor(enclosingCompiler?: Compiler) {
    if (typeof enclosingCompiler === "undefined" ) {
      this.lexer = new Lexer("");
      return;
    }

    this.lexer = enclosingCompiler.lexer;
    this.current = enclosingCompiler.current;
    this.previous = enclosingCompiler.previous;
    this.debug = enclosingCompiler.debug;
  }

  private debugEnter(msg: string) {
    this.callDepth++;
    if (this.debug) {
      const padding = new Array(this.callDepth).fill('| ').join('');
      let message = padOrTruncateString(`${padding}${msg}`, 30);
      message += ' ';
      message += padOrTruncateString(tokenToString(this.current), 20);
      message += ' ';
      message += padOrTruncateString(tokenToString(this.previous), 20);
      console.error(message);
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


  emit(rawVal: RawValue): number {
    this.output.push(rawVal);
    return this.output.length - 1;
  }

  emitConstant(val: Value) {
    this.emit(OpCode.PushImmediate);
    if (val.type === ValueType.Function) {
      this.emit(val);
    } else {
      this.emit(val.value);
    }
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


  declareVariable(name: string) {
    if (this.scopeDepth > 0) {
      this.locals.variables[name] = this.localCount++;
    } else {
      this.emit(OpCode.DefineGlobal);
      this.emit(name);
    }
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

  varStatement() {
    this.consume(TokenType.Identifier);
    const name = this.previous;

    if (name.type === TokenType.Identifier) {
      this.consume(TokenType.Equal);
      this.expression();
      this.declareVariable(name.value);
    }
  }

  whileStatement() {
    this.consume(TokenType.While);
    const startPos = this.output.length;

    this.expression();
    this.consume(TokenType.Do);

    this.emit(OpCode.JumpIfFalse);
    const endJump = this.emit(999);

    this.block([TokenType.End]);
    this.consume(TokenType.End);

    this.emit(OpCode.Jump);
    this.emit(startPos);

    // patch the jump from do => end
    const endPos = this.output.length;
    this.output[endJump] = endPos;
  }

  ifStatement() {
    this.expression();
    this.consume(TokenType.Then);

    this.emit(OpCode.JumpIfFalse);
    const thenJump = this.emit(999);

    this.block([TokenType.Else, TokenType.ElseIf, TokenType.End]);

    this.emit(OpCode.Jump);
    const elseJump = this.emit(999);

    // patch jump from them => else
    this.output[thenJump] = elseJump + 1;

    if (this.current.type === TokenType.ElseIf) {
      this.consume(TokenType.ElseIf);

      this.ifStatement();

      // patch jump from elseif => end
      this.output[elseJump] = this.output.length;
    } else if (this.current.type === TokenType.Else) {
      this.consume(TokenType.Else);
      this.block([TokenType.End]);
      this.consume(TokenType.End);

      // patch jump from else => end
      this.output[elseJump] = this.output.length;
    } else {
      this.consume(TokenType.End);
    }
  }

  functionDeclaration() {
    this.consume(TokenType.Identifier);

    const nameToken = this.previous;
    let name = '';

    // always true, since we consumed it above
    if (nameToken.type === TokenType.Identifier) {
      name = nameToken.value;
    }

    const fnCompiler = new Compiler(this);

    this.beginScope();

    const result = fnCompiler.compileFunction();
    this.current = result.current;
    this.previous = result.previous;

    this.endScope();

    this.consume(TokenType.End);

    const fnValue = createFunctionValue(name, result.arity, result.program);
    this.emitConstant(fnValue);
    this.declareVariable(name);
  }

  statement() {
    this.debugEnter('statement');

    switch (this.current.type) {
      case TokenType.Var:
        this.consume(TokenType.Var);
        this.varStatement();
        break;
      case TokenType.While:
        this.whileStatement();
        break;
      case TokenType.If:
        this.consume(TokenType.If);
        this.ifStatement();
        break;
      case TokenType.Function:
        this.consume(TokenType.Function);
        this.functionDeclaration();
        break;

      case TokenType.Return: {
        this.consume(TokenType.Return);

        // TODO how do we do an empty return with no statement terminator? uh oh.
        this.expression();
        this.emit(OpCode.Return);
        break;
      }

      default:
        this.expression();
        break;
    }

    this.debugLeave();
  }

  block(endings: Array<TokenType>) {
    this.debugEnter('block');

    this.beginScope();
    while (!endings.includes(this.current.type)) {
      this.statement();
    }

    this.endScope();
    this.debugLeave();
  }

  expression(precedence: Precedence = Precedence.Assignment) {
    this.debugEnter('expression');

    const token = this.current;
    const prefix = getRule(token.type);

    if (typeof prefix.prefixFn === "undefined") {
      this.fatal(`unexpected ${token.type}`);
    }

    this.advance();

    // compile the left side
    prefix.prefixFn(this);

    while (precedence <= getRule(this.current.type).prec) {
      const infix = getRule(this.current.type);
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
    const precedence = getRule(token.type).prec;

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
    let arity = 0;
    while (this.current.type !== TokenType.RParen) {
      this.expression();
      if (this.current.type === TokenType.Comma) {
        this.consume(TokenType.Comma);
      }
      arity++;
    }
    this.consume(TokenType.RParen);

    this.emit(OpCode.Call);
    this.emit(arity); // num of args

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


  compileFunction(): CompileFunctionResult {
    this.scopeDepth = 1;
    let arity = 0;
    this.localCount = 1; // 1 to account for the function on the stack

    this.consume(TokenType.LParen);

    while (this.current.type !== TokenType.RParen) {
      this.consume(TokenType.Identifier);
      const name = this.previous;
      if (name.type === TokenType.Identifier) {
        this.locals.variables[name.value] = this.localCount++;
      }

      arity++;

      if (this.current.type === TokenType.Comma) {
        this.consume(TokenType.Comma);
      }
    }

    this.consume(TokenType.RParen);

    this.block([TokenType.End]);

    return {
      program: this.output,
      arity,
      previous: this.previous,
      current: this.current,
    };
  }

  compile(code: string): Program {
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
