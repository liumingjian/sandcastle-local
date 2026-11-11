import { access, readFile, readdir, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { codex } from "@ai-hero/sandcastle";
import type { CodexOptions } from "@ai-hero/sandcastle";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";
import type { SeatbeltOptions } from "@ai-hero/sandcastle/sandboxes/seatbelt";
import { parse } from "smol-toml";

export { verifyCodexAuth } from "./auth.js";
export type { AuthVerification } from "./auth.js";

export interface LocalCodexOptions extends CodexOptions {
  readonly model?: string;
  readonly codexHome?: string;
  readonly sandboxOptions?: SeatbeltOptions;
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

async function resolveLocalProfile(options: { readonly codexHome?: string } = {}) {
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
  return { codexHome, config, sessionsDir: join(codexHome, "sessions") };
}

export async function resolveLocalCodex(options: LocalCodexOptions = {}) {
  const { config, ...profile } = await resolveLocalProfile(options);
  const model = options.model ?? config.model;
  if (typeof model !== "string" || model.trim() === "") {
    throw new Error("请传入 model / --model，或在 Codex config.toml 中设置 model。");
  }
  return { ...profile, model };
}

export type LocalCodexAdapter = Awaited<ReturnType<typeof resolveLocalCodex>> & {
  readonly agent: ReturnType<typeof codex>;
  readonly sandbox: ReturnType<typeof seatbelt>;
};

type LocalProviders = { readonly codex: typeof codex; readonly seatbelt: typeof seatbelt };

async function linkedSkillPaths(codexHome: string): Promise<string[]> {
  const visited = new Set<string>();
  const external = new Set<string>();
  const home = await realpath(homedir());
  async function visit(path: string): Promise<void> {
    let target: string;
    try {
      target = await realpath(path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    if (visited.has(target)) return;
    visited.add(target);
    if (!contains(codexHome, target)) {
      if (contains(target, home)) throw new Error("技能链接不能指向整个用户目录或其父目录。请链接具体技能目录。");
      external.add(target);
    }
    if (!(await stat(target)).isDirectory()) return;
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) await visit(join(target, entry.name));
    }
  }
  await visit(join(codexHome, "skills"));
  return [...external].filter(path => ![...external].some(parent => parent !== path && contains(parent, path)));
}

async function providersFor(profile: { codexHome: string; sessionsDir: string }): Promise<LocalProviders> {
  const skillMounts = (await linkedSkillPaths(profile.codexHome)).map(path => ({
    hostPath: path, sandboxPath: path, readonly: true,
  }));
  return {
    codex: (model: string, options: CodexOptions = {}) => codex(model, {
      ...options,
      sessionStorage: {
        hostSessionsDir: profile.sessionsDir,
        sandboxSessionsDir: profile.sessionsDir,
        ...options.sessionStorage,
      },
    }),
    seatbelt: (options: SeatbeltOptions = {}) => seatbelt({
      ...options,
      env: {
        ...(process.env.SANDCASTLE_BROWSER_ENDPOINT ? { SANDCASTLE_BROWSER_ENDPOINT: process.env.SANDCASTLE_BROWSER_ENDPOINT } : {}),
        ...options.env, CODEX_HOME: profile.codexHome,
      },
      mounts: [
        ...(options.mounts ?? []),
        { hostPath: profile.codexHome, sandboxPath: profile.codexHome, readonly: false },
        ...skillMounts,
      ],
    }),
  };
}

export async function localCodexProviders(options: { readonly codexHome?: string } = {}): Promise<LocalProviders> {
  return providersFor(await resolveLocalProfile(options));
}

export async function codexOnSeatbelt(options: LocalCodexOptions = {}): Promise<LocalCodexAdapter> {
  const resolved = await resolveLocalCodex(options);
  const { model: _model, codexHome: _codexHome, sandboxOptions, ...agentOptions } = options;
  const providers = await providersFor(resolved);
  const agent = providers.codex(resolved.model, agentOptions);
  const sandbox = providers.seatbelt(sandboxOptions);
  return { agent, sandbox, ...resolved };
}
