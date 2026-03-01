// Stub: Qwen Portal OAuth provider (removed during ANIMA v2 rebranding)

export type QwenPortalCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export async function refreshQwenPortalCredentials(_opts: {
  refreshToken: string;
}): Promise<QwenPortalCredentials | null> {
  return null;
}
