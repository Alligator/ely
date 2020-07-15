import { Value, RawValue, createValue, valueToString, ValueType, valueIsTruthy, valuesAreEqual, Program } from "./value.ts";
import { disassembleNextOpCode } from "./disasm.ts";

enum OpCode {
  DefineGlobal = "DefineGlobal",
  SetGlobal = "SetGlobal",
  GetGlobal = "GetGlobal",

  SetLocal = "SetLocal",
  GetLocal = "GetLocal",

  PushImmediate = "PushImmediate",
  Pop = "Pop",
  Add = "Add",
  Sub = "Sub",
  Multiply = "Multiply",
  Divide = "Divide",
  Not = "Not",
  Greater = "Greater",
  Less = "Less",
  Equal = "Equal",
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
  // TODO is this a good idea?
  returnValue?: Value;
}

class ElyVm {
  code: Array<RawValue> = [];
  globals: { [name: string]: Value } = {};
  stack: Array<Value> = [];
  callStack: Array<StackFrame> = [];
  programCounter: number = 0;
  debug: boolean = false;

  constructor() {
    this.addNativeFunction("print", (val: Value) => {
      console.log(val.value);
    });

    this.addNativeFunction("read_line", async (): Promise<Value> => {
      const enc = new TextEncoder();
      const dec = new TextDecoder();

      await Deno.stdout.write(enc.encode("> "));

      const bytes = new Uint8Array(64);
      let read = await Deno.read(Deno.stdin.rid, bytes);

      if (read) {
        const text = dec.decode(bytes.slice(0, read - 2));
        const val = createValue(text);
        if (val) {
          return val;
        }
      }

      return createValue("");
    });

    this.addNativeFunction("str", (val: Value) => {
      return createValue(val.value.toString());
    });
  }

  fatal(msg: string): never {
    console.log('call stack:');
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      console.error(`  ${this.callStack[i].name}`);
    }
    console.error("  <script>");
    throw new Error(`error at ${this.programCounter}: ${msg}`);
  }

  addNativeFunction(name: string, fn: Function) {
    this.globals[name] = {
      type: ValueType.NativeFunction,
      value: fn,
    };
  }

  read(): RawValue {
    return this.code[this.programCounter++];
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
  peek(num: number): Value | undefined {
    return this.stack[this.stack.length - num - 1];
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
        msg += disassembleNextOpCode(this.programCounter, this.code);
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
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (!arg1 || !arg2) {
            this.fatal("not enough arguments given to greater");
          }

          // both strings or both numbers
          if (
            (arg1.type === ValueType.String && arg2.type === ValueType.String)
            || (arg1.type === ValueType.Number && arg2.type === ValueType.Number)
          ) {
            const value = createValue(arg2.value > arg1.value);
            if (value) {
              this.push(value);
              break;
            }
          }

          this.fatal("mismatched types for greater");
          break;
        }

        case OpCode.Less: {
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (!arg1 || !arg2) {
            this.fatal("not enough arguments given to less");
          }

          // both strings or both numbers
          if (
            (arg1.type === ValueType.String && arg2.type === ValueType.String)
            || (arg1.type === ValueType.Number && arg2.type === ValueType.Number)
          ) {
            const value = createValue(arg2.value < arg1.value);
            if (value) {
              this.push(value);
              break;
            }
          }

          this.fatal("mismatched types for less");
          break;
        }

        case OpCode.Multiply: {
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (!arg1 || !arg2) {
            this.fatal("not enough arguments given to multiply");
          }

          // both strings or both numbers
          if ((arg1.type === ValueType.Number && arg2.type === ValueType.Number)) {
            const value = createValue(arg2.value * arg1.value);
            if (value) {
              this.push(value);
              break;
            }
          }

          this.fatal("mismatched types for multiply");
          break;
        }

        case OpCode.Divide: {
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (!arg1 || !arg2) {
            this.fatal("not enough arguments given to divide");
          }

          // both strings or both numbers
          if ((arg1.type === ValueType.Number && arg2.type === ValueType.Number)) {
            const value = createValue(arg2.value / arg1.value);
            if (value) {
              this.push(value);
              break;
            }
          }

          this.fatal("mismatched types for divide");
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
              for (let i = 0; i < argCount; i++) {
                args.push(this.pop());
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
          const value = this.pop();
          if (!value) {
            this.fatal("return with no value");
          }

          this.callStack[this.callStack.length - 1].returnValue = value;

          return;
        }

        case OpCode.Jump: {
          const dest = this.read();
          if (typeof dest === "number") {
            this.programCounter = dest;
          }
          break;
        }

        case OpCode.JumpIfFalse: {
          const dest = this.read();
          const value = this.pop();

          if (typeof dest === "number" && value && !valueIsTruthy(value)) {
            this.programCounter = dest;
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
  }
}

export {
  ElyVm,
  OpCode,
}
