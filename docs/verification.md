# Verification record

Date: 2026-11-10. Dependency: npm `@ai-hero/sandcastle@0.14.0`.

## Executed locally

Host: macOS 26.6.2, Node 24.21.0, Codex CLI 0.166.0.

- Type checking and declaration build passed against the actual npm release.
- Real Seatbelt probes used a synthetic Codex home, including a path containing a space. They read the fixture login, performed an atomic credential-file replacement, observed the result from a subsequent sandbox, and failed to read an unrelated fixture under the host home. The sandbox retained a private HOME.
- A fixture CLI under real Seatbelt produced a Git commit on a named worktree, while the host branch stayed at its original HEAD. Its session was captured and resumed. Two more independent branches completed concurrently with separate sessions.
- CLI argument checks reject a missing branch, conflicting prompt inputs, and invalid effort before an agent starts. Configuration checks reject missing auth files, unsupported storage modes, malformed TOML, broad home-directory mounts, and conflicting project credential variables.
- `doctor` passed with the host's existing Codex installation and configuration.
- `npm run test:live` passed using the real Codex CLI and the host's existing file login: one response marker, session capture, and a second marker from resume of the same session. No extra API key was injected. The verification ran in a disposable Git repository, not a business repository.
- Dependency audit passed with no reported vulnerabilities after selecting smol-toml 1.9.1.

The existing host CLI reported file-based API authentication. This proves reuse of that existing login/configuration, not a separate test of ChatGPT subscription authentication. Credentials were neither copied into this repository nor printed by the adapter.

## Limits

- The refresh probe tested persistent writes with synthetic credentials. No real token was forced to expire; real refresh and concurrent refresh races are not verified.
- Live parallel model requests were not run. Parallel worktree/session behavior was checked with the fixture CLI only.
- ChatGPT subscription login, Keychain, Windows, Linux native execution, other agents, interactive sessions, and different Codex CLI versions were not tested. Unsupported systems fail instead of falling back to no sandbox.
- The macOS 14 / Node 22 and Node 24 CI matrix is configured separately; its actual run result is recorded in GitHub Actions, not implied by this local record.
- Task correctness, project tests, and review remain responsibilities of the caller.

Reproduce with `npm ci && npm run check`. Run `npm run test:live` only when a real model request using the current account is intended.
