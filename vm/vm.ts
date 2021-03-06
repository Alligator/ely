import {
  Value,
  ValueNumber,
  ValueBool,
  RawValue,
  createValue,
  createHashTableValue,
  valueToString,
  ValueType,
  valueIsTruthy,
  valuesAreEqual,
  Program,
  createNullValue,
  UpValue,
  ValueFunction,
} from "./value.ts";
import { disassembleNextOpCode } from "./disasm.ts";
import { addRuntimeApi } from "./runtime-library.ts";

enum OpCode {
  DefineGlobal = "DefineGlobal",
  SetGlobal = "SetGlobal",
  GetGlobal = "GetGlobal",

  SetLocal = "SetLocal",
  GetLocal = "GetLocal",
  CreateHT = "CreateHT",
  GetHT = "GetHT",

  SetUpvalue = "SetUpvalue",
  GetUpvalue = "GetUpvalue",
  Closure = "Closure",

  PushImmediate = "PushImmediate",
  Null = "Null",
  Pop = "Pop",
  Add = "Add",
  Sub = "Sub",
  Multiply = "Multiply",
  Divide = "Divide",
  Not = "Not",
  Greater = "Greater",
  Less = "Less",
  Equal = "Equal",
  And = "And",
  Or = "Or",
  Call = "Call",
  Return = "Return",
  Jump = "Jump",
  JumpIfFalse = "JumpIfFalse",
  JumpIfNotEqual = "JumpIfNotEqual",
  Halt = "Halt",
}

interface StackFrame {
  name: string;
  callingCode: Program;
  callingProgramCounter: number;
  stackBase: number;
  closure: ValueFunction;
  // TODO is this a good idea?
  returnValue?: Value;
}

class ElyVm {
  code: Array<RawValue> = [];
  programCounter: number = 0;

  globals: { [name: string]: Value } = {};

  stack: Array<Value> = [];
  callStack: Array<StackFrame> = [];
  openUpvalues: Array<UpValue> = [];

  debug: boolean = false;

  constructor() {
    addRuntimeApi(this);
  }

  get frame() {
    return this.callStack[this.callStack.length - 1];
  }

  fatal(msg: string): never {
    console.log('call stack:');
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      console.error(`  ${this.callStack[i].name}`);
    }
    console.error("  <script>");
    throw new Error(`error at ${this.programCounter}: ${msg}`);
  }

  addNativeFunction(name: string, arity: number, fn: Function) {
    this.globals[name] = {
      type: ValueType.NativeFunction,
      name,
      arity,
      value: fn,
    };
  }

  read(): RawValue {
    return this.code[this.programCounter++];
  }

  readNumber(errorMessage: string): number {
    const val = this.code[this.programCounter++];
    if (typeof val !== "number") {
      this.fatal(errorMessage);
    }
    return val;
  }

  push(val: Value) {
    this.stack.push(val);
  }
  pop(): Value | undefined {
    if (this.stack.length === 0) {
      this.fatal("tried to pop an empty stack");
    }
    return this.stack.pop();
  }
  popTwoNumbers(): [ValueNumber, ValueNumber] {
    const arg1 = this.pop();
    const arg2 = this.pop();

    if (!arg1 || !arg2) {
      this.fatal("expected two arguments");
    }

    if (arg1.type === ValueType.Number && arg2.type === ValueType.Number) {
      return [arg1, arg2];
    }

    this.fatal("expected two numbers");
  }
  popTwoBools(): [ValueBool, ValueBool] {
    const arg1 = this.pop();
    const arg2 = this.pop();

    if (!arg1 || !arg2) {
      this.fatal("expected two arguments");
    }

    if (arg1.type === ValueType.Bool && arg2.type === ValueType.Bool) {
      return [arg1, arg2];
    }

    this.fatal("expected two bools");
  }
  peek(num: number): Value | undefined {
    return this.stack[this.stack.length - num - 1];
  }

  jump(dest: RawValue) {
    if (typeof dest !== "number") {
      this.fatal("didn't get a number when attempting to jump");
    }

    if (this.code.length <= dest) {
      this.fatal("attempted to jump beyond the end of the program");
    }
    this.programCounter = dest;
  }

  captureUpValue(index: number): UpValue {
    const upValue = {
      stackSlot: index,
    };
    this.openUpvalues.push(upValue);
    return upValue;
  }

  closeUpvalues() {
    this.openUpvalues.forEach((upvalue) => {
      if (!upvalue.closed) {
        upvalue.closed = this.stack[this.frame.stackBase + upvalue.stackSlot];
      }
    });
  }

  async run(code: Array<RawValue>): Promise<Value | undefined> {
    this.code = code;
    this.programCounter = 0;

    if (this.debug) {
      console.log("=== ely vm ===");
    }

    while (true) {
      if (this.debug && this.programCounter < this.code.length) {
        let msg = `  ${('000' + this.programCounter).slice(-4)} `;
        const [disasm, _] = disassembleNextOpCode(this.programCounter, this.code);
        msg += disasm;
        const padding = Math.max(40 - msg.length, 0);
        msg += new Array(padding).fill(' ').join('');
        msg += `stack: [${this.stack.map(v => valueToString(v)).join(', ')}]`;
        // msg += ` | env: ${Object.keys(this.env.values).map(k => `${k}: ${valueToString(this.env.values[k])}`).join(', ')}`;
        console.log(msg);
      }

      const opCode = this.read();

      if (typeof opCode === "undefined") {
        return;
      }

      switch (opCode) {
        case OpCode.Halt: {
          if (this.debug) {
            console.log("=== exit ely vm ===");
          }
          if (this.stack.length > 0) {
            return this.pop();
          }
          return;
        }

        case OpCode.GetGlobal: {
          const name = this.read();
          if (typeof name !== "string") {
            this.fatal("got non string as global name");
          }

          if (!(name in this.globals)) {
            this.fatal(`attempted to get unknown global ${name}`);
          }

          const value = this.globals[name];
          this.push(value);
          break;
        }

        case OpCode.PushImmediate: {
          const value = createValue(this.read());
          if (value) {
            this.push(value);
          }
          break;
        }

        case OpCode.Null: {
          this.push(createNullValue());
          break;
        }

        case OpCode.Pop: {
          this.pop();
          break;
        }

        case OpCode.DefineGlobal: {
          const name = this.read();
          if (typeof name !== "string") {
            this.fatal("got non string as global name");
          }

          if (name in this.globals) {
            this.fatal(`attempted to redefine global ${name}`);
          }

          const value = this.pop();
          if (typeof value === "undefined") {
            this.fatal("empty when assigning a global");
          }

          this.globals[name] = value;
          break;
        }

        case OpCode.SetGlobal: {
          const name = this.read();
          if (typeof name !== "string") {
            this.fatal("got non string as global name");
          }

          if (!(name in this.globals)) {
            this.fatal(`attempted to set unknown global ${name}`);
          }

          const value = this.pop();
          if (typeof value === "undefined") {
            this.fatal("empty when assigning a global");
          }

          this.globals[name] = value;
          break;
        }

        case OpCode.GetLocal: {
          const index = this.read();
          if (typeof index !== "number") {
            this.fatal("expected a number as a local variable index");
          }

          let stackBase = 0;
          if (this.callStack.length > 0) {
            stackBase = this.callStack[this.callStack.length - 1].stackBase;
          }
          this.push(this.stack[index + stackBase]);
          break;
        }

        case OpCode.SetLocal: {
          const index = this.read();
          if (typeof index !== "number") {
            this.fatal("expected a number as a local variable index");
          }

          const value = this.pop();
          if (typeof value === "undefined") {
            this.fatal("attempted to set a variable with no value");
          }

          this.stack[index] = value;

          break;
        }

        case OpCode.CreateHT: {
          const len = this.readNumber("expected a number as hash table length");

          const ht = createHashTableValue();
          for (let i = len - 1; i >= 0; i--) {
            const value = this.pop();
            const name = this.pop();
            if (typeof name === "undefined" || typeof value === "undefined") {
              this.fatal("missing key/value pair when creating a list");
            }

            if (name.type !== ValueType.String) {
              this.fatal("expected a string as a hash table key");
            }

            ht.value[name.value] = value;
            ht.length++;
          }

          this.push(ht);
          break;
        }

        case OpCode.GetHT: {
          const key = this.pop();
          if (
            !key
            || (key.type !== ValueType.Number && key.type !== ValueType.String)
          ) {
            this.fatal("expected a string or number as an object index");
          }

          const ht = this.pop();
          if (!ht || ht.type !== ValueType.HashTable) {
            this.fatal("expected a hash table");
          }

          const value = ht.value[key.value];
          this.push(value);

          break;
        }

        case OpCode.GetUpvalue: {
          const index = this.readNumber("expected a number as an upvalue index");
          const upvalue = this.frame.closure.upValues[index];
          if (upvalue.closed) {
            this.push(upvalue.closed);
          } else {
            this.push(this.stack[upvalue.stackSlot]);
          }
          break;
        }

        case OpCode.Closure: {
          const fn = this.read();

          if (typeof fn !== "object" || fn.type !== ValueType.Function) {
            this.fatal('expected a function as an arg to closure');
          }

          for (let i = 0; i < fn.upValueCount; i++) {
            const isLocal = this.readNumber('isLocal');
            const index = this.readNumber('index');
            if (isLocal) {
              fn.upValues.push(this.captureUpValue(index));
            } else {
              fn.upValues.push(this.frame.closure.upValues[index]);
            }
          }

          this.push(fn);

          break;
        }

        case OpCode.Add: {
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (!arg1 || !arg2) {
            this.fatal("not enough arguments given to add");
          }

          // both strings or both numbers
          if (
            (arg1.type === ValueType.String && arg2.type === ValueType.String)
            || (arg1.type === ValueType.Number && arg2.type === ValueType.Number)
          ) {
            const value = createValue(arg2.value as any + arg1.value);
            if (value) {
              this.push(value);
              break;
            }
          }

          // one is a string one is a number
          if (
            (arg1.type === ValueType.String && arg2.type === ValueType.Number)
            || (arg1.type === ValueType.Number && arg2.type === ValueType.String)
          ) {
            // coerce them both to strings
            const value = createValue(arg2.value.toString() + arg1.value.toString());
            if (value) {
              this.push(value);
              break;
            }
          }

          this.fatal("mismatched types for add");
          break;
        }

        case OpCode.Greater: {
          const [arg1, arg2] = this.popTwoNumbers();
          const value = createValue(arg2.value > arg1.value);
          if (value) {
            this.push(value);
          }
          break;
        }

        case OpCode.Less: {
          const [arg1, arg2] = this.popTwoNumbers();
          const value = createValue(arg2.value < arg1.value);
          if (value) {
            this.push(value);
          }
          break;
        }

        case OpCode.Multiply: {
          const [arg1, arg2] = this.popTwoNumbers();
          const value = createValue(arg2.value * arg1.value);
          if (value) {
            this.push(value);
          }
          break;
        }

        case OpCode.Divide: {
          const [arg1, arg2] = this.popTwoNumbers();
          const value = createValue(arg2.value / arg1.value);
          if (value) {
            this.push(value);
          }
          break;
        }

        case OpCode.Not: {
          const arg = this.pop();

          if (!arg || arg.type !== ValueType.Bool) {
            this.fatal("expected a boolean as argument to not");
          }

          this.push(createValue(!arg.value));
          break;
        }

        case OpCode.Equal: {
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (!arg1 || !arg2) {
            this.fatal("not enough arguments given to equal");
          }

          // both strings or both numbers
          if (arg1.type === arg2.type) {
            const value = createValue(arg2.value as any === arg1.value);
            if (value) {
              this.push(value);
              break;
            }
          }

          this.fatal("mismatched types for equal");
          break;
        }

        case OpCode.And: {
          const [arg1, arg2] = this.popTwoBools();
          const value = createValue(arg1.value && arg2.value);
          if (value) {
            this.push(value);
          }
          break;
        }

        case OpCode.Or: {
          const [arg1, arg2] = this.popTwoBools();
          const value = createValue(arg1.value || arg2.value);
          if (value) {
            this.push(value);
          }
          break;
        }

        case OpCode.Sub: {
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (
            arg1?.type !== ValueType.Number
            || arg2?.type !== ValueType.Number
          ) {
            this.fatal("non-numbers used in sub");
          }

          if (arg1 && arg2) {
            const value = createValue(arg2.value - arg1.value);
            if (value) {
              this.push(value);
            }
          }
          break;
        }

        case OpCode.Call: {
          const argCount = this.read();
          if (typeof argCount !== "number") {
            this.fatal("expected number for function argument count");
          }

          const func = this.peek(argCount);

          if (!func) {
            this.fatal("expection a function but got undefined");
          }

          switch (func.type) {
            case ValueType.NativeFunction: {
              const args = [];
              let arity = 0;
              for (let i = 0; i < argCount; i++) {
                args.unshift(this.pop());
                arity++;
              }
              if (func.arity !== Infinity && arity !== func.arity) {
                this.fatal(`expected ${func.arity} arguments but got ${arity}`);
              }
              const result = await func.value.apply(func.value, args);

              this.pop(); // pop the function

              if (result) {
                this.push(result);
              }
              break;
            }

            case ValueType.Function: {
              this.callStack.push({
                name: func.name,
                callingCode: this.code,
                callingProgramCounter: this.programCounter,
                stackBase: this.stack.length - argCount - 1,
                closure: func,
              });

              await this.run(func.value);

              const frame = this.callStack.pop();
              if (frame) {
                this.stack = this.stack.slice(0, frame.stackBase);
                this.code = frame.callingCode;
                this.programCounter = frame.callingProgramCounter;
                if (frame.returnValue) {
                  this.push(frame.returnValue);
                }
              } else {
                this.fatal("ended a function with no stack frame. something is very wrong");
              }

              break;
            }

            default:
              this.fatal(`expected a function but got ${func.type}`);
          }
          break;
        }

        case OpCode.Return: {
          const numValues = this.read();
          if (typeof numValues !== "number") {
            this.fatal("expected a number for return");
          }

          this.closeUpvalues();

          // TODO support > 1 return value
          let value ;
          if (numValues === 1) {
            value = this.pop();
            if (!value) {
              this.fatal("return with no value");
            }
            this.callStack[this.callStack.length - 1].returnValue = value;
          }

          if (this.debug) {
            console.log("=== exit ely vm ===");
          }
          return value;
        }

        case OpCode.Jump: {
          const dest = this.read();
          this.jump(dest);
          break;
        }

        case OpCode.JumpIfFalse: {
          const dest = this.read();
          const value = this.pop();
          if (value && !valueIsTruthy(value)) {
            this.jump(dest);
          }
          break;
        }

        case OpCode.JumpIfNotEqual: {
          const dest = this.read();
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (arg1 && arg2 && typeof dest === "number") {
            if (!valuesAreEqual(arg1, arg2) ) {
              this.programCounter = dest;
            }
          }

          break;
        }

        default: {
          this.fatal(`unknown opcode: ${opCode}`);
        }
      }
    }

    if (this.debug) {
      console.log("=== exit ely vm ===");
    }
  }
}

export {
  ElyVm,
  OpCode,
}
