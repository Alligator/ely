import { OpCode } from "./vm.ts";
import { createValue, RawValue, ValueType } from "./value.ts";

function oneArg(programCounter: number, code: Array<RawValue>): string {
  const op = code[programCounter];
  const arg = createValue(code[programCounter + 1]);
  
  switch (arg?.type) {
    case ValueType.String:
      return `${op} "${arg.value}"`;
    case ValueType.Number:
      return `${op} ${arg.value}`;
    case ValueType.Bool:
      return `${op} ${arg.value}`;
    case ValueType.NativeFunction:
      return `${op} [native function]`;
    case ValueType.Function:
      return `${op} ${arg.name}()`;
    default:
      return op.toString();
  }
}

function disassembleNextOpCode(programCounter: number, code: Array<RawValue>): [string, number] {
  const op = code[programCounter];

  switch (op) {
    case OpCode.DefineGlobal:
    case OpCode.PushImmediate:
    case OpCode.GetGlobal:
    case OpCode.Call:
    case OpCode.Jump:
    case OpCode.JumpIfNotEqual:
    case OpCode.JumpIfFalse:
    case OpCode.SetGlobal:
    case OpCode.SetLocal:
    case OpCode.GetLocal:
    case OpCode.SetUpvalue:
    case OpCode.GetUpvalue:
    case OpCode.Return:
    case OpCode.CreateHT:
      return [oneArg(programCounter, code), 2];
    case OpCode.Closure: {
      const fn = code[programCounter + 1];
      if (typeof fn === "object" && fn.type === ValueType.Function) {
        let output = `Closure ${fn.name}()`;
        for (let i = 0; i < fn.upValueCount * 2; i += 2) {
          output += ` (${code[programCounter + i + 2]}, ${code[programCounter + i + 3]})`;
        }
        return [output, programCounter + fn.upValueCount * 2 + 2];
      }
      return ['', programCounter + 1];
    }
    default:
      return [op.toString(), 1];
  }
}

export {
  disassembleNextOpCode,
};
