import { Lexer, TokenType, Token, tokenToString } from "../lexer.ts";
import { RawValue, createValue, Value, ValueType, Program, createFunctionValue } from "../vm/value.ts";
import { OpCode } from "../vm/vm.ts";

enum Precedence {
  None,
  Assignment,
  Equality,
  Logical,
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
  [TokenType.Identifier]: { prec: Precedence.None,        prefixFn: c => c.identifier()                                  },
  [TokenType.String]:     { prec: Precedence.None,        prefixFn: c => c.literal()                                     },
  [TokenType.True]:       { prec: Precedence.None,        prefixFn: c => c.literal()                                     },
  [TokenType.False]:      { prec: Precedence.None,        prefixFn: c => c.literal()                                     },
  [TokenType.LSquare]:    { prec: Precedence.Call,        prefixFn: c => c.list(),       infixFn: c => c.subscript()     },
  [TokenType.LCurly]:     { prec: Precedence.Call,        prefixFn: c => c.hashTable()                                   },
  [TokenType.Not]:        { prec: Precedence.Unary,       prefixFn: c => c.unary()                                       },
  [TokenType.Function]:   { prec: Precedence.None,        prefixFn: c => c.functionDeclaration(true)                                       },
  [TokenType.EqualEqual]: { prec: Precedence.Equality,                                   infixFn: c => c.binary()        },
  [TokenType.BangEqual]:  { prec: Precedence.Equality,                                   infixFn: c => c.binary()        },
  [TokenType.Plus]:       { prec: Precedence.Sum,                                        infixFn: c => c.binary()        },
  [TokenType.Minus]:      { prec: Precedence.Sum,                                        infixFn: c => c.binary()        },
  [TokenType.Star]:       { prec: Precedence.Product,                                    infixFn: c => c.binary()        },
  [TokenType.Slash]:      { prec: Precedence.Product,                                    infixFn: c => c.binary()        },
  [TokenType.Greater]:    { prec: Precedence.Comparison,                                 infixFn: c => c.binary()        },
  [TokenType.Less]:       { prec: Precedence.Comparison,                                 infixFn: c => c.binary()        },
  [TokenType.LParen]:     { prec: Precedence.Call,        prefixFn: c => c.grouping(),   infixFn: c => c.functionCall()  },
  [TokenType.And]:        { prec: Precedence.Logical,                                    infixFn: c => c.binary()        },
  [TokenType.Or]:         { prec: Precedence.Logical,                                    infixFn: c => c.binary()        },
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
  variables: {
    [name: string]: {
      stackSlot: number,
      isCaptured: boolean,
    },
  };
  parent: Locals | null;
};

type UpValue = {
  index: number;
  isLocal: boolean;
};

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
  debug = false;
  hadError = false;

  enclosing: Compiler | undefined;
  locals: Locals = {
    variables: {},
    parent: null,
  };
  localCount = 0;
  upvalues: Array<UpValue> = [];

  scopeDepth = 0;
  callDepth = 0;

  constructor(enclosingCompiler?: Compiler) {
    if (typeof enclosingCompiler === "undefined" ) {
      this.lexer = new Lexer("");
      return;
    }

    this.enclosing = enclosingCompiler;
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


  emit(...args: Array<RawValue>): number {
    args.forEach((rawVal) => {
      this.output.push(rawVal);
    });
    return this.output.length - 1;
  }

  emitConstant(val: Value) {
    this.emit(OpCode.PushImmediate);
    if (val.type === ValueType.Function) {
      this.emit(val);
    } else if (val.type !== ValueType.HashTable && val.type !== ValueType.Null) {
      this.emit(val.value);
    } else {
      this.fatal(`cannot emit constants for values of type ${val.type}`);
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
      this.locals.variables[name] = {
        stackSlot: this.localCount++,
        isCaptured: false
      };
    } else {
      this.emit(OpCode.DefineGlobal, name);
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
      if (this.current.type === TokenType.Equal) {
        this.consume(TokenType.Equal);
        this.expression();
      } else {
        this.emit(OpCode.Null);
      }
      this.declareVariable(name.value);
    }
  }

  whileStatement() {
    this.consume(TokenType.While);
    const startPos = this.output.length;

    this.expression();
    this.consume(TokenType.Do);

    const endJump = this.emit(OpCode.JumpIfFalse, 999);

    this.block([TokenType.End]);
    this.consume(TokenType.End);

    this.emit(OpCode.Jump, startPos);

    // patch the jump from do => end
    const endPos = this.output.length;
    this.output[endJump] = endPos;
  }

  ifStatement() {
    this.expression();
    this.consume(TokenType.Then);

    const thenJump = this.emit(OpCode.JumpIfFalse, 999);

    this.block([TokenType.Else, TokenType.ElseIf, TokenType.End]);

    if (this.current.type === TokenType.ElseIf) {
      const elseJump = this.emit(OpCode.Jump, 999);
      // patch jump from them => elseif
      this.output[thenJump] = elseJump + 1;

      this.consume(TokenType.ElseIf);
      this.ifStatement();

      // patch jump from elseif => end
      this.output[elseJump] = this.output.length;
    } else if (this.current.type === TokenType.Else) {
      const elseJump = this.emit(OpCode.Jump, 999);
      // patch jump from them => elseif
      this.output[thenJump] = elseJump + 1;

      this.consume(TokenType.Else);
      this.block([TokenType.End]);
      this.consume(TokenType.End);

      // patch jump from elseif => end
      this.output[elseJump] = this.output.length;
    } else {
      // patch jump from them => end
      this.output[thenJump] = this.output.length;;
      this.consume(TokenType.End);
    }
  }

  functionDeclaration(expression = false) {
    let name = `func_expr_${this.current.line}`;
    if (this.current.type === TokenType.Identifier) {
      this.consume(TokenType.Identifier);

      const nameToken = this.previous;

      // always true, since we consumed it above
      if (nameToken.type === TokenType.Identifier) {
        name = nameToken.value;
      }
    } else if (!expression) {
      this.fatal('expected a function name');
    }

    const fnCompiler = new Compiler(this);

    const result = fnCompiler.compileFunction();
    this.current = result.current;
    this.previous = result.previous;

    this.consume(TokenType.End);

    const fnValue = createFunctionValue(name, result.arity, result.program, fnCompiler.upvalues.length);
    // this.emitConstant(fnValue);

    this.emit(OpCode.Closure, fnValue);
    fnCompiler.upvalues.forEach((upvalue) => {
      this.emit(upvalue.isLocal ? 1 : 0, upvalue.index);
    });

    if (!expression) {
      this.declareVariable(name);
    }
  }

  statement() {
    this.debugEnter('statement');

    try {
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
          this.emit(OpCode.Return, 1);
          break;
        }

        default:
          this.expression();
          break;
      }
    } catch (err) {
      let e = err as Error;
      this.hadError = true;
      console.error(e.message);
      this.synchronise();
    }

    this.debugLeave();
  }

  synchronise() {
    while (this.current.type !== TokenType.EOF) {
      switch (this.current.type) {
        // statement starters
        case TokenType.Var:
        case TokenType.While:
        case TokenType.If:
        case TokenType.Function:
        case TokenType.Return:
          return;

        // statement enders
        case TokenType.Do:
        case TokenType.Then:
          this.advance();
          return;
      }

      this.advance();
    }
  }

  block(endings: Array<TokenType>) {
    this.debugEnter('block');

    this.beginScope();
    while (!endings.includes(this.current.type) && this.current.type !== TokenType.EOF) {
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
      } else {
        this.fatal(`unexpected operator ${this.current.type}`);
      }
    }

    this.debugLeave();
  }

  unary() {
    this.debugEnter('unary');

    const operator = this.previous;
    this.expression(Precedence.Unary);

    switch (operator.type) {
      case TokenType.Not:
        this.emit(OpCode.Not);
        break;
      default:
        this.fatal(`unrecognised unary operator ${operator.type}`);
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
        this.emit(OpCode.Equal, OpCode.Not);
        break;
      case TokenType.And:
        this.emit(OpCode.And);
        break;
      case TokenType.Or:
        this.emit(OpCode.Or);
        break;
      default:
        this.fatal(`parse: unrecognised operator ${token.type}`);
    }

    this.debugLeave();
  }

  grouping() {
    this.debugEnter("grouping");

    this.expression();
    this.consume(TokenType.RParen);

    this.debugLeave();
  }

  subscript() {
    this.debugEnter("subscript");

    this.consume(TokenType.LSquare);
    this.expression();
    this.consume(TokenType.RSquare);

    this.emit(OpCode.GetHT);

    this.debugLeave();
  }

  functionCall() {
    this.debugEnter("functionCall");

    this.consume(TokenType.LParen);
    let arity = 0;
    while (this.current.type !== TokenType.RParen) {
      this.expression();
      arity++;
      if (this.current.type === TokenType.Comma) {
        this.consume(TokenType.Comma);
      } else {
        break;
      }
    }
    this.consume(TokenType.RParen);

    this.emit(OpCode.Call, arity);

    this.debugLeave();
  }

  literal() {
    this.debugEnter("literal");

    const token = this.previous;

    switch (token.type) {
      case TokenType.Number:    // intentional fallthrough
      case TokenType.String: {
        this.emit(OpCode.PushImmediate, token.value);
        break;
      }

      case TokenType.True: {
        this.emit(OpCode.PushImmediate, true);
        break;
      }
      case TokenType.False: {
        this.emit(OpCode.PushImmediate, false);
        break;
      }

      default:
        this.fatal("parse: literal must be string or number");
    }

    this.debugLeave();
  }

  list() {
    this.debugEnter("list");

    let len = 0;
    while (this.current.type !== TokenType.RSquare) {
      this.emitConstant(createValue(len.toString()));
      this.expression();
      len++;
      if (this.current.type === TokenType.Comma) {
        this.consume(TokenType.Comma);
      } else {
        break;
      }
    }
    this.consume(TokenType.RSquare);

    this.emit(OpCode.CreateHT, len);

    this.debugLeave();
  }

  hashTable() {
    this.debugEnter("hashTable");

    let len = 0;
    while (this.current.type !== TokenType.RCurly) {
      this.consume(TokenType.String);
      if (this.previous.type === TokenType.String) {
        const name = this.previous.value;
        this.consume(TokenType.Colon);
        this.emitConstant(createValue(name));
        this.expression();
        len++;
      }

      if (this.current.type === TokenType.Comma) {
        this.consume(TokenType.Comma);
      } else {
        break;
      }
    }
    this.consume(TokenType.RCurly);
    this.emit(OpCode.CreateHT, len);

    this.debugLeave();
  }

  private findLocal(name: string): number | undefined {
    let current: Locals | null = this.locals;
    // while (true) {
      if (name in current.variables) {
        return current.variables[name].stackSlot;
      }
      // current = current.parent;
      // if (current === null) {
      //   return;
      // }
    // }
  }

  private addUpValue(index: number, isLocal: boolean): number {
    this.upvalues.push({ index, isLocal });
    return this.upvalues.length - 1;
  }

  findUpValue(name: string): number | undefined {
    if (!this.enclosing) {
      return;
    }

    const local = this.enclosing.findLocal(name);
    if (typeof local !== "undefined") {
      this.enclosing.locals.variables[name].isCaptured = true;
      return this.addUpValue(local, true);
    }

    const upvalue = this.enclosing.findUpValue(name);
    if (typeof upvalue !== "undefined") {
      return this.addUpValue(upvalue, false);
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
      arg = this.findUpValue(token.value);
      if (typeof arg === "undefined") {
        arg = token.value;
        getOp = OpCode.GetGlobal;
        setOp = OpCode.SetGlobal;
      } else {
        getOp = OpCode.GetUpvalue;
        setOp = OpCode.SetUpvalue;
      }
    }

    if (this.current.type === TokenType.Equal) {
      this.consume(TokenType.Equal);
      this.expression();
      this.emit(setOp, arg);
    } else {
      this.emit(getOp, arg);
    }

    this.debugLeave();
  }


  compileFunction(): CompileFunctionResult {
    this.scopeDepth = 1;
    let arity = 0;
    this.localCount = 1; // 1 to account for the function on the stack

    this.consume(TokenType.LParen);

    this.beginScope();

    while (this.current.type !== TokenType.RParen) {
      this.consume(TokenType.Identifier);
      const name = this.previous;
      if (name.type === TokenType.Identifier) {
        this.locals.variables[name.value] = {
          stackSlot: this.localCount++,
          isCaptured: false,
        };
      }

      arity++;

      if (this.current.type === TokenType.Comma) {
        this.consume(TokenType.Comma);
      }
    }

    this.consume(TokenType.RParen);

    while (this.current.type as any !== TokenType.End && this.current.type as any !== TokenType.EOF) {
      this.statement();
    }

    // implicit return
    this.emit(OpCode.Return, 0);

    this.endScope();

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

    if (this.hadError) {
      throw new Error('parsing failed');
    }

    return this.output;
  }
}

export {
  Compiler,
};
