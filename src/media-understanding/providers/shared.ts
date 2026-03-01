// Stub: media understanding providers shared utilities (removed during ANIMA v2 rebranding)

export async function fetchWithTimeout(
  url: string,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = opts?.timeoutMs ?? 30_000;
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: opts?.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
}
