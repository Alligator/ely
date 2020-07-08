enum ValueType {
  String = "String",
  Number = "Number",
  Bool = "Bool",
  NativeFunction = "NativeFunction",
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

interface ValueBool {
  type: ValueType.Bool;
  value: boolean;
}

interface ValueNativeFunction {
  type: ValueType.NativeFunction;
  value: Function;
}

type Value =
  ValueString
  | ValueNumber
  | ValueBool
  | ValueNativeFunction;

type RawValue =
  number
  | string
  | boolean
  | Function;

function createValue(input: RawValue): Value {
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

function valueToString(val: Value): string {
  if (val.type === ValueType.Number) {
    return val.value.toString();
  }
  if (val.type === ValueType.String) {
    return `"${val.value}"`;
  }
  if (val.type === ValueType.NativeFunction) {
    return `(native func)`;
  }
  return val.value.toString();
}

export {
  ValueType,
  Value,
  RawValue,
  createValue,
  valueIsTruthy,
  valuesAreEqual,
  valueToString,
};