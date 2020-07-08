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
      return oneArg(programCounter, code);
    case OpCode.DefineLocal:
      return oneArg(programCounter, code);
    case OpCode.PushImmediate:
      return oneArg(programCounter, code);
    case OpCode.PushVariable:
      return oneArg(programCounter, code);
    case OpCode.Call:
      return oneArg(programCounter, code);
    case OpCode.Jump:
      return oneArg(programCounter, code);
    case OpCode.JumpIfNotEqual:
      return oneArg(programCounter, code);
    case OpCode.JumpIfFalse:
      return oneArg(programCounter, code);
    default:
      return op.toString();
  }
}

export {
  disassembleNextOpCode,
};