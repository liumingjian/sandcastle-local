import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, realpath, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { codex, createSandbox, run } from "@ai-hero/sandcastle";
import { codexOnSeatbelt, resolveLocalCodex, verifyCodexAuth } from "../src/index.js";
import { browserPrelude, browserPrompt } from "../src/init.js";
import { chromium } from "playwright-core";

test("CLI exposes upstream-style initialization with fixed local providers and matching version", () => {
  const cli = new URL("../src/cli.ts", import.meta.url);
  const help = execFileSync(process.execPath, ["--import", "tsx", cli.pathname, "--help"], { encoding: "utf8" });
  assert.match(help, /doctor/u);
  assert.match(help, /sandcastle-local init/u);
  const version = execFileSync(process.execPath, ["--import", "tsx", cli.pathname, "--version"], { encoding: "utf8" }).trim();
  const own = JSON.parse(execFileSync(process.execPath, ["-p", 'JSON.stringify(require("./package.json"))'], { encoding: "utf8" }));
  assert.equal(version, own.version);
  assert.equal(version, own.dependencies["@ai-hero/sandcastle"]);
  assert(!help.includes("--branch"));
  assert.throws(() => execFileSync(process.execPath, ["--import", "tsx", cli.pathname, "run"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }), error => error instanceof Error && "stderr" in error && /仅支持 init、doctor 和 setup-browser/u.test(String(error.stderr)));
  for (const args of [["--agent", "claude-code"], ["--agent=pi"], ["--sandbox", "docker"], ["--sandbox=no-sandbox"]]) {
    assert.throws(() => execFileSync(process.execPath, ["--import", "tsx", cli.pathname, "init", ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }), error => error instanceof Error && "stderr" in error && /固定为/u.test(String(error.stderr)));
  }
});

async function fixture(t: TestContext, initialCommit = true) {
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
  if (initialCommit) git(["commit", "--allow-empty", "-m", "Initial fixture"]);
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

test("initialized template executes without manual provider edits", { skip: process.platform !== "darwin", timeout: 60_000 }, async t => {
  const f = await fixture(t, false);
  const cli = new URL("../src/cli.ts", import.meta.url);
  const env = { ...process.env, CODEX_HOME: f.codexHome };
  await writeFile(join(f.codexHome, "config.toml"), 'cli_auth_credentials_store = "file"\n');
  const initialized = execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), cli.pathname,
    "init", "--model", "fixture-model", "--issue-tracker", "custom", "--template", "blank"], {
    cwd: f.repo, stdio: "pipe", timeout: 30_000, env, encoding: "utf8",
  });
  assert.match(initialized, /首次提交/u);
  assert.match(initialized, /git commit --allow-empty -m "Initial commit"/u);
  const mainPath = join(f.repo, ".sandcastle", "main.mts");
  const generated = await readFile(mainPath, "utf8");
  assert(generated.includes('agent: codex("fixture-model")'));
  assert(generated.includes("sandbox: seatbelt()"));
  assert(generated.includes('"@liumingjian/sandcastle-local/providers"'));
  assert(!generated.includes(f.codexHome));
  // Exercise migration of a pre-bridge scaffold, then verify it is idempotent.
  await writeFile(mainPath, generated.slice(browserPrelude.length));
  for (let index = 0; index < 2; index++) {
    execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), cli.pathname, "setup-browser"], {
      cwd: f.repo, stdio: "pipe", timeout: 15_000, env,
    });
    assert.equal(await readFile(mainPath, "utf8"), generated);
  }
  assert(!(await readFile(join(f.repo, ".sandcastle", ".env.example"), "utf8")).includes("CODEX_API_KEY="));
  assert.throws(() => execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), cli.pathname,
    "init", "--issue-tracker", "custom", "--template", "blank"], { cwd: f.repo, stdio: "pipe", env }));
  assert.equal(await readFile(mainPath, "utf8"), generated);
  await writeFile(join(f.repo, ".sandcastle", "prompt.md"), "MAKE_COMMIT\nBROWSER_PROBE\n");
  // Install a real package: a symlink back to this checkout is outside Seatbelt.
  const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", f.root], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", stdio: "pipe",
  }))[0].filename as string;
  execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(f.root, packed)], {
    cwd: f.repo, stdio: "pipe", timeout: 30_000,
  });
  const bin = join(f.root, "bin");
  await mkdir(bin);
  await copyFile(new URL("./fixtures/codex.mjs", import.meta.url), join(bin, "codex"));
  await chmod(join(bin, "codex"), 0o755);
  const git = (args: string[]) => execFileSync("git", args, { cwd: f.repo, encoding: "utf8", stdio: "pipe" }).trim();
  assert.throws(() => execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), mainPath], {
    cwd: f.repo, stdio: "pipe", timeout: 30_000,
    env: { ...env, PATH: `${bin}:${process.env.PATH ?? ""}` },
  }), error => error instanceof Error && "stderr" in error && /ambiguous argument 'HEAD'/u.test(String(error.stderr)));
  git(["commit", "--allow-empty", "-m", "Initial commit"]);
  const base = git(["rev-parse", "HEAD"]);
  execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), mainPath], {
    cwd: f.repo, stdio: "pipe", timeout: 30_000,
    env: { ...env, PATH: `${bin}:${process.env.PATH ?? ""}` },
  });
  assert.notEqual(git(["rev-parse", "HEAD"]), base);
  assert.equal(git(["rev-parse", "HEAD^"]), base);
  assert.equal(git(["branch", "--format=%(refname:short)"]), "main");
  assert.equal(await readFile(join(f.repo, "agent-result.txt"), "utf8"), "local CLI fixture completed\n");
  const screenshot = await readFile(join(f.repo, "output", "playwright", "probe.png"));
  assert.equal(screenshot.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const { endpoint, wsEndpoint } = JSON.parse(await readFile(join(f.repo, "browser-result.json"), "utf8"));
  await assert.rejects(fetch(endpoint));
  await assert.rejects(chromium.connect(wsEndpoint, { timeout: 1000 }));
});

test("all templates and issue tracker scaffolds retain upstream content", { skip: process.platform !== "darwin", timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const upstreamCli = new URL("../node_modules/@ai-hero/sandcastle/dist/main.js", import.meta.url);
  const localCli = new URL("../src/cli.ts", import.meta.url);
  const templates = await readdir(new URL("../node_modules/@ai-hero/sandcastle/dist/templates/", import.meta.url));
  for (const template of templates) {
    for (const tracker of ["custom", "github-issues", "beads"]) {
      const label = `${template}-${tracker}`;
      const upstreamDir = join(f.root, `${label}-upstream`);
      const localDir = join(f.root, `${label}-local`);
      await mkdir(upstreamDir);
      await mkdir(localDir);
      const flags = ["init", "--template", template, "--issue-tracker", tracker,
        "--create-label", "false", "--install-template-deps", "false"];
      execFileSync(process.execPath, [upstreamCli.pathname, ...flags, "--agent", "codex", "--sandbox", "seatbelt"], {
        cwd: upstreamDir, stdio: "pipe", timeout: 15_000,
      });
      execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), localCli.pathname, ...flags], {
        cwd: localDir, stdio: "pipe", timeout: 15_000, env: { ...process.env, CODEX_HOME: f.codexHome },
      });
      const files = await readdir(join(upstreamDir, ".sandcastle"));
      assert.deepEqual(await readdir(join(localDir, ".sandcastle")), [...files, "BROWSER.md"].sort(), label);
      assert.match(await readFile(join(localDir, ".sandcastle", "BROWSER.md"), "utf8"), /connectBrowser/u);
      for (const file of files) {
        const normalize = (text: string) => text.replace(/"(?:@ai-hero\/sandcastle(?:\/sandboxes\/seatbelt)?|@liumingjian\/sandcastle-local\/providers)"/gu, '"AUTH_PROVIDER"');
        let expected = await readFile(join(upstreamDir, ".sandcastle", file), "utf8");
        let actual = await readFile(join(localDir, ".sandcastle", file), "utf8");
        if (/^main\.(mts|ts)$/u.test(file)) {
          assert(actual.startsWith(browserPrelude));
          actual = actual.slice(browserPrelude.length);
        }
        if (file.endsWith("prompt.md")) {
          assert(actual.endsWith(browserPrompt));
          actual = actual.slice(0, -browserPrompt.length);
        }
        if (file === ".env.example") {
          expected = expected.split("\n").slice(2).join("\n");
          actual = actual.split("\n").slice(1).join("\n");
        }
        assert.equal(normalize(actual), normalize(expected), `${label}/${file}`);
      }
    }
  }
});

test("adapter preserves provider options and upstream run controls", { skip: process.platform !== "darwin", timeout: 60_000 }, async t => {
  const f = await fixture(t);
  const bin = join(f.root, "bin");
  await mkdir(bin);
  await copyFile(new URL("./fixtures/codex.mjs", import.meta.url), join(bin, "codex"));
  await chmod(join(bin, "codex"), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath ?? ""}`;
  t.after(() => { if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath; });
  const shared = join(f.root, "shared");
  await mkdir(shared);
  await writeFile(join(shared, "context.txt"), "mount-preserved");
  const providerOptions = { effort: "low", env: { AGENT_CONTEXT: "agent-preserved" }, captureSessions: false, approvalsReviewer: "auto_review" } as const;
  const adapted = await codexOnSeatbelt({
    codexHome: f.codexHome, model: "explicit-model", ...providerOptions,
    sandboxOptions: { env: { SANDBOX_CONTEXT: "sandbox-preserved" }, mounts: [{ hostPath: shared, sandboxPath: shared, readonly: true }], maxOutputTailChars: 4096 },
  });
  assert.equal(adapted.model, "explicit-model");
  assert.equal(adapted.agent.captureSessions, false);
  assert.deepEqual(adapted.agent.env, providerOptions.env);
  const commandOptions = { prompt: "fixture", cwd: f.repo, dangerouslySkipPermissions: true };
  assert.deepEqual(adapted.agent.buildPrintCommand(commandOptions), codex("explicit-model", providerOptions).buildPrintCommand(commandOptions));
  const prompt = join(f.repo, "prompt.md");
  await writeFile(prompt, "Context: !`printf '%s/%s/' \"$AGENT_CONTEXT\" \"$SANDBOX_CONTEXT\"; cat \"" + join(shared, "context.txt") + "\"`\n");
  const result = await run({
    cwd: f.repo, agent: adapted.agent, sandbox: adapted.sandbox,
    promptFile: prompt, maxIterations: 2,
    hooks: { sandbox: { onSandboxReady: [{ command: "printf hook-preserved > hook.txt" }] } },
  });
  assert.equal(result.iterations.length, 2);
  assert.equal(result.branch, "main");
  assert.equal(await readFile(join(f.repo, "hook.txt"), "utf8"), "hook-preserved");
  assert(result.stdout.includes("agent-preserved/sandbox-preserved/mount-preserved"));
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

test("Seatbelt reads external skill symlinks without granting writes or sibling access", { skip: process.platform !== "darwin" }, async t => {
  const f = await fixture(t);
  const external = await mkdtemp(join(homedir(), ".sandcastle-local-skills-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const skill = join(external, "skill");
  const nested = join(external, "references");
  await mkdir(skill);
  await mkdir(nested);
  await writeFile(join(skill, "SKILL.md"), "fixture skill");
  await writeFile(join(nested, "guide.md"), "fixture reference");
  await writeFile(join(external, "secret.txt"), "unrelated");
  await symlink(nested, join(skill, "references"));
  await symlink(skill, join(skill, "cycle"));
  const skills = join(f.codexHome, "skills");
  await mkdir(skills);
  await symlink(skill, join(skills, "linked"));
  await symlink(join(external, "missing"), join(skills, "broken"));
  const { sandbox } = await codexOnSeatbelt({ codexHome: f.codexHome });
  const handle = await createSandbox({ cwd: f.repo, sandbox, branch: "agent/skills" });
  try {
    const probe = `
      const fs = require('node:fs');
      const path = require('node:path');
      const skill = path.join(process.env.CODEX_HOME, 'skills', 'linked');
      if (fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8') !== 'fixture skill') process.exit(1);
      if (fs.readFileSync(path.join(skill, 'references', 'guide.md'), 'utf8') !== 'fixture reference') process.exit(2);
      for (const action of [
        () => fs.writeFileSync(path.join(skill, 'SKILL.md'), 'changed'),
        () => fs.readFileSync(${JSON.stringify(join(external, "secret.txt"))}),
      ]) {
        let denied = false;
        try { action(); } catch { denied = true; }
        if (!denied) process.exit(3);
      }
    `;
    const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
    const result = await handle.exec(`node -e ${quote(probe)}`);
    assert.equal(result.exitCode, 0, result.stderr);
  } finally { await handle.close(); }
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
