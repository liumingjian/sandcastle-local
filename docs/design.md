# Local Codex login adapter

## Scope

On 2026-11-11, the user clarified that this package exists only to reuse the host Codex login and must not change any other upstream functionality. This supersedes the previous standalone task runner, required or automatically generated branch names, one-iteration policy, task timeout, plain-text prompt-file handling, and project environment preflight restrictions.

The user subsequently required the same installation, initialization, and execution experience as upstream, with fewer provider choices and exact upstream version alignment. `sandcastle-local init` invokes the installed upstream initialization CLI with Codex and Seatbelt fixed. Model selection remains user-owned: initialization forwards --model when supplied and otherwise preserves upstream defaults. The README instructs users to manually check and edit every generated Codex role before running, using gpt-6.1-sol as the locally verified example. The adapter does not enforce a model. Issue tracker, template selection, confirmations, dependency installation, and scaffold generation remain upstream-owned. It does not choose branches, iterations, timeouts, hooks, reviews, merges, or concurrency.

After successful initialization, the adapter changes the generated main script's upstream/provider module specifiers to the local providers facade and replaces the Codex API key example with a local-login note. The subsequent user request to fix Chromium startup also authorizes browser integration: the entry point prepends an async-disposable browser bridge, prompts append a pointer to generated BROWSER.md, and the Seatbelt facade forwards its per-run endpoint. Orchestration, tracker configuration, hooks, and standards remain upstream-owned. Namespace imports in planner/reviewer templates are supported. Generated scripts resolve the current user's login at execution time; no initialization-machine credential path is embedded.

## Host browser bridge

Chromium cannot register its Mach rendezvous service under upstream Seatbelt, including with --no-sandbox. The adapter does not patch the upstream profile. The generated entry point owns a lazy HTTP discovery service bound to 127.0.0.1 on a random port and path. The first authenticated-path request launches a Playwright browser server on the host with a fresh profile; unrelated requests and browser-origin requests are rejected. Concurrent clients share startup, use separate contexts, and disconnect independently. Both ends use the package's pinned playwright-core version via connectBrowser(), avoiding project Playwright version mismatches. Missing executables produce an actionable host-install error and allow retry. No browser is launched for ordinary tasks.

The entry point disposes the HTTP service and browser on completion or exceptions. Playwright owns browser process cleanup on host termination. Browser commands execute with host permissions; only the client runs under Seatbelt. This intentionally exposes a dedicated browser, not the user's daily browser profile. The local factory propagates SANDCASTLE_BROWSER_ENDPOINT at provider invocation time while preserving explicit environment overrides. Existing projects can run setup-browser to idempotently add the entry-point prelude and prompt instructions without reinitializing or replacing their orchestration. Existing direct chromium.launch() tests need to adopt connectBrowser() or a fixture that uses it; no transparent patching of project browser libraries is performed.

The upstream CLI runs as a subprocess with inherited terminal streams, preserving interactive prompts. The wrapper forwards the remaining init arguments and upstream exit status, rejects alternative agent/sandbox selections, and only adapts newly generated files after successful init. Existing `.sandcastle/` directories retain upstream refusal behavior.

The initialization completion message documents the upstream runtime prerequisite: execute from a Git project with an existing initial commit. An unborn branch has no resolvable HEAD and upstream fails before launching Codex. The wrapper does not create commits or add runtime preflight restrictions. Templates using separate worktrees also require project inputs to be tracked and committed, except for paths explicitly copied by the template.

## Authentication adaptation

`resolveLocalCodex()` validates a dedicated local Codex directory and existing file login without reading or copying credential contents. It parses configuration only to validate file storage and provide a model fallback for programmatic callers and doctor when the caller has not supplied one. Models explicitly selected in generated templates take precedence over the host model configuration.

`codexOnSeatbelt()` constructs upstream Codex and Seatbelt providers with the existing login directory. The directory is mounted read/write at the same path and injected as CODEX_HOME so Codex owns token refresh. Default session roots are aligned to CODEX_HOME/sessions so upstream session capture and resume can locate them despite the sandbox's private HOME.

All upstream Codex options pass through. Explicit session directory overrides are preserved. Existing Seatbelt options pass through via sandboxOptions; original environment variables and mounts are retained, with CODEX_HOME and its writable mount added for authentication. Upstream remains responsible for environment resolution and validation. The helper does not inspect or reject project `.sandcastle/.env` files.

Host skill discovery must also work when CODEX_HOME/skills contains symlinks outside the mounted profile. Provider construction traverses that tree, resolves external targets (including nested links), and adds identity mounts with read-only access. Canonical visited paths prevent traversal cycles; dangling links are ignored. Mounts are limited to resolved targets rather than their containing repositories, and links to the entire home directory or its ancestors are rejected. The targets are captured when providers are constructed; changes require restarting the script. Unrelated host files remain inaccessible.

During diagnosis on 2026-11-11, these skill scan errors were reproduced but did not prevent a minimal request with the host model from succeeding. The template's explicit gpt-5.4 request separately failed with HTTP 429 in Codex JSON stdout. Upstream's nonzero-exit handling displayed only stderr, hiding that failure. The existing test project was changed to gpt-6.1-sol at the user's request; model selection for other projects remains manual. This adapter does not patch upstream error handling; the README documents how to inspect the actual CLI failure.

The local CLI also retains `doctor`, an authentication diagnostic previously requested by the user. It retains its minimal model request in a disposable repository, offline option, cancellation, categorized failures, and two-minute verification limit. These limits apply only to the diagnostic and never to user tasks. Task execution remains the generated script; no local task runner is introduced.

## Compatibility and limits

- Consume the public npm API; do not patch node_modules or fork the engine.
- Package version, exact upstream dependency, installed upstream version, and lockfile versions must all match: currently 0.14.0. Builds and CI enforce this equality, and CLI startup rejects mismatched installations. Upgrade and release the adapter with the same upstream version, without independent version numbers or suffixes; run compatibility checks for each upgrade.
- Support macOS 14+ Seatbelt and the host Codex CLI with existing auth.json file login. Unsupported platforms and storage modes fail explicitly.
- Keep the upstream private HOME and network behavior. Exposing the entire selected Codex directory supports atomic credential replacement, configuration, and session writes.
- Login reuse does not guarantee account quotas, model access, task correctness, or safe concurrent token refresh.
- Branch behavior is entirely upstream-controlled. Seatbelt with no explicit strategy uses the current checkout; a template may explicitly choose another strategy.

## Validation

Tests use a synthetic Codex directory and fixture CLI inside real Seatbelt. They cover login visibility and refresh persistence, unrelated-home denial, provider option preservation, all five upstream templates across all three issue trackers, automatic initialization/template execution, prompt expansion, multiple iterations, hooks, named branches, session resume, and concurrent upstream tasks. See [verification.md](verification.md) for executed results and historical records.
