import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@ai-hero/sandcastle";
import { codexOnSeatbelt } from "../src/index.js";

const cwd = await realpath(await mkdtemp(join(tmpdir(), "sandcastle-local-live-")));
try {
  const git = (args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Sandcastle Local Verification"]);
  git(["config", "user.email", "verification@example.invalid"]);
  git(["commit", "--allow-empty", "-m", "Initial verification repository"]);
  const base = git(["rev-parse", "HEAD"]);
  const adapted = await codexOnSeatbelt();
  const result = await run({
    cwd, agent: adapted.agent, sandbox: adapted.sandbox,
    branchStrategy: { type: "branch", branch: "agent/live-verification" },
    prompt: "Reply exactly LOCAL_AUTH_OK. Do not use tools, run commands, or modify files.",
    signal: AbortSignal.timeout(120_000),
  });
  assert.match(result.stdout, /LOCAL_AUTH_OK/u);
  assert.equal(git(["rev-parse", "HEAD"]), base);
  const sessionPath = result.iterations[0]?.sessionFilePath;
  assert(sessionPath);
  await access(sessionPath);
  assert(result.resume);
  const resumed = await result.resume("Reply exactly LOCAL_RESUME_OK. Do not use tools or modify files.");
  assert.match(resumed.stdout, /LOCAL_RESUME_OK/u);
  assert.equal(resumed.iterations[0]?.sessionId, result.iterations[0]?.sessionId);
  process.stdout.write("PASS: real Codex CLI, existing file login, Seatbelt, named branch, session capture and resume.\n");
} finally {
  await rm(cwd, { recursive: true, force: true });
}
