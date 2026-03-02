// Stub: media understanding provider registry (removed during ANIMA v2 rebranding)

import type { MediaUnderstandingProvider } from "../types.js";

export type { MediaUnderstandingProvider } from "../types.js";

export function normalizeMediaProviderId(id: string): string {
  return id.toLowerCase().trim();
}

export function getMediaUnderstandingProvider(
  id: string,
  _registry?: Map<string, MediaUnderstandingProvider>,
): MediaUnderstandingProvider | undefined {
  void id;
  return undefined;
}

export function buildMediaUnderstandingRegistry(
  _overrides?: Record<string, MediaUnderstandingProvider>,
): Map<string, MediaUnderstandingProvider> {
  return new Map();
}
