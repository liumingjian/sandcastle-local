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
  const envPath = join(directory, ".env.example");
  const env = await readFile(envPath, "utf8");
  await writeFile(envPath, env.replace(/^# OpenAI API key[^\n]*\nCODEX_API_KEY=\n/mu,
    "# Codex uses the existing local login; no Codex API key is required.\n"));
  process.stdout.write("\n已自动接入本机 Codex 登录，可按上游说明自定义提示词并运行生成的脚本。\n");
  return 0;
}
