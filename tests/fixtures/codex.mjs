#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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
const model = args[args.indexOf("-m") + 1];
const failures = new Map([
  ["fixture-unauthorized", "401 Unauthorized: fixture-secret-must-not-appear"],
  ["fixture-forbidden", "403 Forbidden"],
  ["fixture-rate-limited", "429 quota exceeded"],
  ["fixture-network", "ECONNREFUSED connection failed"],
  ["fixture-model-unavailable", "model is not supported"],
]);
if (failures.has(model)) {
  process.stdout.write(JSON.stringify({ type: "turn.failed", error: { message: failures.get(model) } }) + "\n");
  process.exit(0);
}
const id = verb === "resume" ? args[2] : randomUUID();
const sessions = join(root, "sessions", "2026", "11", "10");
mkdirSync(sessions, { recursive: true });
const session = join(sessions, `rollout-fixture-${id}.jsonl`);
appendFileSync(session, JSON.stringify({ type: "session_meta", payload: { id, cwd: process.cwd() } }) + "\n");
const git = argv => execFileSync("git", argv, { stdio: "ignore" });
if (input.includes("BROWSER_PROBE")) {
  const { connectBrowser } = await import(pathToFileURL(join(process.cwd(), "node_modules/@liumingjian/sandcastle-local/dist/browser.js")));
  const browser = await connectBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('data:text/html,<button onclick="this.textContent=\'Passed\'">Run probe</button>');
    await page.getByRole("button", { name: "Run probe" }).click();
    if (await page.getByRole("button").textContent() !== "Passed") throw new Error("Browser interaction failed");
    mkdirSync("output/playwright", { recursive: true });
    await page.screenshot({ path: "output/playwright/probe.png" });
    const endpoint = process.env.SANDCASTLE_BROWSER_ENDPOINT;
    const { wsEndpoint } = await (await fetch(endpoint)).json();
    writeFileSync("browser-result.json", JSON.stringify({ endpoint, wsEndpoint }));
    await context.close();
  } finally { await browser.close(); }
}
if (input.includes("MAKE_COMMIT")) {
  writeFileSync("agent-result.txt", "local CLI fixture completed\n");
  git(["add", "agent-result.txt"]);
  git(["commit", "-m", "test: produce a sandbox commit"]);
}
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: id }) + "\n");
const marker = input.match(/SANDCASTLE_AUTH_[a-f0-9-]+/u)?.[0];
const reply = model === "fixture-wrong-response" ? "unexpected response" : marker ?? (input.startsWith("Context:") ? input : "fixture completed");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: reply } }) + "\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }) + "\n");
