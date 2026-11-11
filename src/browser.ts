import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import type { Browser, BrowserServer } from "playwright-core";

const endpointKey = "SANDCASTLE_BROWSER_ENDPOINT";

/** Own a lazy host browser for the lifetime of a generated entry point. */
export async function startBrowserBridge(options: { readonly executablePath?: string } = {}) {
  const token = `/${randomUUID()}`;
  let launch: Promise<BrowserServer> | undefined;
  let closed = false;
  const server = createServer(async (request, response) => {
    if (closed || request.method !== "GET" || request.url !== token || request.headers.origin) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json");
    try {
      const executablePath = options.executablePath ?? process.env.BROWSER_EXECUTABLE_PATH;
      launch ??= chromium.launchServer({
        host: "127.0.0.1", headless: true,
        ...(executablePath ? { executablePath } : {}),
      }).catch(error => { launch = undefined; throw error; });
      const browser = await launch;
      response.end(JSON.stringify({ wsEndpoint: browser.wsEndpoint() }));
    } catch {
      response.writeHead(503).end(JSON.stringify({
        error: "宿主 Chromium 启动失败。请在宿主运行 npx playwright-core install chromium，或设置 BROWSER_EXECUTABLE_PATH 后重启任务。",
      }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  server.unref();
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法获取浏览器桥接地址。");
  const endpoint = `http://127.0.0.1:${address.port}${token}`;
  const previous = process.env[endpointKey];
  process.env[endpointKey] = endpoint;
  return {
    endpoint,
    async [Symbol.asyncDispose]() {
      if (closed) return;
      closed = true;
      if (process.env[endpointKey] === endpoint) {
        if (previous === undefined) delete process.env[endpointKey];
        else process.env[endpointKey] = previous;
      }
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      const browser = await launch?.catch(() => undefined);
      await browser?.close();
    },
  };
}

/** Connect from Seatbelt using the exact same Playwright version as the host. */
export async function connectBrowser(): Promise<Browser> {
  const endpoint = process.env[endpointKey];
  if (!endpoint) throw new Error("未配置浏览器桥接。请从生成的 .sandcastle/main.mts 入口启动任务。");
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(40_000) });
  const result = await response.json() as { wsEndpoint?: string; error?: string };
  if (!response.ok || !result.wsEndpoint) throw new Error(result.error ?? "浏览器桥接返回了无效响应。");
  return chromium.connect(result.wsEndpoint, { timeout: 30_000 });
}
