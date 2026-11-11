import { spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localCodexProviders } from "./index.js";

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
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const key = arg.split("=", 1)[0];
    if (key !== "--agent" && key !== "--sandbox") {
      forwarded.push(arg);
      continue;
    }
    const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[++index];
    const expected = key === "--agent" ? "codex" : "seatbelt";
    if (value !== expected) throw new Error(`${key} 固定为 ${expected}，仅支持本机 Codex + Seatbelt。`);
  }
  return [...forwarded, "--agent", "codex", "--sandbox", "seatbelt"];
}

export async function initialize(args: string[], cwd = process.cwd()) {
  const forwarded = fixedProviderArgs(args);
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
  const adapted = original.replace(/"@ai-hero\/sandcastle(?:\/sandboxes\/seatbelt)?"/gu,
    '"@liumingjian/sandcastle-local/providers"');
  if (adapted === original) throw new Error("上游模板的 provider 导入已变化，请先更新适配并验证。");
  await writeFile(mainPath, adapted);
  await configureBrowser(cwd);
  const envPath = join(directory, ".env.example");
  const env = await readFile(envPath, "utf8");
  await writeFile(envPath, env.replace(/^# OpenAI API key[^\n]*\nCODEX_API_KEY=\n/mu,
    "# Codex uses the existing local login; no Codex API key is required.\n"));
  process.stdout.write("\n已自动接入本机 Codex 登录和浏览器桥接，可按上游说明自定义提示词并运行生成的脚本。\n");
  process.stdout.write('运行前请确认项目是 Git 仓库且已有首次提交（git rev-parse --verify HEAD）。\n新仓库可先提交项目文件，或执行 git commit --allow-empty -m "Initial commit" 建立基线。\n');
  return 0;
}

export async function configureBrowser(cwd = process.cwd()) {
  const directory = join(cwd, ".sandcastle");
  const mainName = (await readdir(directory)).find(name => /^main\.(mts|ts)$/u.test(name));
  if (!mainName) throw new Error("未找到 .sandcastle/main.mts 或 main.ts，请先初始化项目。");
  const mainPath = join(directory, mainName);
  const main = await readFile(mainPath, "utf8");
  if (!main.includes('"@liumingjian/sandcastle-local/providers"')) {
    throw new Error("入口未使用本机 providers，无法自动接入浏览器环境变量。");
  }
  if (!main.includes(browserPrelude)) await writeFile(mainPath, browserPrelude + main);
  await writeFile(join(directory, "BROWSER.md"), browserInstructions);
  for (const name of await readdir(directory)) {
    if (name.endsWith("prompt.md")) {
      const path = join(directory, name);
      const prompt = await readFile(path, "utf8");
      if (!prompt.includes("<!-- sandcastle-local browser -->")) await writeFile(path, prompt + browserPrompt);
    }
  }
}

export const browserPrelude = 'import { startBrowserBridge } from "@liumingjian/sandcastle-local/browser";\n\nawait using browserBridge = await startBrowserBridge();\n\n';
export const browserPrompt = '\n\n<!-- sandcastle-local browser -->\nFor browser journeys and screenshots, read .sandcastle/BROWSER.md and use connectBrowser() from @liumingjian/sandcastle-local/browser. The entry point manages the host browser; launching Chromium inside Seatbelt fails with MachPortRendezvousServer permission errors.\n';

const browserInstructions = `# Browser testing under Seatbelt

The generated main entry point owns a lazy host Chromium server. Each Seatbelt
sandbox receives SANDCASTLE_BROWSER_ENDPOINT. Browser tests must connect through
the helper below instead of calling chromium.launch() inside Seatbelt.

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
