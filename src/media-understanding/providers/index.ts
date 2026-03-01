// Stub: media understanding provider registry (removed during ANIMA v2 rebranding)

export type MediaUnderstandingProvider = {
  id: string;
  name: string;
  describeVideo?: (...args: unknown[]) => Promise<string>;
};

export function normalizeMediaProviderId(id: string): string {
  return id.toLowerCase().trim();
}

export function getMediaUnderstandingProvider(id: string): MediaUnderstandingProvider | undefined {
  void id;
  return undefined;
}

export function buildMediaUnderstandingRegistry(): Map<string, MediaUnderstandingProvider> {
  return new Map();
}
