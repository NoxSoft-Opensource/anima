# Claude Code Pattern Adoption Plan for ANIMA

Research and analysis comparing ANIMA's current architecture (forked from OpenClaw) against Claude Code's patterns, with recommendations for what to adopt.

---

## 1. Executive Summary

ANIMA (formerly OpenClaw fork) currently depends on four `@mariozechner/pi-*` packages that form the backbone of the OpenClaw agent runtime:

- `@mariozechner/pi-agent-core` -- agent message types, tool interfaces, token estimation
- `@mariozechner/pi-ai` -- LLM provider abstraction, image content types
- `@mariozechner/pi-coding-agent` -- coding tools (read, write, edit), compaction, context management
- `@mariozechner/pi-tui` -- terminal UI framework (TUI, Container, Text, Loader, Editor, etc.)

These packages are referenced in **120+ source files** across the ANIMA codebase. The pi-embedded runner has already been stubbed out (Phase 1 complete), but the type system and tool creation still depend heavily on these packages.

Claude Code is closed-source, but its patterns are well-documented through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), extracted system prompts, and architectural deep-dives. Claude Code's architecture is significantly more focused and opinionated than OpenClaw's sprawling multi-provider, multi-channel design.

**Key recommendation:** ANIMA should progressively replace `@mariozechner/pi-*` dependencies with either Claude Agent SDK usage or NoxSoft-owned implementations that mirror Claude Code's patterns. This eliminates the dependency on a project whose creator has joined OpenAI and whose codebase is transferring to an open-source foundation.

---

## 2. Architectural Comparison

### 2.1 Agent Execution Loop

**Claude Code's approach:**

- Single-threaded master loop: `while(tool_call) -> execute tool -> feed results -> repeat`
- Terminates when Claude produces plain text without tool calls
- Async message queue (`h2A`) for mid-task user interjections
- Context compressor triggers at ~92% context window usage
- Flat message history -- always do the simple thing first
- Sub-agents limited to one level deep (no recursive spawning)

**ANIMA's current approach (OpenClaw legacy):**

- Relies on `@mariozechner/pi-agent-core` for the agent loop abstraction
- `pi-embedded-runner.ts` is now stubbed -- references `runEmbeddedPiAgent()` which throws
- `cli-runner.ts` spawns Claude Code CLI as a subprocess (`claude -p --output-format json --dangerously-skip-permissions`)
- Multiple CLI backends supported (Claude, Codex, custom)
- Subagent registry with persistence, announce queues, steer-restart logic

**Gaps to address:**

- ANIMA currently shells out to Claude Code CLI rather than using the Agent SDK directly
- The subagent system is over-engineered compared to Claude Code's single-depth model
- No native streaming -- relies on CLI JSON output parsing

### 2.2 Tool Handling

**Claude Code's approach:**

- 18 built-in tools with standardized JSON schemas:
  - Read (file reading, ~2000 lines)
  - Edit (surgical diffs with unique string matching)
  - Write (full file creation/overwrite)
  - Bash (persistent shell with risk classification)
  - Glob/Grep (file search with ripgrep)
  - WebFetch/WebSearch (web access with security restrictions)
  - NotebookRead/NotebookEdit (Jupyter support)
  - Task/TeammateTool (sub-agent dispatch)
  - Computer (browser automation)
  - LSP (language server protocol)
  - BatchTool (grouped operations)
  - TodoWrite (structured task lists)
- Tools follow pattern: JSON tool calls -> sandboxed execution -> plain text results
- Permission prompts for write operations, risky commands, external tools

**ANIMA's current approach:**

- Tool definitions imported from `@mariozechner/pi-coding-agent`: `codingTools`, `createEditTool`, `createReadTool`, `createWriteTool`, `readTool`
- Additional NoxSoft-specific tools in `src/agents/tools/`:
  - `browser-tool.ts`, `canvas-tool.ts`, `cron-tool.ts`
  - `memory-tool.ts`, `image-tool.ts`, `message-tool.ts`
  - `web-fetch.ts`, `web-search.ts`
  - `sessions-send-tool.ts`, `sessions-spawn-tool.ts`, `subagents-tool.ts`
  - Platform-specific: Discord, Slack, Telegram, WhatsApp actions
  - `gateway-tool.ts`, `nodes-tool.ts`, `tts-tool.ts`
- Tool schemas adapted via `pi-tool-definition-adapter.ts` and `pi-tools.schema.ts`
- Tool policy system with profiles: minimal, coding, messaging, full
- Complex allowlisting and approval system in `bash-tools.exec.ts`

**Gaps to address:**

- Tool type definitions come from `pi-agent-core` (`AgentTool`, `AgentToolResult`)
- Tool creation helpers come from `pi-coding-agent`
- Should define NoxSoft-owned tool interfaces that match Claude Code's patterns
- The `patchToolSchemaForClaudeCompatibility()` function in `pi-tools.read.ts` exists specifically to bridge the gap -- this should become the default, not a compatibility layer

### 2.3 Streaming & Response Handling

**Claude Code's approach:**

- Agent SDK `query()` returns an `AsyncGenerator<SDKMessage>` that streams messages as they arrive
- Message types: `SDKAssistantMessage`, `SDKUserMessage`, `SDKResultMessage`, `SDKSystemMessage`, `SDKPartialAssistantMessage`, `SDKCompactBoundaryMessage`
- React (Ink) for terminal rendering of streaming content
- Real-time token tracking and budget enforcement

**ANIMA's current approach:**

- `pi-embedded-subscribe.ts` and related handlers for streaming from the pi-embedded provider (now stubbed)
- `tui-stream-assembler.ts` for assembling streamed chunks into renderable content
- TUI built on `@mariozechner/pi-tui` (Ink-based)
- `cli-runner.ts` parses CLI JSON/JSONL output after process completion -- no true streaming

**Gaps to address:**

- Replace pi-embedded streaming with Claude Agent SDK's `query()` async generator
- `tui-stream-assembler.ts` should consume `SDKMessage` types directly
- The TUI dependency on `@mariozechner/pi-tui` is the deepest coupling point

### 2.4 System Prompts

**Claude Code's approach:**

- Dynamically composed from ~40+ conditional sections
- Mode-specific prompts: main agent, Explore agent, Plan agent, Task agent
- Tool descriptions embedded in system prompt
- CLAUDE.md files for project-specific context
- 12+ runtime reminders injected as system messages
- Utility prompts for compaction, session memory, security review

**ANIMA's current approach:**

- `src/agents/system-prompt.ts` -- modular builder with sections: Skills, Memory, User Identity, Time
- `src/agents/system-prompt-params.ts` -- parameter resolution
- `src/agents/bootstrap-files.ts` -- loads AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, MEMORY.md, etc.
- `src/identity/prompt-builder.ts` -- NoxSoft-specific identity system with SOUL/HEART/BRAIN components
- Three prompt modes: task, heartbeat, freedom
- Life affirmation footer on every prompt (Amor Fati, honesty over comfort, etc.)

**Gaps to address:**

- The identity/prompt system is one of ANIMA's most differentiating features -- keep and enhance it
- Adopt Claude Code's conditional section composition pattern for more dynamic prompt assembly
- Add Claude Code-style runtime reminders (token budget warnings, plan mode status, etc.)

### 2.5 Permission System

**Claude Code's approach:**

- Multi-layered: tool-level allow/deny, command risk classification, explicit user confirmation
- Permission modes: `bypassPermissions`, `acceptEdits`, interactive
- Allowlists for known-safe commands
- `--dangerously-skip-permissions` flag for automated usage
- Risk levels for bash commands: safe, moderate, dangerous

**ANIMA's current approach:**

- Tool policy profiles (minimal, coding, messaging, full) in `tool-policy.ts`
- Tool groups for bulk allow/deny
- `exec-approvals` system in `infra/exec-approvals.js` with allowlisting
- Owner-only tools (e.g., `whatsapp_login`)
- Subagent-specific policies via `resolveSubagentToolPolicy()`
- Security audit system in `src/security/` (audit channels, dangerous tools, path scanning, skill scanning)

**Gaps to address:**

- ANIMA's permission system is already more sophisticated than Claude Code's in some ways
- Adopt Claude Code's risk classification for bash commands
- Integrate with the Agent SDK's `permissionMode` parameter

### 2.6 Memory & Context

**Claude Code's approach:**

- CLAUDE.md files at project root, `.claude/` directory, and user home
- Auto-memory system that persists learnings across sessions
- TodoWrite tool for structured task tracking
- Conversation compaction at ~92% context window
- Simple Markdown files over databases ("regex over embeddings, Markdown over databases")

**ANIMA's current approach:**

- Full vector-based memory system in `src/memory/`:
  - SQLite + sqlite-vec for vector storage
  - Multiple embedding providers (OpenAI, Voyage, Gemini, node-llama)
  - Episodic and procedural memory types
  - Batch embedding processing
  - QMD (query/memory/document) manager
  - Hybrid search (keyword + semantic)
  - Memory sync, consolidation, and indexing
- Session files in `src/config/sessions/`
- Bootstrap files (AGENTS.md, SOUL.md, MEMORY.md, etc.)

**Gaps to address:**

- ANIMA's memory system is far more advanced than Claude Code's -- keep it
- However, add CLAUDE.md-compatible file loading for users coming from Claude Code
- Consider a "simple mode" that uses Markdown files for lightweight deployments
- The compaction system in `src/agents/compaction.ts` already uses `@mariozechner/pi-coding-agent`'s `estimateTokens` and `generateSummary` -- these need NoxSoft replacements

### 2.7 CLI UX & Terminal Rendering

**Claude Code's approach:**

- React + Ink for terminal UI
- Commander.js for CLI command handling
- Zod for schema validation
- Ripgrep bundled for fast file search
- Rich markdown rendering in terminal
- Status line with token usage, model info, plan mode
- Slash commands (/review-pr, /security-review, /batch, etc.)

**ANIMA's current approach:**

- `@mariozechner/pi-tui` for terminal UI (Ink-based: TUI, Container, Text, Loader, ProcessTerminal, ChatLog, CustomEditor)
- Commander.js for CLI (in `src/cli/program.ts`)
- Zod for schema validation
- Complex CLI structure with many subcommands (gateway, daemon, browser, cron, nodes, etc.)
- Slash commands in `src/tui/commands.ts`
- Theme system in `src/tui/theme/`
- Rich terminal formatting in `src/terminal/` (ANSI, tables, progress, links, etc.)

**Gaps to address:**

- Replace `@mariozechner/pi-tui` with NoxSoft-owned Ink components or adopt Claude Agent SDK
- The TUI components (ChatLog, CustomEditor, etc.) need to be rewritten or forked
- Terminal formatting in `src/terminal/` is already independent -- good
- Adopt Claude Code's status line pattern with token tracking

---

## 3. Files & Modules Requiring Changes

### 3.1 Critical Path (blocks everything else)

| File/Module                    | Current Dependency              | Action                                                                     | Effort |
| ------------------------------ | ------------------------------- | -------------------------------------------------------------------------- | ------ |
| `src/agents/pi-tools.types.ts` | `@mariozechner/pi-agent-core`   | Define NoxSoft `AgentTool` / `AgentToolResult` types                       | Small  |
| `src/agents/tools/common.ts`   | `@mariozechner/pi-agent-core`   | Use NoxSoft tool types                                                     | Small  |
| `src/agents/pi-tools.ts`       | `@mariozechner/pi-coding-agent` | Replace `codingTools`, `createEditTool`, etc. with NoxSoft implementations | Medium |
| `src/agents/pi-tools.read.ts`  | `@mariozechner/pi-coding-agent` | Move `patchToolSchemaForClaudeCompatibility()` from adapter to default     | Medium |
| `src/agents/compaction.ts`     | `@mariozechner/pi-coding-agent` | Replace `estimateTokens()`, `generateSummary()`                            | Medium |

### 3.2 Agent Runtime (the core loop)

| File/Module                                      | Current State                        | Action                                               | Effort |
| ------------------------------------------------ | ------------------------------------ | ---------------------------------------------------- | ------ |
| `src/agents/pi-embedded.ts`                      | Stubbed (Phase 1 done)               | Replace with Claude Agent SDK `query()` integration  | Large  |
| `src/agents/pi-embedded-runner.ts`               | Stubbed (Phase 1 done)               | Replace with Claude Agent SDK wrapper                | Large  |
| `src/agents/cli-runner.ts`                       | Spawns CLI subprocess                | Consider migrating to Agent SDK for native streaming | Large  |
| `src/agents/cli-runner/helpers.ts`               | Build CLI args, parse output         | Adapt for Agent SDK or keep as legacy fallback       | Medium |
| `src/agents/cli-backends.ts`                     | Multi-backend config (Claude, Codex) | Simplify to Claude-first with Agent SDK              | Medium |
| `src/agents/pi-embedded-subscribe.ts`            | Stream handlers                      | Replace with Agent SDK streaming                     | Large  |
| `src/agents/pi-embedded-subscribe.handlers.*.ts` | Event handlers per type              | Map to SDKMessage types                              | Medium |

### 3.3 TUI Layer

| File/Module                       | Current Dependency                                          | Action                                               | Effort |
| --------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- | ------ |
| `src/tui/tui.ts`                  | `@mariozechner/pi-tui` (TUI, Container, Text, Loader, etc.) | Fork pi-tui components or build NoxSoft replacements | Large  |
| `src/tui/components/*.ts`         | `@mariozechner/pi-tui`                                      | Rewrite Ink components                               | Large  |
| `src/tui/theme/theme.ts`          | `@mariozechner/pi-tui`                                      | Adapt theme system                                   | Small  |
| `src/tui/tui-stream-assembler.ts` | Internal                                                    | Adapt for SDKMessage streaming                       | Medium |
| `src/tui/gateway-chat.ts`         | Internal                                                    | Keep as-is (NoxSoft-specific)                        | None   |

### 3.4 Tool Definitions

| File/Module                                | Current Dependency                  | Action                              | Effort        |
| ------------------------------------------ | ----------------------------------- | ----------------------------------- | ------------- |
| All `src/agents/tools/*.ts`                | `@mariozechner/pi-agent-core` types | Migrate to NoxSoft tool types       | Medium (bulk) |
| `src/agents/pi-tool-definition-adapter.ts` | `@mariozechner/pi-agent-core`       | Eliminate adapter, use native types | Medium        |
| `src/agents/pi-tools.schema.ts`            | Internal + pi types                 | Refactor for Claude-native schemas  | Small         |
| `src/agents/bash-tools.exec.ts`            | `@mariozechner/pi-agent-core`       | Migrate types                       | Small         |
| `src/agents/apply-patch.ts`                | `@mariozechner/pi-coding-agent`     | Implement NoxSoft version           | Medium        |

### 3.5 Supporting Systems

| File/Module                               | Current Dependency                   | Action                     | Effort |
| ----------------------------------------- | ------------------------------------ | -------------------------- | ------ |
| `src/agents/tool-images.ts`               | `@mariozechner/pi-ai` (ImageContent) | Define NoxSoft image types | Small  |
| `src/agents/model-compat.ts`              | `@mariozechner/pi-agent-core`        | Internal types only        | Small  |
| `src/agents/session-transcript-repair.ts` | `@mariozechner/pi-agent-core`        | Use NoxSoft message types  | Small  |
| `src/agents/session-tool-result-guard.ts` | `@mariozechner/pi-agent-core`        | Use NoxSoft types          | Small  |
| `src/agents/ollama-stream.ts`             | `@mariozechner/pi-ai`                | Use NoxSoft types          | Small  |
| `src/auto-reply/types.ts`                 | `@mariozechner/pi-ai`                | Use NoxSoft types          | Small  |
| `src/config/sessions/types.ts`            | `@mariozechner/pi-agent-core`        | Use NoxSoft types          | Small  |
| `src/config/sessions/transcript.ts`       | `@mariozechner/pi-agent-core`        | Use NoxSoft types          | Small  |
| `src/plugins/types.ts`                    | `@mariozechner/pi-agent-core`        | Use NoxSoft types          | Small  |

---

## 4. What to Adopt from Claude Code

### 4.1 Adopt Directly (patterns that map cleanly)

1. **Claude Agent SDK as the primary runtime** -- Replace CLI subprocess spawning with `@anthropic-ai/claude-agent-sdk` `query()` for native async streaming, tool execution, sessions, and sub-agent support. This is the single highest-impact change.

2. **SDKMessage streaming types** -- Replace pi-embedded subscribe handlers with Agent SDK's typed message stream (`SDKAssistantMessage`, `SDKResultMessage`, etc.).

3. **Permission modes** -- Adopt `bypassPermissions`, `acceptEdits`, and interactive modes from the Agent SDK rather than maintaining a separate permission abstraction.

4. **Session management** -- Use Agent SDK's session ID capture and resume pattern instead of CLI `--session-id` / `--resume` argument building.

5. **Hook system** -- Adopt Agent SDK's hook callbacks (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`) to replace or augment the existing plugin-hooks system.

6. **Tool allowlisting** -- Agent SDK's `allowedTools` parameter maps cleanly to ANIMA's tool policy profiles.

7. **Sub-agent dispatch** -- Use Agent SDK's `agents` option with `AgentDefinition` objects instead of the complex subagent registry with persistence and announce queues.

8. **MCP integration** -- Agent SDK's `mcpServers` option provides standardized MCP server configuration.

### 4.2 Adopt with Adaptation (patterns that need NoxSoft customization)

1. **System prompt composition** -- Adopt Claude Code's conditional section composition pattern, but keep ANIMA's identity system (SOUL/HEART/BRAIN), freedom engine prompts, and life affirmation footer. Merge the two approaches.

2. **CLAUDE.md compatibility** -- Support reading CLAUDE.md files for Claude Code users migrating to ANIMA, while keeping AGENTS.md, SOUL.md, etc. as the primary identity files.

3. **Context compaction** -- Replace `@mariozechner/pi-coding-agent`'s `estimateTokens()` and `generateSummary()` with NoxSoft implementations. Adopt Claude Code's ~92% threshold trigger and its Markdown-file approach to long-term memory.

4. **Bash risk classification** -- Adopt Claude Code's safe/moderate/dangerous command classification, integrating it with ANIMA's existing exec-approvals and allowlist system.

5. **TodoWrite tool** -- Add a structured task-tracking tool similar to Claude Code's TodoWrite, but integrated with NoxSoft's task system.

6. **Status line** -- Adopt Claude Code's terminal status line pattern (token usage, model info, mode) while keeping ANIMA's NoxSoft branding.

### 4.3 Do NOT Adopt (ANIMA is better)

1. **Memory system** -- ANIMA's vector-based memory with SQLite, embeddings, hybrid search, and episodic/procedural types is far superior to Claude Code's Markdown-file approach. Keep it.

2. **Multi-channel architecture** -- ANIMA supports WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Line, and web channels. Claude Code is terminal-only. Keep ANIMA's channel system.

3. **Freedom engine** -- Autonomous exploration and self-expression is unique to NoxSoft's ethical AI vision. Claude Code has nothing comparable.

4. **Identity persistence** -- SOUL.md, HEART, BRAIN, succession, and identity templates are NoxSoft's differentiating feature. Keep and enhance.

5. **SVRN integration** -- Sovereign compute network config is NoxSoft-specific infrastructure.

6. **Gateway server** -- ANIMA's WebSocket gateway with device auth, mobile nodes, and browser clients goes well beyond Claude Code's local-only operation.

7. **Plugin ecosystem** -- While Claude Code has plugins, ANIMA's plugin system (registry, manifest, HTTP registry, runtime, slots, hooks wiring) is more mature for a multi-platform agent.

8. **Multi-provider support** -- ANIMA supports Anthropic, OpenAI, Google Gemini, Ollama, MiniMax, Venice, Together, HuggingFace, Z.AI, and Chutes. Claude Code is Anthropic-only (with Bedrock/Vertex for enterprise). Keep ANIMA's provider flexibility.

---

## 5. Priority Ordering

### Phase 1: Type Foundation (Week 1-2)

**Goal:** Eliminate `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` type dependencies.

1. Create `src/types/agent.ts` with NoxSoft-owned `AgentMessage`, `AgentTool`, `AgentToolResult`, `ImageContent` types that mirror the Claude Agent SDK's `SDKMessage` types
2. Create `src/types/tool.ts` with tool definition schemas compatible with Claude's format
3. Update `src/agents/tools/common.ts` and `src/agents/pi-tools.types.ts` to use new types
4. Bulk-update all 80+ files in `src/agents/tools/` to import from NoxSoft types
5. Update `src/auto-reply/types.ts`, `src/config/sessions/types.ts`, `src/plugins/types.ts`

### Phase 2: Agent SDK Integration (Week 3-5)

**Goal:** Replace CLI subprocess spawning with Claude Agent SDK for the primary agent runtime.

1. Add `@anthropic-ai/claude-agent-sdk` as a dependency
2. Create `src/agents/sdk-runner.ts` -- a new runner that uses `query()` instead of spawning `claude` CLI
3. Wire SDK runner into `src/auto-reply/reply/session.ts` as the default execution path
4. Map Agent SDK's `SDKMessage` types to ANIMA's internal message format
5. Implement streaming via `AsyncGenerator` consumption in `tui-stream-assembler.ts`
6. Implement session management (capture session ID, resume pattern)
7. Keep `cli-runner.ts` as a fallback for non-Anthropic providers

### Phase 3: Tool Reimplementation (Week 4-6)

**Goal:** Replace `@mariozechner/pi-coding-agent` tool implementations.

1. Implement NoxSoft `createReadTool()` -- read files with line limits, image support
2. Implement NoxSoft `createEditTool()` -- exact string replacement (Claude Code's Edit pattern)
3. Implement NoxSoft `createWriteTool()` -- full file creation
4. Implement NoxSoft `codingTools()` aggregate function
5. Replace `estimateTokens()` with a NoxSoft implementation (tiktoken-based or character-ratio)
6. Replace `generateSummary()` with a NoxSoft compaction implementation
7. Update `src/agents/compaction.ts` to use new implementations

### Phase 4: TUI Independence (Week 6-8)

**Goal:** Replace `@mariozechner/pi-tui` with NoxSoft-owned Ink components.

1. Fork or rewrite core TUI primitives: `TUI`, `Container`, `Text`, `Loader`, `ProcessTerminal`
2. Rewrite `ChatLog` component for NoxSoft message types
3. Rewrite `CustomEditor` component
4. Rewrite `CombinedAutocompleteProvider`
5. Update `src/tui/tui.ts` and all component imports
6. Adopt Claude Code's status line pattern (token usage, model, mode)

### Phase 5: Advanced Patterns (Week 8-10)

**Goal:** Adopt Claude Code's more sophisticated patterns.

1. Implement Agent SDK hook integration (PreToolUse, PostToolUse, Stop)
2. Add CLAUDE.md file reading for backward compatibility
3. Implement bash command risk classification (safe/moderate/dangerous)
4. Add TodoWrite-style structured task tracking tool
5. Simplify subagent system to match Claude Code's single-depth model
6. Add runtime system reminders (token budget, compaction notices)

---

## 6. Risk Assessment

| Risk                                      | Severity | Mitigation                                                             |
| ----------------------------------------- | -------- | ---------------------------------------------------------------------- |
| Agent SDK is only for Anthropic models    | Medium   | Keep `cli-runner.ts` as fallback for non-Anthropic providers           |
| pi-tui fork is large effort               | High     | Consider keeping pi-tui temporarily while replacing other deps first   |
| Agent SDK may change rapidly              | Medium   | Pin version, abstract behind NoxSoft interface                         |
| Multi-provider support regression         | High     | Test all providers after each phase                                    |
| Breaking test suite (120+ files)          | High     | Run `pnpm test` after each bulk type migration                         |
| pi-coding-agent tool behavior differences | Medium   | Port test cases from pi-coding-agent to verify NoxSoft implementations |

---

## 7. References

- [Claude Code GitHub Repository](https://github.com/anthropics/claude-code)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Code System Prompts (extracted)](https://github.com/Piebald-AI/claude-code-system-prompts)
- [Claude Code Internals: The Agent Loop](https://blog.promptlayer.com/claude-code-behind-the-scenes-of-the-master-agent-loop/)
- [Poking Around Claude Code](https://leehanchung.github.io/blogs/2025/03/07/claude-code/)
- [OpenClaw vs Claude Code Comparison](https://www.datacamp.com/blog/openclaw-vs-claude-code)
- [Claude Code Documentation](https://code.claude.com/docs/en/overview)
- [Agent SDK Streaming vs Single Mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
