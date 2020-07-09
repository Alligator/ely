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
    case ValueType.NativeFunction:
      return `${op} [native function]`;
    default:
      return op.toString();
  }
}

function disassembleNextOpCode(programCounter: number, code: Array<RawValue>): string {
  const op = code[programCounter];

  switch (op) {
    case OpCode.Constant:
    case OpCode.DefineLocal:
    case OpCode.PushImmediate:
    case OpCode.PushVariable:
    case OpCode.Call:
    case OpCode.Jump:
    case OpCode.JumpIfNotEqual:
    case OpCode.JumpIfFalse:
    case OpCode.SetLocal:
      return oneArg(programCounter, code);
    default:
      return op.toString();
  }
}

export {
  disassembleNextOpCode,
};