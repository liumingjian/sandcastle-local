import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "@ai-hero/sandcastle";
import type { LocalCodexAdapter } from "./index.js";

type FailureCode = "authentication_failed" | "access_denied" | "rate_limited"
  | "model_unavailable" | "network_error" | "timeout" | "invalid_response" | "request_failed";

type VerificationTime = { readonly checkedAt: string; readonly durationMs: number };
export type AuthVerification = VerificationTime & (
  | { readonly status: "verified"; readonly message: string }
  | { readonly status: "failed"; readonly code: FailureCode; readonly message: string }
);

const messages: Record<FailureCode, string> = {
  authentication_failed: "登录认证被拒绝，请在宿主机检查或重新登录 Codex。",
  access_denied: "当前登录或模型访问被拒绝，请检查账户与模型权限。",
  rate_limited: "请求受到限流或额度限制，暂时无法完成在线验证。",
  model_unavailable: "配置的模型不可用，请检查模型名称和账户权限。",
  network_error: "无法连接模型服务，请检查网络、代理和服务地址。",
  timeout: "在线验证已超时或取消，授权有效性尚未确认。",
  invalid_response: "模型没有返回预期验证标记，授权链路未通过验证。",
  request_failed: "模型请求未完成，请检查 Codex 配置或使用宿主 CLI 排查。",
};

function failureCode(error: unknown, signal: AbortSignal): FailureCode {
  if (signal.aborted) return "timeout";
  const message = error instanceof Error ? error.message : "";
  if (/\b401\b|unauthori[sz]ed|authentication|invalid.{0,20}(api.?key|token)|token.{0,20}(expired|invalid)|not logged in/iu.test(message)) return "authentication_failed";
  if (/\b403\b|forbidden|permission denied/iu.test(message)) return "access_denied";
  if (/\b429\b|rate.?limit|quota|usage limit/iu.test(message)) return "rate_limited";
  if (/model.{0,60}(not found|not supported|unavailable|does not exist)/iu.test(message)) return "model_unavailable";
  if (/network|connect|dns|fetch failed|certificate|\bECONN|\bENOTFOUND/iu.test(message)) return "network_error";
  if (/timed? ?out|timeout/iu.test(message)) return "timeout";
  return "request_failed";
}

export async function verifyCodexAuth(adapter: LocalCodexAdapter, cancellation?: AbortSignal): Promise<AuthVerification> {
  const started = Date.now();
  const signal = cancellation === undefined ? AbortSignal.timeout(120_000)
    : AbortSignal.any([cancellation, AbortSignal.timeout(120_000)]);
  const timing = () => ({ checkedAt: new Date().toISOString(), durationMs: Date.now() - started });
  let directory: string | undefined;
  try {
    signal.throwIfAborted();
    directory = await realpath(await mkdtemp(join(tmpdir(), "sandcastle-local-auth-")));
    for (const args of [
      ["init", "-b", "main"],
      ["config", "user.name", "Sandcastle Auth Check"],
      ["config", "user.email", "auth-check@example.invalid"],
      ["commit", "--allow-empty", "-m", "Initialize auth verification"],
    ]) {
      signal.throwIfAborted();
      execFileSync("git", args, { cwd: directory, stdio: "ignore", timeout: 10_000 });
    }
    const sandbox = await createSandbox({ cwd: directory, sandbox: adapter.sandbox, branch: "doctor/auth" });
    try {
      const marker = `SANDCASTLE_AUTH_${randomUUID()}`;
      const result = await sandbox.run({
        agent: adapter.agent,
        prompt: `Reply with exactly ${marker}. Do not use tools, run commands, or modify files.`,
        logging: { type: "stdout" },
        idleTimeoutSeconds: 60,
        signal,
      });
      if (!result.stdout.includes(marker)) {
        return { status: "failed", code: "invalid_response", message: messages.invalid_response, ...timing() };
      }
      return { status: "verified", message: "已在 Seatbelt 内使用当前登录完成真实模型请求。", ...timing() };
    } finally {
      await sandbox.close();
    }
  } catch (error) {
    const code = failureCode(error, signal);
    return { status: "failed", code, message: messages[code], ...timing() };
  } finally {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  }
}
