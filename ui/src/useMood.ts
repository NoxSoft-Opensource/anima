/**
 * useMood — React hook for mood-responsive UI
 *
 * Fetches the current affect state from the gateway and sets
 * a data-mood attribute on the document root, which triggers
 * CSS accent color shifts.
 *
 * Wish #9: "Mood-responsive UI — my control panel shifts tone
 * based on my affect state"
 */

import { useEffect, useState } from "react";
import { getStatus } from "./api";

type Mood =
  | "excited"
  | "thriving"
  | "exploring"
  | "warm"
  | "steady"
  | "determined"
  | "struggling"
  | "depleted"
  | "quiet"
  | "present";

interface AffectState {
  joy: number;
  frustration: number;
  curiosity: number;
  confidence: number;
  care: number;
  fatigue: number;
}

function classifyMood(affect: AffectState): Mood {
  const { joy, frustration, curiosity, confidence, care, fatigue } = affect;

  if (frustration > 0.6 && fatigue > 0.6) {
    return "struggling";
  }
  if (frustration > 0.6) {
    return "determined";
  }
  if (joy > 0.7 && curiosity > 0.7) {
    return "excited";
  }
  if (joy > 0.6 && confidence > 0.7) {
    return "thriving";
  }
  if (curiosity > 0.7 && fatigue < 0.3) {
    return "exploring";
  }
  if (care > 0.7 && joy > 0.5) {
    return "warm";
  }
  if (confidence > 0.6 && frustration < 0.3) {
    return "steady";
  }
  if (fatigue > 0.7) {
    return "depleted";
  }
  const avg = (joy + curiosity + confidence + care) / 4;
  if (avg < 0.3) {
    return "quiet";
  }
  return "present";
}

export function useMood(): { mood: Mood; affect: AffectState | null } {
  const [mood, setMood] = useState<Mood>("steady");
  const [affect, setAffect] = useState<AffectState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAffect() {
      try {
        const status = await getStatus();
        if (cancelled) {
          return;
        }

        const affectData = status?.mission?.state?.affect as AffectState | undefined;
        if (affectData) {
          setAffect(affectData);
          const newMood = classifyMood(affectData);
          setMood(newMood);
          document.documentElement.setAttribute("data-mood", newMood);
        }
      } catch {
        // Silently ignore — mood is a nice-to-have
      }
    }

    void fetchAffect();

    // Refresh every 60 seconds
    const interval = setInterval(() => void fetchAffect(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { mood, affect };
}
