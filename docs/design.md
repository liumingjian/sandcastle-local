# Local Codex login adapter

## Scope

On 2026-11-11, the user clarified that this package exists only to reuse the host Codex login and must not change any other upstream functionality. This supersedes the previous standalone task runner, required or automatically generated branch names, one-iteration policy, task timeout, plain-text prompt-file handling, and project environment preflight restrictions.

The user subsequently required the same installation, initialization, and execution experience as upstream, with fewer provider choices and exact upstream version alignment. `sandcastle-local init` invokes the installed upstream initialization CLI with Codex and Seatbelt fixed. Issue tracker, template selection, confirmations, dependency installation, and scaffold generation remain upstream-owned. It does not choose branches, iterations, timeouts, hooks, reviews, merges, or concurrency.

After successful initialization, the adapter changes only the generated main script's upstream/provider module specifiers to the local providers facade and replaces the Codex API key example with a local-login note. It does not rewrite orchestration code, prompts, tracker configuration, hooks, or standards files. The facade directly re-exports the upstream API and overrides only Codex and Seatbelt factories for login reuse. Namespace imports in planner/reviewer templates are supported. Generated scripts resolve the current user's login at execution time; no initialization-machine credential path is embedded.

The upstream CLI runs as a subprocess with inherited terminal streams, preserving interactive prompts. The wrapper forwards the remaining init arguments and upstream exit status, rejects alternative agent/sandbox selections, and only adapts newly generated files after successful init. Existing `.sandcastle/` directories retain upstream refusal behavior.

## Authentication adaptation

`resolveLocalCodex()` validates a dedicated local Codex directory and existing file login without reading or copying credential contents. It parses configuration only to validate file storage and provide a model fallback when the caller has not supplied one. Existing templates must pass their original model to preserve their choice.

`codexOnSeatbelt()` constructs upstream Codex and Seatbelt providers with the existing login directory. The directory is mounted read/write at the same path and injected as CODEX_HOME so Codex owns token refresh. Default session roots are aligned to CODEX_HOME/sessions so upstream session capture and resume can locate them despite the sandbox's private HOME.

All upstream Codex options pass through. Explicit session directory overrides are preserved. Existing Seatbelt options pass through via sandboxOptions; original environment variables and mounts are retained, with CODEX_HOME and its writable mount added for authentication. Upstream remains responsible for environment resolution and validation. The helper does not inspect or reject project `.sandcastle/.env` files.

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
