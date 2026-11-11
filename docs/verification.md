# Verification record

## Initialization and version alignment (current)

Git-source installation was also verified using a disposable committed snapshot of the current working tree and `npm install --save-dev git+file://...`. npm fetched the Git source, installed its build dependencies, ran prepare, and installed a working CLI reporting 0.14.0. The installed CLI initialized a blank template with local authentication already connected. This validates the Git preparation lifecycle; the snapshot was local, and the unpushed working-tree changes were not tested through the GitHub remote. The README now documents direct HTTPS/SSH GitHub installation rather than requiring a manual clone. The GitHub repository was private when checked.

The user required upstream-style installation, initialization, and execution with Codex and Seatbelt fixed, and identical package/upstream versions. The local package version is now 0.14.0, exactly matching the dependency, installed upstream, and lockfile. Build/CI and CLI startup enforce matching versions.

`npm run check` passed on macOS: eight tests passed and one unsupported-OS test was skipped. The initializer comparison covers every file in all five upstream templates across Custom, GitHub Issues, and Beads (15 combinations). Generated content matches upstream except authentication module specifiers and the Codex API key example. A generated blank template ran without manual provider edits inside real Seatbelt, using a synthetic local login with no configured default model; the selected template model was preserved. Alternative providers are rejected and existing initialized files are not overwritten.

A separately packed tarball was installed offline with npm into a disposable project. Its installed CLI reported 0.14.0, initialized the project, and the generated script executed successfully with the fixture Codex CLI. A real terminal interaction also confirmed that init skips agent/sandbox selection and presents the upstream issue tracker and template prompts. No real model requests were used.

## Earlier scope correction

On 2026-11-11, the user clarified that only local Codex login reuse is authorized; all other functionality must retain upstream behavior. The local task runner and its branch selection/generation, iteration limit, task timeout, plain-text prompt-file handling, and project environment preflight were removed. Earlier runner records below are historical and do not describe the current API.

`npm run check` passed on macOS after this correction: type checking, seven passing tests, one unsupported-OS test skipped, and declaration build. New regression coverage executed upstream `sandcastle init --agent codex --sandbox seatbelt --template blank --issue-tracker custom` in a temporary repository, adapted only the generated provider construction, and executed the generated script with a fixture CLI inside real Seatbelt. With the template's omitted branch strategy preserved, the task committed directly to main and created no task branch.

Another regression preserved an explicit model, Codex effort/environment/session-capture/approval options, and Seatbelt environment/mount/output options. The upstream run completed two iterations, expanded a prompt-file shell expression using the provider environments and original extra mount, and executed its sandbox-ready hook. Existing login persistence, unrelated-home access denial, auth diagnostics, named-branch isolation, session resume, and parallel upstream-task tests also passed. No real model requests were needed for this correction.

## Historical verification records

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
- GitHub rejected the initial macOS 14 runner before executing any steps (`macos-14-arm64-us-default` is not supported). CI now uses `macos-latest` with Node 22/24, matching upstream's runner policy; macOS 14 remains the minimum requirement but was not executed in this CI run. Actual run results are recorded in GitHub Actions.
- Task correctness, project tests, and review remain responsibilities of the caller.

Reproduce with `npm ci && npm run check`. Run `npm run test:live` only when a real model request using the current account is intended.

## Doctor online verification update

On 2026-11-10, doctor was changed from offline file checks to an actual sandboxed model request by default, at the user's request. Local type checks, tests, and declaration build passed: six tests passed and the unsupported-OS test was skipped on macOS.

The doctor regression test uses a fixture CLI inside real Seatbelt and checks the CLI's JSON output and exit status for success, 401, 403, 429, network failure, unavailable model, and an unexpected response. It also checks that raw credential-related error text is not printed, `--offline` does not validate authorization, cancellation reports an unverified failure, and the caller's repository stays clean.

The rebuilt `node dist/cli.js doctor` was also run against the real local CLI and existing file login. It returned `auth.status: verified` after the selected model answered the random challenge, taking approximately 17.6 seconds including sandbox setup and session handling. This verifies current request usability, not forced token refresh, subscription entitlements, or future requests. The probe used a disposable repository; its session remains under CODEX_HOME.

## Automatic task branch update

On 2026-11-11, the CLI made `--branch` optional and began generating `agent/run-<UUID>` names. This supersedes the missing-branch rejection recorded above. Explicit blank names and conflicting prompt inputs are still rejected before an agent starts.

`npm run check` passed on macOS: type checking, seven passing tests, one unsupported-OS test skipped, and the declaration build. The new CLI integration test ran two automatically named tasks and one explicitly named task concurrently using a fixture CLI inside real Seatbelt. It verified distinct branches, the explicit name, one commit per branch based on the original HEAD, retained task results, branch reporting, and an unchanged caller branch and HEAD. CLI subprocesses ran outside the target repository to exercise `--cwd` resolution. No real model requests were needed for this change.
