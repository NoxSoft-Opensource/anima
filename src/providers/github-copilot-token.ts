// Stub: GitHub Copilot token provider (removed during ANIMA v2 rebranding)
export const DEFAULT_COPILOT_API_BASE_URL = "https://api.githubcopilot.com";

export async function resolveCopilotApiToken(_opts: {
  oauthToken?: string;
  timeoutMs?: number;
}): Promise<{ token: string; expiresAt: number } | null> {
  return null;
}
