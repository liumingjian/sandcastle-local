import { access, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { codex } from "@ai-hero/sandcastle";
import type { CodexOptions } from "@ai-hero/sandcastle";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";
import { parse } from "smol-toml";

export interface LocalCodexOptions {
  readonly model?: string;
  readonly effort?: CodexOptions["effort"];
  readonly codexHome?: string;
}

async function readConfig(directory: string) {
  const file = join(directory, "config.toml");
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw new Error("无法读取 Codex config.toml。请检查权限。");
  }
  try {
    return parse(contents);
  } catch {
    throw new Error("Codex config.toml 格式无效。请先修复配置。");
  }
}

function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

export async function resolveLocalCodex(options: LocalCodexOptions = {}) {
  if (process.platform !== "darwin") {
    throw new Error("首版仅支持 macOS 14+ 的 Seatbelt；不支持 Windows、WSL 或 Linux。");
  }
  const requested = options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const expanded = requested === "~" ? homedir() : requested.startsWith("~/")
    ? join(homedir(), requested.slice(2)) : requested;
  let codexHome: string;
  try {
    codexHome = await realpath(resolve(expanded));
    if (!(await stat(codexHome)).isDirectory()) throw new Error();
    await access(codexHome, constants.R_OK | constants.W_OK);
  } catch {
    throw new Error("Codex 配置目录不存在或不可读写。请先在宿主机运行 codex login。");
  }
  if (contains(codexHome, await realpath(homedir()))) {
    throw new Error("CODEX_HOME 必须是专用目录，不能使用整个用户目录或其父目录。");
  }
  try {
    const auth = join(codexHome, "auth.json");
    if (!(await stat(auth)).isFile()) throw new Error();
    await access(auth, constants.R_OK);
  } catch {
    throw new Error("未找到可读的 Codex auth.json。首版仅复用文件登录，不支持仅存于 Keychain 的登录。");
  }
  const config = await readConfig(codexHome);
  const store = config.cli_auth_credentials_store;
  if (store !== undefined && store !== "file") {
    throw new Error("首版要求文件登录：cli_auth_credentials_store 应为 file 或未设置；不会自动修改宿主配置。");
  }
  const model = options.model ?? config.model;
  if (typeof model !== "string" || model.trim() === "") {
    throw new Error("请传入 model / --model，或在 Codex config.toml 中设置 model。");
  }
  return { codexHome, model, sessionsDir: join(codexHome, "sessions") };
}

export type LocalCodexAdapter = Awaited<ReturnType<typeof resolveLocalCodex>> & {
  readonly agent: ReturnType<typeof codex>;
  readonly sandbox: ReturnType<typeof seatbelt>;
};

export async function codexOnSeatbelt(options: LocalCodexOptions = {}): Promise<LocalCodexAdapter> {
  const resolved = await resolveLocalCodex(options);
  const agent = codex(resolved.model, {
    ...(options.effort === undefined ? {} : { effort: options.effort }),
    sessionStorage: {
      hostSessionsDir: resolved.sessionsDir,
      sandboxSessionsDir: resolved.sessionsDir,
    },
  });
  const sandbox = seatbelt({
    env: { CODEX_HOME: resolved.codexHome },
    mounts: [{ hostPath: resolved.codexHome, sandboxPath: resolved.codexHome, readonly: false }],
  });
  return { agent, sandbox, ...resolved };
}

export async function assertLocalRunEnvironment(cwd: string) {
  let contents: string;
  try {
    contents = await readFile(join(cwd, ".sandcastle", ".env"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw new Error("无法读取项目 .sandcastle/.env。");
  }
  for (const line of contents.split(/\r?\n/u)) {
    if (/^\s*(CODEX_API_KEY|OPENAI_API_KEY|CODEX_HOME)\s*=/u.test(line)) {
      throw new Error("请从项目 .sandcastle/.env 移除 CODEX_API_KEY、OPENAI_API_KEY 和 CODEX_HOME，避免覆盖宿主登录适配。");
    }
  }
}
