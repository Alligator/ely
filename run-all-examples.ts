for await (const file of Deno.readDir("examples")) {
  if (file.isFile && file.name.endsWith(".ely")) {
    console.log(`\x1b[96mrunning ${file.name}\x1b[0m`);
    const p = Deno.run({
      cmd: ["deno", "run", "-A", "main.ts", `examples/${file.name}`],
    });
    await p.status();
  }
}