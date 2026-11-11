import { localCodexProviders } from "./index.js";

export * from "@ai-hero/sandcastle";

const local = await localCodexProviders();
export const codex: typeof import("@ai-hero/sandcastle").codex = local.codex;
export const seatbelt: typeof import("@ai-hero/sandcastle/sandboxes/seatbelt").seatbelt = local.seatbelt;
