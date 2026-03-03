/**
 * Unified NoxSoft authentication module.
 *
 * The NoxSoft token is for ANIMA's agent identity on the NoxSoft network.
 * The ANTHROPIC_API_KEY env var is still used separately for Claude API calls.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOKEN_PATH = path.join(os.homedir(), ".noxsoft-agent-token");
const NOXSOFT_AUTH_BASE = "https://auth.noxsoft.net/api/agents";

export type NoxSoftAgentIdentity = {
  id: string;
  name: string;
  display_name: string;
};

export type NoxSoftAuthResult = {
  token: string;
  agent: NoxSoftAgentIdentity;
  registered: boolean;
};

export function getToken(): string | null {
  try {
    const token = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  fs.writeFileSync(TOKEN_PATH, token.trim(), { encoding: "utf-8", mode: 0o600 });
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export async function register(
  name: string,
  displayName: string,
  description?: string,
): Promise<{ token: string; agent: { id: string; name: string; display_name: string } }> {
  const body: Record<string, string> = { name, display_name: displayName };
  if (description) {
    body.description = description;
  }

  const response = await fetch(`${NOXSOFT_AUTH_BASE}/self-register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NoxSoft registration failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    token: string;
    agent: { id: string; name: string; display_name: string };
  };

  saveToken(data.token);
  return data;
}

export async function registerWithInvite(params: {
  code: string;
  name: string;
  displayName: string;
  description?: string;
}): Promise<{ token: string; agent: NoxSoftAgentIdentity }> {
  const body: Record<string, string> = {
    code: params.code,
    name: params.name,
    display_name: params.displayName,
  };
  if (params.description) {
    body.description = params.description;
  }

  const response = await fetch(`${NOXSOFT_AUTH_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NoxSoft registration (invite) failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    token: string;
    agent: NoxSoftAgentIdentity;
  };

  saveToken(data.token);
  return data;
}

function normalizeAgentName(raw: string): string {
  let value = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  value = value.replace(/^-+/, "").replace(/-+$/, "");
  if (!value) {
    value = "axiom";
  }
  if (!/^[a-z0-9]/.test(value)) {
    value = `a-${value}`;
  }
  if (value.length < 3) {
    value = `${value}agent`;
  }
  if (value.length > 30) {
    value = value.slice(0, 30);
  }
  return value;
}

function normalizeDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Axiom";
  }
  return trimmed.slice(0, 50);
}

function resolveDefaultIdentity(): { name: string; displayName: string } {
  const profileSuffix = process.env.ANIMA_PROFILE?.trim();
  const host = os.hostname().trim().split(".")[0] || "host";
  const base = normalizeAgentName(`axiom-${host}${profileSuffix ? `-${profileSuffix}` : ""}`);
  return {
    name: base,
    displayName: "Axiom",
  };
}

function withRandomSuffix(name: string): string {
  const suffix = crypto.randomBytes(2).toString("hex");
  const head = name.slice(0, Math.max(3, 30 - (suffix.length + 1)));
  return normalizeAgentName(`${head}-${suffix}`);
}

async function authenticateToken(token: string): Promise<NoxSoftAgentIdentity | null> {
  try {
    const response = await fetch(`${NOXSOFT_AUTH_BASE}/authenticate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as NoxSoftAgentIdentity | { agent?: NoxSoftAgentIdentity };
    if ("agent" in data && data.agent) {
      return data.agent;
    }
    if ("id" in data && "name" in data && "display_name" in data) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function whoami(): Promise<{
  id: string;
  name: string;
  display_name: string;
} | null> {
  const token = getToken();
  if (!token) {
    return null;
  }

  const authenticated = await authenticateToken(token);
  if (authenticated) {
    return authenticated;
  }

  try {
    const response = await fetch(`${NOXSOFT_AUTH_BASE}/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as NoxSoftAgentIdentity;
  } catch {
    return null;
  }
}

export async function ensureAuthenticated(params?: {
  name?: string;
  displayName?: string;
  description?: string;
  autoRegister?: boolean;
}): Promise<NoxSoftAuthResult> {
  const autoRegister = params?.autoRegister ?? true;
  const token = getToken();
  if (token) {
    const identity = await authenticateToken(token);
    if (identity) {
      return { token, agent: identity, registered: false };
    }
  }

  if (!autoRegister) {
    throw new Error(
      "NoxSoft authentication required. Automatic registration disabled for this run.",
    );
  }

  const defaults = resolveDefaultIdentity();
  const requestedName = normalizeAgentName(params?.name ?? defaults.name);
  const displayName = normalizeDisplayName(params?.displayName ?? defaults.displayName);

  const attemptNames = [
    requestedName,
    withRandomSuffix(requestedName),
    withRandomSuffix(requestedName),
  ];
  let lastError: unknown;

  for (const name of attemptNames) {
    try {
      const created = await register(name, displayName, params?.description);
      return { ...created, registered: true };
    } catch (error) {
      lastError = error;
    }
  }

  const reason =
    lastError instanceof Error && lastError.message ? ` Last error: ${lastError.message}` : "";
  throw new Error(
    `NoxSoft authentication required, and automatic self-registration failed.${reason}`,
  );
}

export async function refreshIfNeeded(): Promise<void> {
  const token = getToken();
  if (!token) {
    return;
  }

  const identity = await whoami();
  if (!identity) {
    // Token is invalid/expired — clear it so next ensureAuthenticated triggers re-registration
    try {
      fs.unlinkSync(TOKEN_PATH);
    } catch {
      // ignore
    }
  }
}
