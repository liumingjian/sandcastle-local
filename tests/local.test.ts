import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { createSandbox, run } from "@ai-hero/sandcastle";
import { assertLocalRunEnvironment, codexOnSeatbelt, resolveLocalCodex, verifyCodexAuth } from "../src/index.js";

test("CLI validates required branch and mutually exclusive prompts before starting an agent", () => {
  const cli = new URL("../src/cli.ts", import.meta.url);
  const invoke = (args: string[]) => {
    try {
      return execFileSync(process.execPath, ["--import", "tsx", cli.pathname, ...args], {
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      if (error instanceof Error && "stderr" in error && typeof error.stderr === "string") return error.stderr;
      throw error;
    }
  };
  assert.match(invoke(["--help"]), /doctor/u);
  assert.match(invoke(["run", "--prompt", "fixture"]), /必须指定 --branch/u);
  assert.match(invoke(["run", "--branch", "agent/test", "--prompt", "fixture", "--prompt-file", "prompt.md"]), /只能指定/u);
  assert.match(invoke(["run", "--branch", "agent/test", "--prompt", "fixture", "--effort", "invalid"]), /effort 必须/u);
});

async function fixture(t: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "sandcastle-local-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const codexHome = join(root, "codex home");
  const repo = join(root, "repo");
  await mkdir(codexHome);
  await mkdir(repo);
  await writeFile(join(codexHome, "auth.json"), '{"fixture":true}\n', { mode: 0o600 });
  await writeFile(join(codexHome, "config.toml"), 'model = "fixture-model"\ncli_auth_credentials_store = "file"\n');
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["commit", "--allow-empty", "-m", "Initial fixture"]);
  return { root, codexHome, repo };
}

test("unsupported operating systems fail without a sandbox fallback", { skip: process.platform === "darwin" }, async () => {
  await assert.rejects(resolveLocalCodex({ model: "fixture" }), /仅支持 macOS/u);
});

test("file login validation and model selection", { skip: process.platform !== "darwin" }, async t => {
  const f = await fixture(t);
  assert.equal((await resolveLocalCodex({ codexHome: f.codexHome })).model, "fixture-model");
  assert.equal((await resolveLocalCodex({ codexHome: f.codexHome, model: "override" })).model, "override");
  await writeFile(join(f.codexHome, "config.toml"), 'cli_auth_credentials_store = "keyring"\n');
  await assert.rejects(resolveLocalCodex({ codexHome: f.codexHome, model: "fixture" }), /文件登录/u);
  await writeFile(join(f.codexHome, "config.toml"), 'token = "do-not-print-this"\nbroken = [');
  await assert.rejects(resolveLocalCodex({ codexHome: f.codexHome }), error => {
    assert(error instanceof Error);
    assert(!error.message.includes("do-not-print-this"));
    return /格式无效/u.test(error.message);
  });
  await rm(join(f.codexHome, "auth.json"));
  await assert.rejects(resolveLocalCodex({ codexHome: f.codexHome }), /auth.json/u);
  await assert.rejects(resolveLocalCodex({ codexHome: homedir(), model: "fixture" }), /专用目录/u);
});

test("project env cannot override host login", async t => {
  const f = await fixture(t);
  await assertLocalRunEnvironment(f.repo);
  await mkdir(join(f.repo, ".sandcastle"));
  const path = join(f.repo, ".sandcastle", ".env");
  await writeFile(path, "# CODEX_API_KEY=comment\nGH_TOKEN=fixture\n");
  await assertLocalRunEnvironment(f.repo);
  await writeFile(path, "CODEX_API_KEY=\n");
  await assert.rejects(assertLocalRunEnvironment(f.repo), /移除/u);
});

test("doctor verifies a sandboxed request, reports auth rejection and supports offline checks", { skip: process.platform !== "darwin", timeout: 60_000 }, async t => {
  const f = await fixture(t);
  const bin = join(f.root, "bin");
  await mkdir(bin);
  const executable = join(bin, "codex");
  await copyFile(new URL("./fixtures/codex.mjs", import.meta.url), executable);
  await chmod(executable, 0o755);
  const cli = new URL("../src/cli.ts", import.meta.url);
  const invoke = (args: string[]) => {
    try {
      const stdout = execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), cli.pathname, "doctor", "--codex-home", f.codexHome, ...args], {
        cwd: f.repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
      });
      return { status: 0, stdout };
    } catch (error) {
      if (error instanceof Error && "status" in error && "stdout" in error && typeof error.stdout === "string") {
        return { status: error.status, stdout: error.stdout };
      }
      throw error;
    }
  };
  const verified = invoke([]);
  assert.equal(verified.status, 0);
  assert.equal(JSON.parse(verified.stdout).auth.status, "verified");
  const denied = invoke(["--model", "fixture-unauthorized"]);
  assert.equal(denied.status, 1);
  assert.equal(JSON.parse(denied.stdout).auth.code, "authentication_failed");
  assert(!denied.stdout.includes("fixture-secret-must-not-appear"));
  for (const [model, code] of [
    ["fixture-forbidden", "access_denied"],
    ["fixture-rate-limited", "rate_limited"],
    ["fixture-network", "network_error"],
    ["fixture-model-unavailable", "model_unavailable"],
  ]) {
    assert(model);
    const failure = invoke(["--model", model]);
    assert.equal(failure.status, 1);
    assert.equal(JSON.parse(failure.stdout).auth.code, code);
  }
  const wrongResponse = invoke(["--model", "fixture-wrong-response"]);
  assert.equal(wrongResponse.status, 1);
  assert.equal(JSON.parse(wrongResponse.stdout).auth.code, "invalid_response");
  const offline = invoke(["--offline", "--model", "fixture-unauthorized"]);
  assert.equal(offline.status, 0);
  assert.equal(JSON.parse(offline.stdout).auth.status, "not_verified");
  const adapter = await codexOnSeatbelt({ codexHome: f.codexHome });
  const cancelled = await verifyCodexAuth(adapter, AbortSignal.abort());
  assert.equal(cancelled.status, "failed");
  if (cancelled.status === "failed") assert.equal(cancelled.code, "timeout");
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: f.repo, encoding: "utf8" }), "");
});

test("real Seatbelt reuses login, persists refresh writes and denies unrelated home files", { skip: process.platform !== "darwin" }, async t => {
  const f = await fixture(t);
  const secretDir = await mkdtemp(join(homedir(), ".sandcastle-local-test-"));
  t.after(() => rm(secretDir, { recursive: true, force: true }));
  const secret = join(secretDir, "secret.txt");
  await writeFile(secret, "fixture-secret");
  const { sandbox } = await codexOnSeatbelt({ codexHome: f.codexHome });
  const handle = await createSandbox({ cwd: f.repo, sandbox, branch: "agent/probe" });
  try {
    const probe = `
      const fs = require('node:fs');
      const path = require('node:path');
      const auth = path.join(process.env.CODEX_HOME, 'auth.json');
      const login = JSON.parse(fs.readFileSync(auth, 'utf8'));
      login.refreshed = true;
      fs.writeFileSync(auth + '.tmp', JSON.stringify(login));
      fs.renameSync(auth + '.tmp', auth);
      let denied = false;
      try { fs.readFileSync(${JSON.stringify(secret)}); } catch { denied = true; }
      process.stdout.write(JSON.stringify({denied, privateHome: process.env.HOME !== ${JSON.stringify(homedir())}, login: login.fixture}));
    `;
    const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
    const result = await handle.exec(`node -e ${quote(probe)}`);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { denied: true, privateHome: true, login: true });
  } finally {
    await handle.close();
  }
  assert.equal(JSON.parse(await readFile(join(f.codexHome, "auth.json"), "utf8")).refreshed, true);
  const next = await createSandbox({ cwd: f.repo, sandbox, branch: "agent/probe-next" });
  try {
    const result = await next.exec('test -r "$CODEX_HOME/auth.json"');
    assert.equal(result.exitCode, 0);
  } finally { await next.close(); }
});

test("upstream run isolates branches, captures and resumes sessions, and runs parallel tasks", { skip: process.platform !== "darwin", timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const bin = join(f.root, "bin");
  await mkdir(bin);
  const executable = join(bin, "codex");
  await copyFile(new URL("./fixtures/codex.mjs", import.meta.url), executable);
  await chmod(executable, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath ?? ""}`;
  t.after(() => { if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath; });
  const git = (args: string[]) => execFileSync("git", args, { cwd: f.repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const base = git(["rev-parse", "HEAD"]);
  const adapted = await codexOnSeatbelt({ codexHome: f.codexHome });
  const first = await run({ cwd: f.repo, agent: adapted.agent, sandbox: adapted.sandbox,
    branchStrategy: { type: "branch", branch: "agent/first" }, prompt: "MAKE_COMMIT" });
  assert.equal(first.commits.length, 1);
  assert.equal(git(["rev-parse", "HEAD"]), base);
  assert.equal(git(["show", "agent/first:agent-result.txt"]), "local CLI fixture completed");
  await assert.rejects(access(join(f.repo, "agent-result.txt")));
  const sessionPath = first.iterations[0]?.sessionFilePath;
  assert(sessionPath);
  assert(sessionPath.startsWith(adapted.sessionsDir));
  await access(sessionPath);
  assert(first.resume);
  const resumed = await first.resume("Continue without changes");
  assert.equal(resumed.iterations[0]?.sessionId, first.iterations[0]?.sessionId);
  const siblings = await Promise.allSettled(["a", "b"].map(branch => run({
    cwd: f.repo, agent: adapted.agent, sandbox: adapted.sandbox,
    branchStrategy: { type: "branch", branch: `agent/parallel-${branch}` }, prompt: "MAKE_COMMIT",
  })));
  for (const sibling of siblings) {
    assert.equal(sibling.status, "fulfilled");
    if (sibling.status === "fulfilled") assert.equal(sibling.value.commits.length, 1);
  }
  assert.equal(git(["rev-parse", "HEAD"]), base);
});
