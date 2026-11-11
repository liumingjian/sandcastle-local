# Verification record

## Chromium under Seatbelt

### Migration and ignored-worktree repair

A subsequent report from Stack Nexus issue #38 reproduced two gaps in the original repair: both root main.mts and .sandcastle/main.mts lacked bridge startup, and the ignored scaffold guide was absent from the task's named worktree. The added regression command, `node --import tsx --test --test-name-pattern 'custom entries' tests/local.test.ts`, first failed with `Browser configuration is missing in the task worktree`. After adding custom/root entry migration and guide copying, it passed, including real browser interaction and screenshot capture inside Seatbelt. Default discovery, explicit --entry, and repeated migration are covered. `npm run check` then passed with 12 passing tests and one platform skip, including all 15 template/tracker combinations.

The host's two Stack Nexus entry points were migrated, and BROWSER.md was placed in the existing issue worktree. A fresh host bridge then resumed that named worktree under real Seatbelt. Guide readability, endpoint injection, and connector import all passed. The frontend build passed, and all three previously blocked suites executed: TestApprovedDesignBrowser, TestUIReviewRegressionsBrowser, and TestEnvironmentOverviewBrowser. They produced fresh artifacts under the worktree's output/playwright/issue38-host-recovery-20261111/ directory.

All three suites failed on acceptance assertions after browser connection: six visual regions exceeded the current comparison criteria; the UI review passed 34 of 36 checks, with two timeouts; the overview reached its journey phase and failed a `0 !== 1` assertion. These are follow-up acceptance failures, not a missing bridge or unreadable guide. No baseline, threshold, product code, or issue status was changed. Issue #38 remains open. Host browser and discovery service were disposed after the run; the endpoint is per-run and must not be reused.

### Initial bridge implementation

The scaffold repair now integrates a lazy host browser server into every generated template. `setup-browser` applies the same integration to existing projects and is idempotent. The transport uses Playwright's native server protocol with one pinned playwright-core version on both ends; the CDP experiment below remains the original diagnostic evidence. On 2026-11-11, `npm run check` passed locally: build, type checking, 11 passing tests, and one unsupported-platform test skipped. No business acceptance or screenshot baseline comparison is claimed.

The regression command is `npm run check` after installing the host browser with `npx playwright-core install chromium`. The initialized-template test packs and installs the real package offline into a temporary project, initializes a blank template, removes the browser prelude to model an older scaffold, migrates it twice, and executes its generated entry point through the fixture Codex CLI inside real Seatbelt. The fixture calls the public connectBrowser() helper, opens a page, clicks a button, asserts the updated text, and writes a PNG into the sandbox workspace. The test checks the PNG signature and verifies both the discovery endpoint and browser WebSocket are unreachable after the entry point exits. No model request is needed. The macOS CI job installs the matching browser before running checks.

Other tests exercise lazy startup with a missing executable, actionable errors and retry, loopback binding, rejection of unrelated/browser-origin requests, environment restoration, and idempotent disposal. All 15 template/tracker combinations are compared with upstream after removing only the intended provider substitutions, browser prelude, prompt addendum, and login example change. The generated BROWSER.md is checked separately.

On 2026-11-11, Chromium headless shell from the local Playwright cache (`chromium_headless_shell-1248`, macOS arm64) was launched with `--headless --disable-gpu --dump-dom 'data:text/html,<title>browser-probe</title>'`. On the host it exited successfully and printed the expected HTML. The same executable, mounted read-only, failed through upstream `createSandbox({ cwd, sandbox: seatbelt({ mounts }) })` and `sandbox.exec(command)`:

```text
FATAL:base/apple/mach_port_rendezvous_mac.cc:159
Check failed: kr == KERN_SUCCESS.
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.<pid>: Permission denied (1100)
```

Repeating the sandbox invocation with `--no-sandbox` produced the same error and exit code 1. The failure does not depend on the application's frontend. Chromium's [Mach rendezvous implementation](https://github.com/chromium/chromium/blob/main/base/apple/mach_port_rendezvous_mac.cc) registers its bootstrap service during startup. The installed Sandcastle 0.14.0 profile denies operations by default and provides no `mach-register` allowance. Its public Seatbelt options expose only mounts, environment, and output limits. This places the observed startup failure at the upstream sandbox boundary; no adapter authentication code or upstream policy was changed. There is no adapter-level regression seam for changing that upstream policy.

A separate smoke probe launched the same browser on the host with a fresh temporary profile, `--remote-debugging-address=127.0.0.1`, and `--remote-debugging-port=0`. A host HTTP server served a fixture with a button. An unmodified upstream Seatbelt sandbox mounted the installed Playwright dependency read-only and ran a Node client that connected with `chromium.connectOverCDP(endpoint)`. The client created a context, navigated to the host fixture, clicked its button by accessible role, asserted that its text changed from `Run probe` to `Passed`, and captured a screenshot. The result was:

```json
{"cdp":"passed","interaction":"passed","screenshotBytes":5728}
```

The screenshot's PNG signature was asserted; stderr was empty and the client exited with code 0. The probe closed the context, disconnected the client, closed the sandbox, stopped the host browser and HTTP server, and removed the temporary browser profile. It used no model requests or login profile. The README records the host-launch and client-connection procedure. This verifies the browser transport, interaction, and screenshot capture only: no business journey, screenshot baseline comparison, or issue acceptance was performed. The host browser operates with host permissions; CDP does not extend Seatbelt isolation to that browser.

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

## External skill links and model failure diagnosis

On 2026-11-11, Codex CLI 0.167.1 failed to read four host skills linked outside CODEX_HOME. A real Seatbelt regression test reproduced EPERM before the fix and passed afterward. It covers an external skill, a nested reference link, a directory cycle, a dangling link, denied writes, and denied access to a sibling file. All four original host skill manifests were also readable inside Seatbelt after the fix.

`npm run check` passed with nine passing tests and one unsupported-OS test skipped, including the build, version check, and type check.

A minimal real request using the host-configured model succeeded even before the skill fix, proving the scan errors were not themselves fatal. A separate minimal request using the template's explicit gpt-5.4 model failed with HTTP 429 in JSON stdout. Upstream displayed only stderr for the nonzero exit, hiding this cause. No full issue-planning or implementation workflow was run during diagnosis.

`npm run test:live` also passed after the skill fix with the host's gpt-6.1-sol model: real file login, Seatbelt, named branch, session capture, and a successful resume. All four roles in the existing sandcastle-test script were changed to gpt-6.1-sol at the user's request. The user subsequently clarified that model selection should be manual and documented in the README. Initialization therefore retains upstream model defaults and forwards explicit --model options without imposing a fixed model. The fixture initialization test verifies an arbitrary explicit model, and template compatibility tests compare all five templates and three trackers with upstream defaults.

## Doctor online verification update

On 2026-11-10, doctor was changed from offline file checks to an actual sandboxed model request by default, at the user's request. Local type checks, tests, and declaration build passed: six tests passed and the unsupported-OS test was skipped on macOS.

The doctor regression test uses a fixture CLI inside real Seatbelt and checks the CLI's JSON output and exit status for success, 401, 403, 429, network failure, unavailable model, and an unexpected response. It also checks that raw credential-related error text is not printed, `--offline` does not validate authorization, cancellation reports an unverified failure, and the caller's repository stays clean.

The rebuilt `node dist/cli.js doctor` was also run against the real local CLI and existing file login. It returned `auth.status: verified` after the selected model answered the random challenge, taking approximately 17.6 seconds including sandbox setup and session handling. This verifies current request usability, not forced token refresh, subscription entitlements, or future requests. The probe used a disposable repository; its session remains under CODEX_HOME.

## Automatic task branch update

On 2026-11-11, the CLI made `--branch` optional and began generating `agent/run-<UUID>` names. This supersedes the missing-branch rejection recorded above. Explicit blank names and conflicting prompt inputs are still rejected before an agent starts.

`npm run check` passed on macOS: type checking, seven passing tests, one unsupported-OS test skipped, and the declaration build. The new CLI integration test ran two automatically named tasks and one explicitly named task concurrently using a fixture CLI inside real Seatbelt. It verified distinct branches, the explicit name, one commit per branch based on the original HEAD, retained task results, branch reporting, and an unchanged caller branch and HEAD. CLI subprocesses ran outside the target repository to exercise `--cwd` resolution. No real model requests were needed for this change.
