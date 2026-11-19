import { createInterface } from "node:readline/promises";

export type SandboxMode = "host" | "seatbelt";

export const sandboxModes: readonly { mode: SandboxMode; label: string }[] = [
  { mode: "host", label: "host：宿主机运行，当前用户全部权限（Docker、gh 登录、SSH key、整个用户目录）；agent 会执行 issue 中的指令" },
  { mode: "seatbelt", label: "seatbelt：macOS 沙箱，只能写 worktree，Docker 等宿主资源不可用，GitHub 需配置 GH_TOKEN" },
];

/**
 * Replace an anchor in an upstream-generated file. A missing anchor means the
 * upstream template changed, so fail instead of producing a half-adapted file.
 */
export function replaceAnchored(text: string, pattern: RegExp, replacement: string, anchor: string) {
  const adapted = text.replace(pattern, replacement);
  if (adapted === text) throw new Error(`上游模板已变化（缺少${anchor}），请先更新适配并验证。`);
  return adapted;
}

/** Switch a scaffolded entry from seatbelt() to host(). Expects the local providers import already applied. */
export function useHostSandbox(source: string) {
  let adapted = replaceAnchored(source,
    /^import \{ seatbelt \} from "@liumingjian\/sandcastle-local\/providers";$/mu,
    'import { host } from "@liumingjian/sandcastle-local/providers";', " seatbelt 导入");
  adapted = replaceAnchored(adapted, /\bseatbelt\(/gu, "host(", " seatbelt() 调用");
  if (/\bseatbelt\b/u.test(adapted)) throw new Error("上游模板已变化（存在未识别的 seatbelt 引用），请先更新适配并验证。");
  return adapted;
}

async function askSandboxMode(): Promise<SandboxMode> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write("选择 agent 运行方式：\n");
    sandboxModes.forEach(({ label }, index) => process.stdout.write(`  ${index + 1}) ${label}\n`));
    for (;;) {
      const answer = (await terminal.question("请输入序号 [1]: ")).trim();
      const choice = sandboxModes[answer === "" ? 0 : Number(answer) - 1];
      if (choice) return choice.mode;
    }
  } finally {
    terminal.close();
  }
}

/** Use the explicit --sandbox value, ask on a terminal, and refuse to guess otherwise. */
export async function resolveSandboxMode(requested: SandboxMode | undefined, options: {
  readonly interactive?: boolean;
  readonly ask?: () => Promise<SandboxMode>;
} = {}): Promise<SandboxMode> {
  if (requested) return requested;
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) throw new Error("非交互模式需显式指定 --sandbox host 或 --sandbox seatbelt。");
  return (options.ask ?? askSandboxMode)();
}
