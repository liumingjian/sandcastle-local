import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Write = typeof process.stdout.write;

/**
 * Mirror the entry point's own stdout/stderr into a log file, and record the
 * error that ends the run. Upstream logs each agent separately; without this,
 * orchestration output such as rejected pipelines and the final crash is lost.
 */
export function startRunLog(path = ".sandcastle/logs/entry.log") {
  const file = resolve(path);
  mkdirSync(dirname(file), { recursive: true });
  const append = (text: string) => {
    try { appendFileSync(file, text); } catch { /* logging must never break the run */ }
  };
  append(`\n--- Entry started: ${new Date().toISOString()} ---\n`);
  const tee = (stream: NodeJS.WriteStream) => {
    const original: Write = stream.write.bind(stream);
    stream.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      append(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return (original as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as Write;
    return () => { stream.write = original; };
  };
  const restore = [tee(process.stdout), tee(process.stderr)];
  // Stays registered after dispose: `await using` disposes before a top-level
  // rejection reaches Node, and the fatal error is the line that matters most.
  process.on("uncaughtExceptionMonitor", error => {
    append(`--- Entry crashed: ${new Date().toISOString()} ---\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  });
  return {
    path: file,
    [Symbol.dispose]() {
      for (const undo of restore) undo();
      append(`--- Entry exiting: ${new Date().toISOString()} ---\n`);
    },
  };
}
