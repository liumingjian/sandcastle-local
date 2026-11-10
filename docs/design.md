# Local CLI adapter design

## Approved scope

On 2026-11-10, the user approved a separate `sandcastle-local` directory and private GitHub repository to implement the previously proposed local adapter. Preserve these decisions:

- Consume Sandcastle through its public npm API; do not patch `node_modules` or fork the engine.
- Use the host Codex CLI and existing file login through macOS Seatbelt.
- Expose the selected Codex directory read/write so Codex owns token refresh persistence.
- Preserve session capture/resumption by configuring both session roots explicitly.
- Support macOS first; do not implement Windows native isolation or silently fall back to no sandbox.
- Match upstream platform/version requirements; pin the dependency and verify upgrades.

The primary approval is the user message beginning “ok, 在当前创建一个 sandcastle-local 目录” in the originating chat. The accepted preceding proposal describes the `codexOnSeatbelt()` helper, writable Codex directory, and session path alignment. The first implementation is retained in this repository's initial Git commit.

## Implementation

`src/index.ts` validates the dedicated Codex directory and file login without reading or copying credential contents. It reads only the TOML configuration needed to select the model and credential storage mode, then combines the public `codex()` and `seatbelt()` providers. It injects CODEX_HOME at the sandbox level so both agent processes and `sandbox.exec()` use it.

Both session roots point at CODEX_HOME/sessions. A named worktree remains separate from the caller's checkout; the CLI requires a branch explicitly. The exported helper retains upstream composition and does not silently impose a branch strategy.

`src/cli.ts` provides doctor and one-shot run commands, rejects conflicting project credential variables, resolves prompt files against the target repository, and forwards cancellation. It never changes the host login configuration.

On 2026-11-10 the user requested concrete auth validation in doctor. This supersedes its original offline-only behavior: doctor now sends a minimal request using the same Seatbelt/provider configuration in a disposable Git repository, and requires a random response marker before reporting verified. It has a two-minute request timeout, supports cancellation, returns categorized failures without raw upstream messages, and leaves the caller's repository untouched. `--offline` explicitly retains local checks with status not_verified. `src/auth.ts` uses the upstream warm-sandbox API so doctor stdout remains JSON. Probe sessions may remain in the existing CODEX_HOME, as with other CLI requests.

## Compatibility baseline

- npm release: `@ai-hero/sandcastle@0.14.0`, checked 2026-11-10 and pinned exactly.
- macOS requirement: 14+, enforced by upstream's Seatbelt constructor/preflight.
- No upstream Node engines field exists; the adapter does not invent one. Node 22/24 form the CI verification matrix.
- Published 0.14.0 types differ from repository main: Codex effort excludes `max`, and sandbox provider handles are opaque. Implementation and tests use the installed public API.

Sources: [upstream repository baseline](https://github.com/mattpocock/sandcastle/tree/049bb4d1da248fc9a1c79f47d7fe6f7a673e3c16), [native provider documentation](https://github.com/mattpocock/sandcastle/blob/049bb4d1da248fc9a1c79f47d7fe6f7a673e3c16/docs/guide/sandbox-providers.md#native-sandboxes-bwrap-and-seatbelt), [Codex session configuration](https://github.com/mattpocock/sandcastle/blob/049bb4d1da248fc9a1c79f47d7fe6f7a673e3c16/src/AgentProvider.ts#L689-L733), [official authentication documentation](https://learn.chatgpt.com/docs/auth?surface=cli#credential-storage).

## Deliberate limits

Shared CODEX_HOME exposes all contents of that directory, rather than just auth.json. Mounting it read/write supports atomic token-file replacement and database/session writes. No adapter token-refresh protocol or credential synchronization is introduced.

Keychain-only/auto/ephemeral modes are outside this first version. Host defaults that depend on hidden absolute paths, separate skills directories, external MCP servers, or custom environment variables may require additional project setup; the adapter does not broadly expose those paths.

Each concurrent task must use a distinct branch. Offline tests verify concurrent file/session behavior; live token refresh races across multiple CLI processes remain dependent on Codex and are not claimed as verified.

## Acceptance evidence

See [verification.md](verification.md) for executed checks and their limits. An agent's completion signal is not a test gate. The library consumer remains responsible for project-specific tests and review before merging.
