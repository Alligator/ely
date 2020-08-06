import { ElyVm } from "./vm.ts";
import { Value, ValueType, valueToString, createValue } from "./value.ts";

function print(...values: Array<Value>) {
  console.log(values.map(valueToString).join(' '));
}

async function read_line(): Promise<Value> {
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
};

function str(val: Value) {
  if (val.type === ValueType.Null) {
    throw new Error("cannot call string with a null value");
  }
  return createValue(val.value.toString());
};

function len(val: Value) {
  if (val.type !== ValueType.HashTable) {
    throw new Error(`cannot call len on a ${val.type}`);
  }
  return createValue(val.length);
};


function addRuntimeApi(vm: ElyVm) {
  vm.addNativeFunction('print',      Infinity, print);
  vm.addNativeFunction('read_line',  0,        read_line);
  vm.addNativeFunction('str',        1,        str);
  vm.addNativeFunction('len',        1,        len);
}

export { addRuntimeApi };
