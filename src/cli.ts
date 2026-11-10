#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { run } from "@ai-hero/sandcastle";
import type { CodexOptions } from "@ai-hero/sandcastle";
import { assertLocalRunEnvironment, codexOnSeatbelt } from "./index.js";

const help = `sandcastle-local — macOS Seatbelt + 宿主 Codex CLI 登录

用法:
  sandcastle-local doctor [--codex-home PATH] [--model MODEL]
  sandcastle-local run --branch BRANCH (--prompt TEXT | --prompt-file PATH)
    [--cwd PATH] [--model MODEL] [--effort high] [--codex-home PATH]

运行结果留在指定分支，不自动合并。模型默认读取宿主 config.toml。
复用整个 Codex 目录的读写权限，包括配置、登录和会话。
`;

function effortOf(value: string | undefined): CodexOptions["effort"] {
  switch (value) {
    case undefined: case "low": case "medium": case "high": case "xhigh": return value;
    default: throw new Error("effort 必须是 low、medium、high 或 xhigh（与上游 0.14.0 发布包一致）。");
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      cwd: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      branch: { type: "string" },
      prompt: { type: "string" },
      "prompt-file": { type: "string" },
      "codex-home": { type: "string" },
    },
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(help);
    return;
  }
  const command = positionals[0];
  if (positionals.length !== 1 || (command !== "doctor" && command !== "run")) {
    throw new Error("仅支持 doctor 和 run。使用 --help 查看用法。");
  }
  const cwd = resolve(values.cwd ?? process.cwd());
  const effort = effortOf(values.effort);
  if (command === "run") {
    if (!values.branch?.trim()) throw new Error("run 必须指定 --branch，避免直接修改当前工作目录。");
    if ((values.prompt === undefined) === (values["prompt-file"] === undefined)) {
      throw new Error("必须且只能指定 --prompt 或 --prompt-file。");
    }
    execFileSync("git", ["check-ref-format", "--branch", values.branch], { stdio: "ignore" });
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd, stdio: "ignore" });
    await assertLocalRunEnvironment(cwd);
  }
  const adapted = await codexOnSeatbelt({
    ...(values.model === undefined ? {} : { model: values.model }),
    ...(values["codex-home"] === undefined ? {} : { codexHome: values["codex-home"] }),
    ...(effort === undefined ? {} : { effort }),
  });
  try {
    execFileSync("codex", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("宿主 PATH 中没有可运行的 codex CLI。请先安装并登录。");
  }
  if (command === "doctor") {
    process.stdout.write(JSON.stringify({
      platform: "macOS", sandbox: "Seatbelt", codexHome: adapted.codexHome,
      model: adapted.model, auth: "文件登录可读（未向模型发送请求）", sessions: "捕获已配置",
    }, null, 2) + "\n");
    return;
  }
  const prompt = values["prompt-file"] === undefined ? values.prompt
    : await readFile(resolve(cwd, values["prompt-file"]), "utf8");
  if (!prompt?.trim() || !values.branch) throw new Error("任务内容不能为空。");
  const result = await run({
    cwd, agent: adapted.agent, sandbox: adapted.sandbox,
    branchStrategy: { type: "branch", branch: values.branch },
    prompt, maxIterations: 1,
    signal: AbortSignal.any([AbortSignal.timeout(30 * 60 * 1000), shutdown.signal]),
  });
  process.stdout.write(JSON.stringify({
    branch: result.branch, commits: result.commits,
    sessions: result.iterations.map(iteration => iteration.sessionId),
    logFilePath: result.logFilePath,
  }, null, 2) + "\n");
}

const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort(new Error("用户中止运行。")));
process.once("SIGTERM", () => shutdown.abort(new Error("运行已终止。")));
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "运行失败。"}\n`);
  process.exitCode = 1;
});
