import { Args, parse } from "https://deno.land/std/flags/mod.ts";
import { Lexer, TokenType } from "./lexer.ts";
import { ElyVm, OpCode } from "./vm/vm.ts";
import { Compiler } from "./compiler/compiler.ts";
import { RawValue, valueToString } from "./vm/value.ts";
import { disassembleNextOpCode } from "./vm/disasm.ts";

async function readLine() {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  await Deno.stdout.write(enc.encode("> "));

  const bytes = new Uint8Array(64);
  let read = await Deno.read(Deno.stdin.rid, bytes);

  if (read) {
    const text = dec.decode(bytes.slice(0, read - 1));
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
        console.log(valueToString(result));
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
    try {
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
    } catch(e) {
      console.error(e.message);
      Deno.exit(1);
    }
  }
}

async function runString(source: string, args: Args) {
  if (args.lex) {
    lex(source);
    return;
  }

  try {
    const compiler = new Compiler();
    const vm = new ElyVm();
    compiler.debug = args.debug;
    vm.debug = args.debug;

    if (args.debug) {
      console.log('compiling...');
    }
    const program = compiler.compile(source);

    if (args.debug) {
      console.log('\nbytecode:');
      let i = 0;
      while (i < program.length) {
        const [disasm, offset] = disassembleNextOpCode(i, program);
        console.log(`  ${('000' + i).slice(-4)} ${disasm}`);
        i += offset;
      }
    }

    if (args.debug) {
      console.log('\nrunning...');
    }

    const result = await vm.run(program);
    if (result) {
      console.log(result?.value);
    }
  } catch(e) {
    console.error(e.message);
    Deno.exit(1);
  }
}

const args = parse(Deno.args, {
  string: ["e"],
  boolean: ["debug", "lex", "help"],
  default: { e: null, debug: false, lex: false, help: false },
});

if (args.help) {
  console.log(`\
usage: ely [OPTIONS] [SCRIPT]

OPTIONS:
    -e STRING   execute the given string and exit
    --debug     print debug compiler and vm output
    --lex       print the tokenised program and exit without running it`);
  Deno.exit(0);
}

if (args._.length > 0) {
  const file = await Deno.open(args._[0].toString(), { read: true });
  const bytes = await Deno.readAll(file);
  Deno.close(file.rid);

  const dec = new TextDecoder();
  const source = dec.decode(bytes);

  await runString(source, args);
} else if (args.e) {
  await runString(args.e, args);
} else {
  await repl(args);
}
