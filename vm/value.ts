enum ValueType {
  String = "String",
  Number = "Number",
  Bool = "Bool",
  Function = "Function",
  NativeFunction = "NativeFunction",
  HashTable = "HashTable",
  Null = "Null",
}

interface ValueString {
  type: ValueType.String;
  value: string;
}

interface ValueNumber {
  type: ValueType.Number;
  value: number;
}

interface ValueNull {
  type: ValueType.Null;
  value: null;
}

interface ValueBool {
  type: ValueType.Bool;
  value: boolean;
}

interface ValueNativeFunction {
  type: ValueType.NativeFunction;
  name: string;
  arity: number;
  value: Function;
}

interface ValueFunction {
  type: ValueType.Function;
  name: string;
  arity: number;
  value: Program;
}

interface ValueHashTable {
  type: ValueType.HashTable;
  value: { [key: string]: Value },
  length: number;
}

type Value =
  ValueString
  | ValueNumber
  | ValueNull
  | ValueBool
  | ValueNativeFunction
  | ValueFunction
  | ValueHashTable;

type RawValue =
  number
  | string
  | boolean
  | Function
  | ValueFunction;

type Program = Array<RawValue>;

function createValue(input: RawValue): Value {
  // TODO ugly, ugly hack
  if ((input as ValueFunction).name) {
    return input as ValueFunction;
  }

  if (typeof input === "number") {
    return {
      type: ValueType.Number,
      value: input,
    };
  }

  if (typeof input === "string") {
    return {
      type: ValueType.String,
      value: input,
    };
  }

  if (typeof input === "boolean") {
    return {
      type: ValueType.Bool,
      value: input,
    };
  }

  throw new Error(`unrecognised value type: ${input}`);
}

function createNullValue(): Value {
  return {
    type: ValueType.Null,
    value: null,
  };
}

function createFunctionValue(name: string, arity: number, program: Program): Value {
  return {
    type: ValueType.Function,
    value: program,
    name,
    arity,
  };
}

function createHashTableValue(): ValueHashTable {
  return {
    type: ValueType.HashTable,
    value: {},
    length: 0,
  };
}

function valueIsTruthy(val: Value): boolean {
  switch (val.type) {
    case ValueType.Bool:
      return val.value;
    case ValueType.Number:
      return val.value !== 0;
    case ValueType.String:
      return val.value.length > 0;
    default:
      return false;
  }
}

function valuesAreEqual(val1: Value, val2: Value): boolean {
  if (val1.type !== val2.type) {
    throw new Error("cannot compare values of different types");
  }

  return val1.value === val2.value;
}

function funcToString(val: ValueFunction | ValueNativeFunction): string {
  let args;
  if (val.arity === Infinity) {
    args = "...";
  } else {
    args = new Array(val.arity).fill("_").join(", ");
  }
  return `${val.name}(${args})`;
}

function valueToString(val: Value): string {
  switch (val.type) {
    case ValueType.Number:
      return val.value.toString();
    case ValueType.Null:
      return "null";
    case ValueType.String:
      return `${val.value}`;
    case ValueType.NativeFunction:
      return `${funcToString(val)} (native function)`;
    case ValueType.Function:
      return funcToString(val);

    case ValueType.HashTable: {
      const values = Object.keys(val.value).map((key) => {
        return `"${key}": ${valueToString(val.value[key])}`;
      });
      return `{ ${values.join(", ")} }`;
    }

    default:
      return val.value.toString();
  }
}

export {
  ValueType,
  Value,
  ValueNumber,
  ValueBool,
  RawValue,
  Program,
  createValue,
  createNullValue,
  createFunctionValue,
  createHashTableValue,
  valueIsTruthy,
  valuesAreEqual,
  valueToString,
};
