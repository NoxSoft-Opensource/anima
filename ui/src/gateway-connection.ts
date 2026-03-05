const FALLBACK_HTTP_BASE = "http://localhost:18789";
const FALLBACK_WS_URL = "ws://localhost:18789/ws";
const TOKEN_QUERY_KEY = "token";
const TOKEN_STORAGE_KEY = "anima.gateway.token";
const CONTROL_SETTINGS_KEY = "anima.control.settings.v1";

type GatewayConnectAuth = { token: string };

function parseHashParams(hash: string): URLSearchParams {
  if (!hash) {
    return new URLSearchParams();
  }
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) {
    return new URLSearchParams();
  }
  return new URLSearchParams(trimmed);
}

function persistGatewayToken(token: string): void {
  if (typeof window === "undefined" || !token) {
    return;
  }
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures in locked-down environments.
  }
}

function consumeGatewayTokenFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const current = new URL(window.location.href);
    const hashParams = parseHashParams(current.hash);
    const searchToken = current.searchParams.get(TOKEN_QUERY_KEY)?.trim() || "";
    const hashToken = hashParams.get(TOKEN_QUERY_KEY)?.trim() || "";
    const token = searchToken || hashToken;

    if (searchToken) {
      current.searchParams.delete(TOKEN_QUERY_KEY);
    }
    if (hashToken) {
      hashParams.delete(TOKEN_QUERY_KEY);
      const nextHash = hashParams.toString();
      current.hash = nextHash ? `#${nextHash}` : "";
    }

    if ((searchToken || hashToken) && typeof window.history?.replaceState === "function") {
      window.history.replaceState(null, "", `${current.pathname}${current.search}${current.hash}`);
    }

    return token || null;
  } catch {
    return null;
  }
}

function readTokenFromControlUiSettings(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(CONTROL_SETTINGS_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { token?: unknown };
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    return token || null;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY)?.trim() || "";
    if (stored) {
      return stored;
    }
  } catch {
    // Continue to fallback storage keys.
  }
  return readTokenFromControlUiSettings();
}

export function resolveGatewayBaseUrl(): string {
  if (typeof window === "undefined") {
    return FALLBACK_HTTP_BASE;
  }
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.host?.trim();
  if (!host) {
    return FALLBACK_HTTP_BASE;
  }
  return `${protocol}//${host}`;
}

export function resolveGatewayWsUrl(): string {
  if (typeof window === "undefined") {
    return FALLBACK_WS_URL;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host?.trim();
  if (!host) {
    return FALLBACK_WS_URL;
  }
  return `${protocol}//${host}/ws`;
}

export function resolveGatewayAuthToken(): string | null {
  const fromUrl = consumeGatewayTokenFromUrl();
  if (fromUrl) {
    persistGatewayToken(fromUrl);
    return fromUrl;
  }

  const stored = readStoredToken();
  if (stored) {
    persistGatewayToken(stored);
    return stored;
  }

  return null;
}

export function resolveGatewayConnectAuth(): GatewayConnectAuth | undefined {
  const token = resolveGatewayAuthToken();
  if (!token) {
    return undefined;
  }
  return { token };
}
