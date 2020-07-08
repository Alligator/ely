import { Args, parse } from "https://deno.land/std/flags/mod.ts";
import { Lexer, TokenType } from "./lexer.ts";
import { ElyVm, OpCode } from "./vm/vm.ts";
import { Compiler } from "./compiler/compiler.ts";

async function readLine() {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  await Deno.stdout.write(enc.encode("> "));

  const bytes = new Uint8Array(64);
  let read = await Deno.read(Deno.stdin.rid, bytes);

  if (read) {
    const text = dec.decode(bytes.slice(0, read - 2));
    return text;
  }

  return "";
}

async function repl(args: Args) {
  const compiler = new Compiler();
  const vm = new ElyVm();
  compiler.debug = args.debug;
  vm.debug = args.debug;

  while (true) {
    const line = await readLine();
    if (args.lex) {
      lex(line);
      continue;
    }
    try {
      const program = compiler.compile(line);
      const result = await vm.run(program);
      if (result) {
        console.log(result?.value);
      }
    } catch (e) {
      console.error(e.message);
    }
  }
}

function lex(source: string) {
  const lexer = new Lexer(source);

  let lineNo = -1;
  while (true) {
    const token = lexer.nextToken();

    if (lineNo !== lexer.line) {
      lineNo = lexer.line
      console.log(`\n${lineNo}: ${source.split(/\r?\n/)[lineNo - 1]}`);
    }


    switch (token.type) {
      case TokenType.String:
      case TokenType.Number:
      case TokenType.Identifier:
        console.log(`  ${token.type} "${token.value}"`);
        break;
      default:
        console.log(`  ${token.type}`);
    }

    if (token.type === TokenType.Error || token.type === TokenType.EOF) {
      break;
    }
  }
}

async function runFile(fileName: string, args: Args) {
  const file = await Deno.open(fileName, { read: true });
  const bytes = await Deno.readAll(file);
  Deno.close(file.rid);

  const dec = new TextDecoder();
  const source = dec.decode(bytes);

  if (args.lex) {
    lex(source);
    return;
  }

  const compiler = new Compiler();
  const vm = new ElyVm();
  compiler.debug = args.debug;
  vm.debug = args.debug;

  const program = compiler.compile(source);
  const result = await vm.run(program);
  if (result) {
    console.log(result?.value);
  }
}

const args = parse(Deno.args, {
  boolean: ["debug", "lex", "help"],
  default: { debug: false, lex: false, help: false },
});

if (args.help) {
  console.log(`\
usage: ely [OPTIONS] [SCRIPT]

OPTIONS:
    --debug   print debug compiler and vm output
    --lex     print the tokenised program and exit without running it`);
  Deno.exit(0);
}

if (args._.length > 0) {
  runFile(args._[0].toString(), args);
} else {
  repl(args);
}

// const lex = new Lexer(source);

// while (true) {
//   try {
//     const tok = lex.nextToken();
//     console.log(tok);
//     if (tok.type === TokenType.EOF) {
//       break;
//     }
//   } catch (e) {
//     console.error(e.message);
//     break;
//   }
// }

/*
let program: Array<RawValue> = [
  // name := alligator
  OpCode.Constant, "gate",
  OpCode.DefineLocal, "name",

  // print("guess my name")
  OpCode.PushImmediate, "guess my name",
  OpCode.Call, "print",

  // while true do
"LABEL_WHILE",
  OpCode.PushImmediate, true,
  OpCode.JumpIfFalse, "JMP_END",

  //   guess := read_line()
  OpCode.Call, "read_line",
  OpCode.DefineLocal, "guess",

  //   if guess == name then
  OpCode.PushVariable, "guess",
  OpCode.PushVariable, "name",
  OpCode.JumpIfNotEqual, "JMP_ELSE",

  //     print("you got it!")
  OpCode.PushImmediate, "you got it!",
  OpCode.Call, "print",

  //     break
  OpCode.Jump, "JMP_END_WHILE",

  //   else
"LABEL_ELSE",

  //     print("nope, try again!")
  OpCode.PushImmediate, "nope, try again!",
  OpCode.Call, "print",

  //   end
"LABEL_END_IF",
  OpCode.Jump, "JMP_WHILE",

  // end
"LABEL_END_WHILE",
  OpCode.Halt,
];
let program = [
  OpCode.PushImmediate, 3,
  OpCode.PushImmediate, 5,
  OpCode.Add,
  OpCode.Return,
];

const labels: { [label: string]: number } = {};
let pc = 0;
program = program.filter((instr) => {
  if (typeof instr === "string" && instr.startsWith("LABEL_")) {
    labels[instr] = pc;
    return false;
  }
  pc++;
  return true;
});

program = program.map((instr) => {
  if (typeof instr === "string" && instr.startsWith("JMP_")) {
    const label = instr.replace("JMP_", "LABEL_");
    return labels[label];
  }
  return instr;
});
*/

// program.forEach((instr, index) => {
//   console.log(`${index}: ${instr}`);
// });

// const vm = new ElyVm();
// vm.debug = true;
// const result = await vm.run(program);
// console.log(result?.value);