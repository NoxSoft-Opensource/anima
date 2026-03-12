import * as amplitude from "@amplitude/unified";

const AMPLITUDE_API_KEY = "59c3e241b838466cd5fc0657b380fb4b";
const AMPLITUDE_INIT_GUARD = "__animaAmplitudeInitialized";

type AmplitudeWindow = Window & {
  [AMPLITUDE_INIT_GUARD]?: boolean;
};

function getAmplitudeWindow(): AmplitudeWindow | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window as AmplitudeWindow;
}

export function initializeAmplitude(): void {
  const amplitudeWindow = getAmplitudeWindow();
  if (!amplitudeWindow || amplitudeWindow[AMPLITUDE_INIT_GUARD]) {
    return;
  }

  amplitude.initAll(AMPLITUDE_API_KEY, {
    analytics: { autocapture: true },
    sessionReplay: { sampleRate: 1 },
  });

  amplitudeWindow[AMPLITUDE_INIT_GUARD] = true;
}

export function trackAmplitudeEvent(
  eventType: string,
  eventProperties?: Record<string, unknown>,
): void {
  if (!getAmplitudeWindow()) {
    return;
  }

  initializeAmplitude();
  amplitude.track(eventType, eventProperties);
}
