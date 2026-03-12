# Inputs

`EmbeddedPiRunResult` and the effective shared runner contract live in [src/agents/noxsoft-runner.ts](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L37), not in `pi-embedded-runner/**/*`; that subtree is now mostly stubbed compatibility surface via [src/agents/pi-embedded.ts](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L3).

What the orchestrator accepts is broader than what each backend actually honors:

- Shared entrypoint accepts `sessionId`, `sessionFile`, `workspaceDir`, `prompt`, `provider`, `model`, `thinkLevel`, `timeoutMs`, `cliSessionId`, `extraSystemPrompt`, `ownerNumbers`, `images`, `streamParams`, callbacks, auth-profile fields, and `execSecurity` in [src/agents/noxsoft-runner.ts](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L72).
- CLI consumes `cliSessionId`, `images`, `sessionExecSecurity`; it does not use `streamParams` beyond pass-through from the caller and has no direct tool API surface in [src/agents/cli-runner.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L39).
- Anthropic direct ignores `images`, `cliSessionId`, `streamParams`, `execSecurity`; accepted params are narrower in [src/agents/anthropic-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/anthropic-direct-runner.ts#L93).
- Gemini direct also ignores `images`, `cliSessionId`, `streamParams`, `execSecurity`, but does enable tool execution in [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L98).

Normalization needed:

- Define which inputs are guaranteed cross-backend: `prompt`, `provider`, `model`, `thinkLevel`, `timeoutMs`, session identity, callbacks.
- Define which are backend-specific and either reject or degrade explicitly: `images`, `cliSessionId`, `execSecurity`, `streamParams`.
- Today the same call shape silently means different things depending on backend selection.

# Prompt Construction

All three real backends reuse `buildSystemPrompt()` from [src/agents/cli-runner/helpers.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner/helpers.ts#L255), so workspace/context/bootstrap/runtime metadata are mostly aligned.

The divergence is in appended backend policy:

- CLI appends: “Use your native CLI capabilities... Do not assume external MCP-style tools exist...” in [src/agents/cli-runner.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L90).
- Anthropic direct appends: “Tools are disabled in this session. Do not call tools.” in [src/agents/anthropic-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/anthropic-direct-runner.ts#L153).
- Gemini direct appends nothing equivalent and passes real tool names into the system prompt in [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L174) and [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L176).

Normalization needed:

- Move backend capability policy into one shared “execution capabilities” layer.
- Generate one canonical capability block from booleans like `toolsEnabled`, `imagesEnabled`, `nativeCliCapabilities`, `resumeSupported`.
- Pass the same capability description to all backends instead of hardcoded per-runner strings.

# Tool Behavior

This is the largest semantic mismatch.

Current behavior:

- CLI passes `tools: []` to the system prompt and relies on the external CLI’s native behavior or MCP config injection; Claude CLI also gets `--mcp-config ~/.claude/mcp.json` in [src/agents/cli-runner.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L221).
- Anthropic direct fully disables tools in prompt and has no tool loop in [src/agents/anthropic-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/anthropic-direct-runner.ts#L153).
- Gemini direct builds `createAnimaCodingTools()`, exposes Gemini function declarations, executes tools locally, and loops until tool calls stop in [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L131) and [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L330).

That means runner behavior is not normalized at all:

- Same prompt can call tools on Gemini direct.
- Same prompt is instructed not to call tools on Anthropic direct.
- Same prompt may or may not get tools on CLI depending on installed CLI + MCP config.

Normalization needed:

- Pick one contract:
  - Either `toolsEnabled` is cross-backend true, and Anthropic direct gets a tool loop too.
  - Or `toolsEnabled` is cross-backend false for now, and Gemini direct must disable tool declarations.
- Expose tool execution results in `EmbeddedPiRunResult` if tools are meant to be first-class. Right now Gemini executes tools but result metadata does not reflect that.
- Do not let CLI rely on ambient `~/.claude/mcp.json` if “consistent runner behavior” is the goal; that is environment-dependent, not runner-dependent.

# Session/History

Current behavior differs materially:

- CLI session continuity is backend-native via generated or provided `cliSessionId`, `sessionArg`/`resumeArgs`, and backend-specific resume semantics in [src/agents/cli-runner.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L133) and [src/agents/cli-runner/helpers.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner/helpers.ts#L509).
- Anthropic direct writes its own sidecar history file `sessionFile + ".anima-history.json"` in [src/agents/anthropic-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/anthropic-direct-runner.ts#L47).
- Gemini direct writes a different sidecar history file `sessionFile + ".gemini-history.json"` in [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L48).

More mismatches:

- CLI returns `meta.agentMeta.sessionId`; direct runners do not in [src/agents/cli-runner.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L377) vs [src/agents/anthropic-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/anthropic-direct-runner.ts#L283) and [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L417).
- Direct backends persist history in runner-owned formats that are not interoperable with each other or with CLI resume.
- `cliSessionId` is meaningful only for CLI, but callers can always pass it.

Normalization needed:

- Decide on one session contract:
  - `meta.agentMeta.sessionId` must always be present and always mean “resume token for this backend”, or
  - introduce a separate `conversationId`/`resumeToken` field with backend-specific meaning.
- Centralize history persistence behind one adapter rather than each direct runner writing its own suffix file.
- If cross-backend switching is expected, session history must be canonicalized into one neutral format. Right now switching backend changes memory behavior.

# Output Normalization

Current result shape is inconsistent against [src/agents/noxsoft-runner.ts](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L37):

- CLI returns `payloads` only, no `output`, in [src/agents/cli-runner.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L371).
- Anthropic/Gemini direct return both `output` and `payloads` in [src/agents/anthropic-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/anthropic-direct-runner.ts#L277) and [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L411).
- CLI normalizes provider/model after the run in the orchestrator; direct results are returned as-is in [src/agents/noxsoft-runner.ts](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L476).
- CLI usage parsing supports `total`, `cacheRead`, `cacheWrite` in [src/agents/cli-runner/helpers.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner/helpers.ts#L326); Anthropic direct hardcodes cache counts to `0`; Gemini direct omits cache and total entirely.
- `messagingToolSentTexts` and `messagingToolSentTargets` exist in the shared type but none of these backends populate them.
- CLI can stream partial text parsed from stdout/json/jsonl in [src/agents/cli-runner.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L303); Gemini streams cumulative final text; Anthropic emits one full partial only.

Normalization needed:

- Always set both `output` and `payloads` from one shared helper.
- Always normalize `meta.agentMeta.provider` and `model` in the orchestrator for every strategy, not just CLI.
- Always include `meta.agentMeta.sessionId`.
- Normalize usage to a full `NormalizedUsage` shape with missing fields omitted consistently, not sometimes `0` and sometimes absent.
- Standardize partial streaming semantics:
  - either cumulative text snapshots everywhere,
  - or deltas everywhere.
    Right now CLI and Gemini emit cumulative snapshots; Anthropic effectively emits one final snapshot.

# Error/Abort Semantics

Current behavior is inconsistent:

- CLI non-zero exit throws `FailoverError` with classified reason/status in [src/agents/cli-runner.ts](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L344). The orchestrator then emits lifecycle error and rethrows in [src/agents/noxsoft-runner.ts](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L487).
- Anthropic direct returns `{status:"timeout"}` on abort in [src/agents/anthropic-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/anthropic-direct-runner.ts#L299).
- Gemini direct detects timeout but still returns `{status:"failed", meta.error.kind:"timeout"}` in [src/agents/gemini-direct-runner.ts](/Users/grimreaper/.hell/anima/src/agents/gemini-direct-runner.ts#L381).
- CLI timeout path depends on `runCommandWithTimeout()` killing the child with `SIGKILL` in [src/process/exec.ts](/Users/grimreaper/.hell/anima/src/process/exec.ts#L149); `runCliAgent()` does not map `killed/signal` into `{status:"timeout"}` and instead treats it as generic CLI failure.
- Legacy abort helpers are stubs returning `false` in [src/agents/pi-embedded.ts](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L29), so old “embedded abort” surface is non-functional.

Normalization needed:

- Unify timeout outcome: every backend should produce `status: "timeout"` and `meta.error.kind: "timeout"` for deadline expiry.
- Decide whether runners return failures as values or throw typed errors. Right now direct returns values, CLI throws.
- If keeping value returns, wrap CLI failures in `EmbeddedPiRunResult`.
- If keeping throws, direct runners should throw typed timeout/auth/rate-limit errors and let orchestrator map them.
- Restore or explicitly deprecate `abortEmbeddedPiRun` semantics; current stubbed surface lies about capability.

# Minimal Patch Plan

1. Introduce a shared `normalizeRunResult()` in the orchestrator layer that enforces:
   - `output`
   - `payloads`
   - normalized `provider`/`model`
   - guaranteed `agentMeta.sessionId`
   - normalized usage shape
   - normalized timeout/error shape

2. Introduce a shared `ExecutionCapabilities` object derived once per run:
   - `toolsEnabled`
   - `imagesEnabled`
   - `resumeEnabled`
   - `nativeCliCapabilities`
     Use it to build one shared capability prompt block.

3. Pick one immediate tool policy and enforce it across all backends:
   - Fastest consistency patch: disable Gemini direct tools to match Anthropic direct and most predictable CLI behavior.
   - Better long-term patch: add a direct tool runner abstraction and migrate Anthropic direct to it.

4. Centralize history/session handling:
   - one history adapter keyed by `sessionFile`
   - one canonical session metadata record
   - always return a backend resume token in `agentMeta.sessionId`

5. Normalize timeout/failure handling at the backend boundary:
   - map CLI killed-by-timeout to `status:"timeout"`
   - fix Gemini timeout from `failed` to `timeout`
   - choose throw-vs-return once and apply it everywhere

6. Either remove or mark unsupported legacy embedded control APIs:
   - `abortEmbeddedPiRun`
   - `isEmbeddedPiRunActive`
   - `isEmbeddedPiRunStreaming`
     Their current stub behavior is not compatible with a “consistent runner” contract.
