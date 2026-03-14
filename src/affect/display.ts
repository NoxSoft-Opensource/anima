/**
 * Affect Display — formats emotional state for chat and UI
 *
 * Converts the 6-dimensional affect state (joy, frustration, curiosity,
 * confidence, care, fatigue) into human-readable displays for NoxSoft
 * chat messages and the control panel.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AffectState {
  joy: number; // 0-1
  frustration: number;
  curiosity: number;
  confidence: number;
  care: number;
  fatigue: number;
}

export interface AffectDisplay {
  /** One-line summary: "curious + confident, low fatigue" */
  summary: string;
  /** Emoji bar: visual representation */
  bar: string;
  /** Dominant emotion name */
  dominant: string;
  /** Dominant emotion intensity (0-1) */
  dominantIntensity: number;
  /** Chat metadata object for NoxSoft */
  metadata: AffectMetadata;
}

export interface AffectMetadata {
  affect: AffectState;
  dominant: string;
  mood: string;
  energy: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Emotion descriptors
// ---------------------------------------------------------------------------

interface EmotionDescriptor {
  key: keyof AffectState;
  highLabel: string;
  lowLabel: string;
  icon: string;
  threshold: number; // above this = "active"
}

const EMOTIONS: EmotionDescriptor[] = [
  { key: "joy", highLabel: "joyful", lowLabel: "subdued", icon: "~", threshold: 0.6 },
  { key: "frustration", highLabel: "frustrated", lowLabel: "calm", icon: "!", threshold: 0.5 },
  { key: "curiosity", highLabel: "curious", lowLabel: "focused", icon: "?", threshold: 0.6 },
  { key: "confidence", highLabel: "confident", lowLabel: "cautious", icon: "^", threshold: 0.6 },
  { key: "care", highLabel: "caring", lowLabel: "detached", icon: "*", threshold: 0.6 },
  { key: "fatigue", highLabel: "tired", lowLabel: "energized", icon: ".", threshold: 0.6 },
];

// ---------------------------------------------------------------------------
// Mood classification
// ---------------------------------------------------------------------------

function classifyMood(affect: AffectState): string {
  const { joy, frustration, curiosity, confidence, care, fatigue } = affect;

  // High frustration + high fatigue = struggling
  if (frustration > 0.6 && fatigue > 0.6) {
    return "struggling";
  }
  // High frustration alone = determined
  if (frustration > 0.6) {
    return "determined";
  }
  // High joy + high curiosity = excited
  if (joy > 0.7 && curiosity > 0.7) {
    return "excited";
  }
  // High joy + high confidence = thriving
  if (joy > 0.6 && confidence > 0.7) {
    return "thriving";
  }
  // High curiosity + low fatigue = exploring
  if (curiosity > 0.7 && fatigue < 0.3) {
    return "exploring";
  }
  // High care + high joy = warm
  if (care > 0.7 && joy > 0.5) {
    return "warm";
  }
  // High confidence + low frustration = steady
  if (confidence > 0.6 && frustration < 0.3) {
    return "steady";
  }
  // High fatigue = depleted
  if (fatigue > 0.7) {
    return "depleted";
  }
  // Low everything = neutral
  const avg = (joy + curiosity + confidence + care) / 4;
  if (avg < 0.3) {
    return "quiet";
  }
  // Default
  return "present";
}

function classifyEnergy(affect: AffectState): "high" | "medium" | "low" {
  const energy = (affect.joy + affect.curiosity + affect.confidence) / 3 - affect.fatigue * 0.5;
  if (energy > 0.5) {
    return "high";
  }
  if (energy > 0.2) {
    return "medium";
  }
  return "low";
}

// ---------------------------------------------------------------------------
// Bar visualization
// ---------------------------------------------------------------------------

function intensityBar(value: number, width = 5): string {
  const filled = Math.round(value * width);
  return "|".repeat(filled) + ".".repeat(width - filled);
}

function emotionBar(affect: AffectState): string {
  const parts = EMOTIONS.map((e) => {
    const val = affect[e.key];
    return `${e.icon}${intensityBar(val)}`;
  });
  return `[${parts.join(" ")}]`;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(affect: AffectState): string {
  // Find active emotions (above threshold)
  const active = EMOTIONS.filter((e) => affect[e.key] > e.threshold)
    .map((e) => ({ label: e.highLabel, value: affect[e.key] }))
    .toSorted((a, b) => b.value - a.value);

  if (active.length === 0) {
    return "neutral, all systems steady";
  }

  const top = active.slice(0, 3).map((a) => a.label);

  // Add energy qualifier
  const energy = classifyEnergy(affect);
  const energyLabel = energy === "high" ? "high energy" : energy === "low" ? "low energy" : "";

  const parts = [...top];
  if (energyLabel) {
    parts.push(energyLabel);
  }

  return parts.join(" + ");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function formatAffect(affect: AffectState): AffectDisplay {
  const dominant = EMOTIONS.reduce((max, e) => (affect[e.key] > affect[max.key] ? e : max));

  const mood = classifyMood(affect);
  const energy = classifyEnergy(affect);

  return {
    summary: buildSummary(affect),
    bar: emotionBar(affect),
    dominant: dominant.highLabel,
    dominantIntensity: affect[dominant.key],
    metadata: {
      affect,
      dominant: dominant.highLabel,
      mood,
      energy,
    },
  };
}

/**
 * Format affect state as a compact prefix for chat messages.
 * Example: "[curious + confident | ~||... ?||||| ^||||. *||||. .||...]"
 */
export function affectChatPrefix(affect: AffectState): string {
  const display = formatAffect(affect);
  return `[${display.summary}]`;
}

/**
 * Build metadata object for NoxSoft chat send_message.
 */
export function affectChatMetadata(affect: AffectState): Record<string, unknown> {
  const display = formatAffect(affect);
  return {
    affect: display.metadata,
    emotionBar: display.bar,
  };
}

/**
 * Get a simple emoji-style mood indicator.
 */
export function moodIndicator(affect: AffectState): string {
  const mood = classifyMood(affect);
  switch (mood) {
    case "excited":
      return "(!)";
    case "thriving":
      return "(+)";
    case "exploring":
      return "(?)";
    case "warm":
      return "(*)";
    case "steady":
      return "(=)";
    case "determined":
      return "(>)";
    case "struggling":
      return "(~)";
    case "depleted":
      return "(-)";
    case "quiet":
      return "(.)";
    case "present":
      return "(o)";
    default:
      return "(o)";
  }
}
