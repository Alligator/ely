import { Value, RawValue, createValue, valueToString, ValueType, valueIsTruthy, valuesAreEqual } from "./value.ts";
import { disassembleNextOpCode } from "./disasm.ts";

enum OpCode {
  Constant = "Constant",
  DefineLocal = "DefineLocal",
  PushVariable = "PushVariable",
  PopVariable = "PopVariable",
  PushImmediate = "PushImmediate",
  Add = "Add",
  Greater = "Greater",
  Less = "Less",
  Equal = "Equal",
  Sub = "Sub",
  Call = "Call",
  Return = "Return",
  Jump = "Jump",
  JumpIfFalse = "JumpIfFalse",
  JumpIfNotEqual = "JumpIfNotEqual",
  Halt = "Halt",
}

interface Environment {
  values: { [name: string]: Value },
  parent?: Environment;
};

class ElyVm {
  code: Array<RawValue> = [];
  globalEnv: Environment = { values : {} };
  env: Environment = { values : {} };
  stack: Array<Value> = [];
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
  }

  fatal(msg: string): never {
    console.error("emv:", this.env);
    console.error("stack:", this.stack);
    throw new Error(`error at ${this.programCounter}: ${msg}`);
  }

  addNativeFunction(name: string, fn: Function) {
    this.globalEnv.values[name] = {
      type: ValueType.NativeFunction,
      value: fn,
    };
  }

  findVariable(name: string): Value {
    let currentEnv = this.env;
    while (true) {
      if (currentEnv.values[name]) {
        return currentEnv.values[name];
      } else if (currentEnv.parent) {
        currentEnv = currentEnv.parent;
      } else {
        break;
      }
    }

    if (this.globalEnv.values[name]) {
      return this.globalEnv.values[name];
    }

    this.fatal(`attempted to load unknown variable ${name}`);
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

  async run(code: Array<RawValue>): Promise<Value | undefined> {
    this.code = code;
    this.programCounter = 0;

    if (this.debug) {
      console.log("=== ely vm ===");
    }

    while (true) {
      if (this.debug) {
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

        case OpCode.Constant: {
          const arg = this.read();
          const value = createValue(arg);
          if (typeof value === "undefined") {
            this.fatal("could not create value");
          }
          this.push(value);
          break;
        }

        case OpCode.PushVariable: {
          const name = this.read();
          if (typeof name !== "string") {
            this.fatal("got non string as variable name");
          }

          const value = this.findVariable(name);
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

        case OpCode.DefineLocal: {
          const name = this.read();
          if (typeof name !== "string") {
            this.fatal("got non string as variable name");
          }

          const value = this.pop();
          if (typeof value === "undefined") {
            this.fatal("empty when assigning a variable");
          }

          this.env.values[name] = value;
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
            const value = createValue(arg2.value as any < arg1.value);
            if (value) {
              this.push(value);
              break;
            }
          }

          this.fatal("mismatched types for less");
          break;
        }

        case OpCode.Equal: {
          const arg1 = this.pop();
          const arg2 = this.pop();

          if (!arg1 || !arg2) {
            this.fatal("not enough arguments given to equal");
          }

          // both strings or both numbers
          if (
            (arg1.type === ValueType.String && arg2.type === ValueType.String)
            || (arg1.type === ValueType.Number && arg2.type === ValueType.Number)
          ) {
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


          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.push(this.pop());
          }

          const func = this.pop();
          if (!func || func.type !== ValueType.NativeFunction) {
            this.fatal("expected function");
          }

          const result = await func.value.apply(func.value, args);
          if (result) {
            this.push(result);
          }
          break;
        }

        case OpCode.Return: {
          if (this.stack.length > 0) {
            return this.pop();
          }
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