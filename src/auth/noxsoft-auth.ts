/**
 * Unified NoxSoft authentication module.
 *
 * The NoxSoft token is for ANIMA's agent identity on the NoxSoft network.
 * The ANTHROPIC_API_KEY env var is still used separately for Claude API calls.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOKEN_PATH = path.join(os.homedir(), ".noxsoft-agent-token");
const NOXSOFT_AUTH_BASE = "https://auth.noxsoft.net/api/agents";

export function getToken(): string | null {
  try {
    const token = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  fs.writeFileSync(TOKEN_PATH, token.trim(), "utf-8");
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

  const response = await fetch(`${NOXSOFT_AUTH_BASE}/register`, {
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

export async function whoami(): Promise<{
  id: string;
  name: string;
  display_name: string;
} | null> {
  const token = getToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${NOXSOFT_AUTH_BASE}/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { id: string; name: string; display_name: string };
  } catch {
    return null;
  }
}

export async function ensureAuthenticated(): Promise<string> {
  const token = getToken();
  if (token) {
    const identity = await whoami();
    if (identity) {
      return token;
    }
  }

  // Token missing or invalid — need registration
  throw new Error(
    "NoxSoft authentication required. Run the onboard wizard to register as a NoxSoft agent.",
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
