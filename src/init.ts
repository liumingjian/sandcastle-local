import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localCodexProviders } from "./index.js";
import { replaceAnchored, resolveSandboxMode, useHostSandbox } from "./sandbox-mode.js";
import type { SandboxMode } from "./sandbox-mode.js";

export async function upstreamInstallation() {
  const root = dirname(dirname(fileURLToPath(import.meta.resolve("@ai-hero/sandcastle"))));
  const upstream = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const own = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  if (own.version !== upstream.version || own.dependencies["@ai-hero/sandcastle"] !== upstream.version) {
    throw new Error("本包版本必须与精确依赖和实际安装的上游版本一致，请重新安装匹配的版本。");
  }
  return { version: upstream.version as string, cli: join(root, "dist", "main.js") };
}

function fixedProviderArgs(args: string[]) {
  const forwarded: string[] = [];
  let mode: SandboxMode | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const key = arg.split("=", 1)[0];
    if (key !== "--agent" && key !== "--sandbox") {
      forwarded.push(arg);
      continue;
    }
    const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[++index];
    if (key === "--agent" && value !== "codex") throw new Error("--agent 固定为 codex，仅支持本机 Codex。");
    if (key === "--sandbox") {
      if (value !== "host" && value !== "seatbelt") throw new Error("--sandbox 仅支持 host 或 seatbelt。");
      mode = value;
    }
  }
  // Upstream has no host choice for scaffolding; scaffold as Seatbelt, then switch.
  return { forwarded: [...forwarded, "--agent", "codex", "--sandbox", "seatbelt"], mode };
}

export async function initialize(args: string[], cwd = process.cwd()) {
  const { forwarded, mode: requested } = fixedProviderArgs(args);
  const mode = await resolveSandboxMode(requested);
  const upstream = await upstreamInstallation();
  await localCodexProviders();
  const result = spawnSync(process.execPath, [upstream.cli, "init", ...forwarded], { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) return result.status ?? (result.signal === "SIGINT" ? 130 : 1);
  const directory = join(cwd, ".sandcastle");
  const mainName = (await readdir(directory)).find(name => /^main\.(mts|ts)$/u.test(name));
  if (!mainName) throw new Error("上游未生成预期的初始化脚本，无法接入本机登录。");
  const mainPath = join(directory, mainName);
  const original = await readFile(mainPath, "utf8");
  let adapted = replaceAnchored(original, /"@ai-hero\/sandcastle(?:\/sandboxes\/seatbelt)?"/gu,
    '"@liumingjian/sandcastle-local/providers"', " provider 导入");
  if (mode === "host") adapted = useHostSandbox(adapted);
  await writeFile(mainPath, runLogPrelude + adapted);
  await configureBrowser(cwd);
  await hardenPrompts(directory);
  const envPath = join(directory, ".env.example");
  const env = await readFile(envPath, "utf8");
  await writeFile(envPath, env.replace(/^# OpenAI API key[^\n]*\nCODEX_API_KEY=\n/mu,
    "# Codex uses the existing local login; no Codex API key is required.\n"));
  process.stdout.write("\n已自动接入本机 Codex 登录和浏览器桥接，可按上游说明自定义提示词并运行生成的脚本。\n");
  if (mode === "host") process.stdout.write("Agent 将直接在宿主机上以当前用户的全部权限运行，不受任何沙箱限制。\n");
  process.stdout.write('运行前请确认项目是 Git 仓库且已有首次提交（git rev-parse --verify HEAD）。\n新仓库可先提交项目文件，或执行 git commit --allow-empty -m "Initial commit" 建立基线。\n');
  return 0;
}

export async function configureBrowser(cwd = process.cwd(), entry?: string) {
  const directory = join(cwd, ".sandcastle");
  const candidates = entry ? [entry] : [".sandcastle/main.mts", ".sandcastle/main.ts", "main.mts", "main.ts"];
  const entries: { path: string; source: string }[] = [];
  for (const name of candidates) {
    const path = resolve(cwd, name);
    let source: string;
    try { source = await readFile(path, "utf8"); }
    catch (error) {
      if (!entry && error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    if (!/["']@liumingjian\/sandcastle-local\/providers["']/u.test(source)) {
      if (entry) throw new Error("入口未使用本机 providers，无法自动接入浏览器环境变量。");
      continue;
    }
    entries.push({ path, source });
  }
  if (!entries.length) throw new Error("未找到使用本机 providers 的入口；可用 setup-browser --entry PATH 指定。");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "BROWSER.md"), browserInstructions);
  for (const { path, source } of entries) {
    let adapted = source.replace(/\bcopyToWorktree\s*(?::|=)\s*\[([^\]]*)\]/gu, (match, items: string) =>
      items.includes(".sandcastle/BROWSER.md") ? match : match.replace("[", '[".sandcastle/BROWSER.md", '));
    if (!adapted.includes(browserPrelude)) adapted = browserPrelude + adapted;
    if (adapted !== source) await writeFile(path, adapted);
  }
  for (const name of await readdir(directory)) {
    if (name.endsWith("prompt.md")) {
      const path = join(directory, name);
      const prompt = await readFile(path, "utf8");
      if (!prompt.includes("<!-- sandcastle-local browser -->")) await writeFile(path, prompt + browserPrompt);
    }
  }
  return entries.map(({ path }) => path);
}

export const browserPrelude = 'import { startBrowserBridge } from "@liumingjian/sandcastle-local/browser";\n\nawait using browserBridge = await startBrowserBridge();\n\n';
export const browserPrompt = '\n\n<!-- sandcastle-local browser -->\nFor browser journeys and screenshots, read .sandcastle/BROWSER.md and use connectBrowser() from @liumingjian/sandcastle-local/browser. The entry point manages the host browser; under Seatbelt, launching Chromium in the sandbox fails with MachPortRendezvousServer permission errors.\n';

const browserInstructions = `# Browser testing under Seatbelt

The generated main entry point owns a lazy host Chromium server. Each Seatbelt
sandbox receives SANDCASTLE_BROWSER_ENDPOINT. Browser tests must connect through
the helper below instead of calling chromium.launch() inside Seatbelt.
The scaffold includes this file in copyToWorktree even when .sandcastle is ignored.
Custom entry points must retain this copy along with their existing copy paths.

\`\`\`ts
import { connectBrowser } from "@liumingjian/sandcastle-local/browser";

const browser = await connectBrowser();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Navigate to the app, run real assertions, and save screenshots/traces.
  // Use output/playwright/ for artifacts.
  await context.close();
} finally {
  await browser.close();
}
\`\`\`

For Playwright Test, override the browser fixture with connectBrowser() and close
the connection in the fixture teardown. Keep the project's own assertions and
screenshot baselines. Each parallel test must use its own browser context.

If the browser is missing, ask the operator to run
\`npx playwright-core install chromium\` on the host before restarting the task,
or set BROWSER_EXECUTABLE_PATH to an installed Chromium executable on the host.
Do not repeatedly reinstall browsers or add --no-sandbox inside Seatbelt.

The browser uses a fresh profile and runs with host permissions. The client stays
inside Seatbelt. Connections are local and use a per-run endpoint. The entry
point closes the browser when its orchestration completes or throws. A successful
connection or screenshot capture alone does not establish product acceptance.
`;

export const runLogPrelude = 'import { startRunLog } from "@liumingjian/sandcastle-local/run-log";\n\nusing runLog = startRunLog();\n\n';

export const blockedPrompt = `

<!-- sandcastle-local blocked -->
# BLOCKED

If the remaining work cannot be finished from this machine (a decision only a human can make, a missing credential, an external system you cannot reach), stop retrying. Commit what is done, hand the issue to a human using the issue tracker's conventions (for GitHub: replace the \`ready-for-agent\` label with \`ready-for-human\`), state the exact blocker once on the issue, then output <promise>COMPLETE</promise>.

Keep the issue to one progress note per run: edit your previous note (for GitHub: \`gh issue comment <ID> --edit-last\`) instead of adding a new one.
`;

export const mergeBlockedPrompt = `

<!-- sandcastle-local blocked -->
Leave open any issue that was handed to a human (for GitHub: labelled \`ready-for-human\`); merge its branch but do not close it.
`;

const fullDiff = "!`git diff {{TARGET_BRANCH}}...{{BRANCH}}`";
export const reviewDiff = `!\`git diff --stat {{TARGET_BRANCH}}...{{BRANCH}}\`

Read each changed file's diff with \`git diff {{TARGET_BRANCH}}...{{BRANCH}} -- <path>\`. Skip generated, minified, lock and binary files; they make the review exceed the context window.`;

/** Apply local orchestration fixes to upstream prompts; idempotent. */
export async function hardenPrompts(directory: string) {
  for (const name of await readdir(directory)) {
    if (!name.endsWith("prompt.md")) continue;
    const path = join(directory, name);
    const prompt = await readFile(path, "utf8");
    let adapted = prompt.replace(fullDiff, reviewDiff);
    if (!adapted.includes("<!-- sandcastle-local blocked -->")) {
      if (name === "implement-prompt.md" || (name === "prompt.md" && adapted.includes("<promise>COMPLETE</promise>"))) adapted += blockedPrompt;
      if (name === "merge-prompt.md") adapted += mergeBlockedPrompt;
    }
    if (adapted !== prompt) await writeFile(path, adapted);
  }
}
