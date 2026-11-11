#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { codexOnSeatbelt, verifyCodexAuth } from "./index.js";
import { configureBrowser, initialize, upstreamInstallation } from "./init.js";

const help = `sandcastle-local — 本机 Codex + Seatbelt

用法:
  sandcastle-local init [上游初始化选项]
  sandcastle-local setup-browser
  sandcastle-local doctor [--offline] [--codex-home PATH] [--model MODEL]
  sandcastle-local --version

init 固定使用本机 Codex 和 Seatbelt，其余初始化与模板流程沿用上游。
生成脚本自动复用本机登录，按上游说明执行，无需手动修改 provider。
使用 init --help 查看初始化选项。
doctor 默认发送最小模型请求验证登录；--offline 只检查本地配置。
setup-browser 为已有脚手架接入浏览器桥接，可重复执行。
`;

const initHelp = `sandcastle-local init

固定使用本机 Codex + Seatbelt；以下选项交由同版本上游处理：
  --template NAME                 选择上游模板；省略时交互选择
  --issue-tracker NAME            选择上游 issue tracker；省略时交互选择
  --model MODEL                   指定模板模型；省略时使用上游默认值
  --create-label true|false       是否创建 GitHub 标签
  --install-template-deps true|false  是否安装模板依赖

模板、issue tracker、提示词和运行方式均沿用上游。
本机登录目录通过 CODEX_HOME 或 ~/.codex 选择。
`;

async function main() {
  const args = process.argv.slice(2);
  const upstream = await upstreamInstallation();
  if (args.length === 1 && args[0] === "setup-browser") {
    await configureBrowser();
    process.stdout.write("已接入浏览器桥接。首次使用前在宿主运行 npx playwright-core install chromium，然后重新启动生成的入口。\n");
    return;
  }
  if (args.length === 1 && args[0] === "--version") {
    process.stdout.write(upstream.version + "\n");
    return;
  }
  if (args[0] === "init") {
    if (args.includes("--help") || args.includes("-h")) {
      process.stdout.write(initHelp);
      return;
    }
    process.exitCode = await initialize(args.slice(1));
    return;
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      offline: { type: "boolean" },
      model: { type: "string" },
      "codex-home": { type: "string" },
    },
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(help);
    return;
  }
  if (positionals.length !== 1 || positionals[0] !== "doctor") {
    throw new Error("仅支持 init、doctor 和 setup-browser。任务执行请运行初始化生成的脚本。");
  }
  const adapted = await codexOnSeatbelt({
    ...(values.model === undefined ? {} : { model: values.model }),
    ...(values["codex-home"] === undefined ? {} : { codexHome: values["codex-home"] }),
  });
  try {
    execFileSync("codex", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("宿主 PATH 中没有可运行的 codex CLI。请先安装并登录。");
  }
  if (!values.offline) process.stderr.write("正在 Seatbelt 内使用当前登录验证模型请求…\n");
  const auth = values.offline
    ? { status: "not_verified", message: "仅检查了本地文件，未验证授权有效性。" }
    : await verifyCodexAuth(adapted, shutdown.signal);
  process.stdout.write(JSON.stringify({
    platform: "macOS", sandbox: "Seatbelt", codexHome: adapted.codexHome,
    model: adapted.model, auth, sessions: "捕获已配置",
  }, null, 2) + "\n");
  if (auth.status === "failed") process.exitCode = 1;
}

const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort(new Error("用户中止运行。")));
process.once("SIGTERM", () => shutdown.abort(new Error("运行已终止。")));
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "运行失败。"}\n`);
  process.exitCode = 1;
});
