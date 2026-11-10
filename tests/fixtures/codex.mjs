#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli fixture\n");
  process.exit(0);
}
const input = await new Promise(resolve => {
  let text = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { text += chunk; });
  process.stdin.on("end", () => resolve(text));
});
const root = process.env.CODEX_HOME;
if (JSON.parse(readFileSync(join(root, "auth.json"), "utf8")).fixture !== true) {
  throw new Error("Expected isolated fixture login");
}
const args = process.argv.slice(2);
const verb = args[1];
const id = verb === "resume" ? args[2] : randomUUID();
const sessions = join(root, "sessions", "2026", "11", "10");
mkdirSync(sessions, { recursive: true });
const session = join(sessions, `rollout-fixture-${id}.jsonl`);
appendFileSync(session, JSON.stringify({ type: "session_meta", payload: { id, cwd: process.cwd() } }) + "\n");
const git = argv => execFileSync("git", argv, { stdio: "ignore" });
if (input.includes("MAKE_COMMIT")) {
  writeFileSync("agent-result.txt", "local CLI fixture completed\n");
  git(["add", "agent-result.txt"]);
  git(["commit", "-m", "test: produce a sandbox commit"]);
}
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: id }) + "\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "fixture completed" } }) + "\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }) + "\n");
