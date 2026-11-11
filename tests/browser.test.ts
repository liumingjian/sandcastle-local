import assert from "node:assert/strict";
import { test } from "node:test";
import { connectBrowser, startBrowserBridge } from "../src/browser.js";

test("browser bridge is lazy, local, rejects unrelated requests, and restores the environment", async () => {
  const previous = process.env.SANDCASTLE_BROWSER_ENDPOINT;
  const bridge = await startBrowserBridge({ executablePath: "/missing/chromium" });
  try {
    assert.equal(process.env.SANDCASTLE_BROWSER_ENDPOINT, bridge.endpoint);
    assert.equal(new URL(bridge.endpoint).hostname, "127.0.0.1");
    assert.equal((await fetch(new URL("/", bridge.endpoint))).status, 404);
    assert.equal((await fetch(bridge.endpoint, { headers: { origin: "https://example.com" } })).status, 404);
    await assert.rejects(connectBrowser(), /宿主 Chromium 启动失败/u);
    // Failed launches remain retryable rather than caching a rejected promise.
    await assert.rejects(connectBrowser(), /宿主 Chromium 启动失败/u);
  } finally { await bridge[Symbol.asyncDispose](); }
  assert.equal(process.env.SANDCASTLE_BROWSER_ENDPOINT, previous);
  await assert.rejects(fetch(bridge.endpoint));
  await bridge[Symbol.asyncDispose]();
});

test("browser clients require the generated entry point", async () => {
  const previous = process.env.SANDCASTLE_BROWSER_ENDPOINT;
  delete process.env.SANDCASTLE_BROWSER_ENDPOINT;
  try { await assert.rejects(connectBrowser(), /未配置浏览器桥接/u); }
  finally {
    if (previous !== undefined) process.env.SANDCASTLE_BROWSER_ENDPOINT = previous;
  }
});
