# Anima System & Gemini Integration Analysis

## 1. System Overview: What is Working

The Anima application is a robust, event-driven AI agent lifecycle system. After restoring the severely corrupted state (almost all source files had been mysteriously deleted in the working directory), the following subsystems have been verified to be intact and working:

- **Local Development Lifecycle:** `pnpm build`, dependency management, and local `npm link` execution are working flawlessly. The project successfully compiles its Node.js (`tsdown`) and canvas/UI bundles.
- **Core Orchestration:** The core systems managing `heartbeats`, event routing, and sub-agents appear structurally sound and correctly wired.
- **Provider Support (General):** Anthropic and OpenAI support appear to be treated as first-class citizens, supporting comprehensive tool execution, streaming, and conversation history validation.
- **CLI & TUI:** The terminal interface and local command shells (`anima tui`) are compiled properly and are ready for interaction.

## 2. System Overview: What is Likely Broken or Fragile

While the core architecture is solid, several edge cases and subsystems show signs of instability or technical debt:

- **Missing Files / Corruption Recovery:** The system was found with a completely wiped out `.git/HEAD` and deleted source files in the working directory, likely caused by a rogue script or failed MCP fix (tracked in `.backup/codex-mcp-fix-20260311-012813`). Although recovered, the underlying script that caused this might strike again.
- **Model Fallbacks & Parameter Mismatches:** There are scattered workarounds across the codebase for various LLM provider idiosyncrasies, particularly around context limits and schema definitions.
- **Incomplete Markdown/Media Parsing:** Certain media understanding paths (`MpegParser`, `FlacParser`, etc.) and bundled CLI handlers issue warnings during the build step, hinting at fragile external dependencies (`node-llama-cpp`, `jimp`).

---

## 3. Deep Dive: Why Anima is Not Working Properly with Gemini

The primary reason Anima struggles with Gemini is that **Gemini is treated as a second-class citizen in the direct runner implementation.** The Anima core is built around Anthropic/OpenAI assumptions, leading to friction with Gemini's strict API requirements.

Here are the specific, critical issues identified in the codebase:

### A. Tools are Explicitly Disabled

In the `src/agents/gemini-direct-runner.ts` file, the system explicitly disables tools for Gemini sessions. There are hardcoded instructions that state: _"Tools are disabled in this session. Do not call tools."_ This severely cripples Gemini's utility compared to other agents that rely on tools for memory, system operations, and external API access.

### B. Missing Streaming Support

Unlike other agent runners that provide real-time token streaming (`onPartialReply` events), the Gemini integration uses standard `fetch` and waits for the full response to complete before dispatching a single partial reply. This causes perceived latency and timeouts during long responses.

### C. Strict Turn Validation Failures

Gemini's API enforces a strict alternating pattern of `user -> model -> user`.
The `src/agents/pi-embedded-helpers/turns.ts` file contains a function `validateGeminiTurns` to try and fix this, but it fails to correctly handle complex sequences, such as when system instructions, tool execution results (if they were enabled), or multiple user messages are injected sequentially. This causes the Gemini API to reject the history payload entirely.

### D. Frequent Session Corruption

Because of the turn validation issues and function call ordering mismatches, Anima frequently triggers an auto-recovery mechanism specifically for Gemini.
In `src/auto-reply/reply/agent-runner-execution.ts` (Lines 529-539), the system logs:

> _"Session history corrupted (Gemini function call ordering). Resetting session..."_
> This means Anima is forced to frequently wipe Gemini's memory just to keep the conversation going, completely breaking continuity.

### E. Schema Friction

The file `src/agents/schema/clean-for-gemini.ts` contains an exhaustive list of `GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS`. Anima aggressively scrubs tool schemas before sending them to Gemini, which can lead to malformed tool definitions and further API rejection.

### F. Hardcoded Model Mappings

The `MODEL_MAP` in the backend configuration hardcodes outdated or highly specific experimental versions (e.g., `gemini-2.0-pro-exp-02-05`), which might not be available or might have breaking changes compared to stable releases.

## Conclusion & Next Steps

To use Gemini effectively, the `gemini-direct-runner.ts` and turn-validation logic need a substantial overhaul to support proper tool schemas, real streaming, and strict alternating history sequences without resorting to memory wipes.

**Status:** The system has been fully restored, built, and linked globally via `npm link`. The Anima command will now use your latest local macOS build.
