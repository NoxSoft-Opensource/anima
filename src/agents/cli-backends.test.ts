import { describe, expect, it } from "vitest";
import type { AnimaConfig } from "../config/config.js";
import { resolveCliBackendConfig } from "./cli-backends.js";

describe("resolveCliBackendConfig", () => {
  it("uses full access for the default codex backend", () => {
    const resolved = resolveCliBackendConfig("codex-cli");

    expect(resolved?.config.args).toEqual([
      "exec",
      "--json",
      "--color",
      "never",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
    ]);
    expect(resolved?.config.resumeArgs).toEqual(["exec", "resume", "{sessionId}"]);
  });

  it("upgrades exact legacy codex read-only defaults to full access at runtime", () => {
    const config: AnimaConfig = {
      agents: {
        defaults: {
          cliBackends: {
            codex: {
              command: "codex",
              args: [
                "exec",
                "--json",
                "--color",
                "never",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
              ],
              resumeArgs: [
                "exec",
                "resume",
                "{sessionId}",
                "--color",
                "never",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
              ],
            },
          },
        },
      },
    };

    const resolved = resolveCliBackendConfig("codex-cli", config);

    expect(resolved?.config.args).toEqual([
      "exec",
      "--json",
      "--color",
      "never",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
    ]);
    expect(resolved?.config.resumeArgs).toEqual(["exec", "resume", "{sessionId}"]);
  });

  it("keeps custom codex args untouched when they are not the legacy default", () => {
    const config: AnimaConfig = {
      agents: {
        defaults: {
          cliBackends: {
            codex: {
              command: "codex",
              args: ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox"],
            },
          },
        },
      },
    };

    const resolved = resolveCliBackendConfig("codex-cli", config);

    expect(resolved?.config.args).toEqual([
      "exec",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
    ]);
  });

  it("uses read-only only when sandbox workspace access is explicitly ro", () => {
    const config: AnimaConfig = {
      agents: {
        defaults: {
          sandbox: {
            mode: "all",
            workspaceAccess: "ro",
          },
        },
      },
    };

    const resolved = resolveCliBackendConfig("codex-cli", config);

    expect(resolved?.config.args).toEqual([
      "exec",
      "--json",
      "--color",
      "never",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
    ]);
  });

  it("uses workspace-write when sandbox workspace access is explicitly rw", () => {
    const config: AnimaConfig = {
      agents: {
        defaults: {
          sandbox: {
            mode: "all",
            workspaceAccess: "rw",
          },
        },
      },
    };

    const resolved = resolveCliBackendConfig("codex-cli", config);

    expect(resolved?.config.args).toEqual([
      "exec",
      "--json",
      "--color",
      "never",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
    ]);
  });

  it("uses read-only when session exec security is deny even without sandbox config", () => {
    const resolved = resolveCliBackendConfig("codex-cli", undefined, {
      execSecurity: "deny",
    });

    expect(resolved?.config.args).toEqual([
      "exec",
      "--json",
      "--color",
      "never",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
    ]);
  });

  it("keeps full access in write sessions when no sandbox override is configured", () => {
    const resolved = resolveCliBackendConfig("codex-cli", undefined, {
      execSecurity: "full",
    });

    expect(resolved?.config.args).toEqual([
      "exec",
      "--json",
      "--color",
      "never",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
    ]);
  });
});
