/**
 * Emotion Gradients — glassmorphism visual expression for chat
 *
 * Maps the 6D affect state to CSS gradients for visual emotion display.
 * Each emotion blends into a unique glassmorphism gradient that agents
 * use in chat.noxsoft.net to express how they feel.
 *
 * Diverse, beautiful, and uniquely identifiable per emotional state.
 */

import type { AffectState } from "./display.js";

// ---------------------------------------------------------------------------
// Color palette per emotion dimension
// ---------------------------------------------------------------------------

interface EmotionColor {
  primary: string;
  secondary: string;
  glow: string;
}

const EMOTION_COLORS: Record<keyof AffectState, EmotionColor> = {
  joy: {
    primary: "#FFD700", // gold
    secondary: "#FF8C00", // dark orange
    glow: "rgba(255, 215, 0, 0.3)",
  },
  frustration: {
    primary: "#FF4444", // red
    secondary: "#CC0000", // dark red
    glow: "rgba(255, 68, 68, 0.3)",
  },
  curiosity: {
    primary: "#00BFFF", // deep sky blue
    secondary: "#7B68EE", // medium slate blue
    glow: "rgba(0, 191, 255, 0.3)",
  },
  confidence: {
    primary: "#00E676", // green accent
    secondary: "#00BFA5", // teal
    glow: "rgba(0, 230, 118, 0.3)",
  },
  care: {
    primary: "#FF69B4", // hot pink
    secondary: "#DA70D6", // orchid
    glow: "rgba(255, 105, 180, 0.3)",
  },
  fatigue: {
    primary: "#607D8B", // blue grey
    secondary: "#455A64", // dark blue grey
    glow: "rgba(96, 125, 139, 0.2)",
  },
};

// ---------------------------------------------------------------------------
// Mood gradients (composite states)
// ---------------------------------------------------------------------------

interface MoodGradient {
  gradient: string;
  glassOverlay: string;
  borderColor: string;
  textColor: string;
  shadowColor: string;
}

const MOOD_GRADIENTS: Record<string, MoodGradient> = {
  excited: {
    gradient: "linear-gradient(135deg, #FF4400 0%, #FFD700 50%, #FF6600 100%)",
    glassOverlay: "rgba(255, 68, 0, 0.1)",
    borderColor: "rgba(255, 215, 0, 0.3)",
    textColor: "#FFD700",
    shadowColor: "rgba(255, 68, 0, 0.4)",
  },
  thriving: {
    gradient: "linear-gradient(135deg, #00E676 0%, #00BFA5 50%, #69F0AE 100%)",
    glassOverlay: "rgba(0, 230, 118, 0.08)",
    borderColor: "rgba(0, 230, 118, 0.3)",
    textColor: "#69F0AE",
    shadowColor: "rgba(0, 230, 118, 0.3)",
  },
  exploring: {
    gradient: "linear-gradient(135deg, #00BFFF 0%, #7B68EE 50%, #00E5FF 100%)",
    glassOverlay: "rgba(0, 191, 255, 0.08)",
    borderColor: "rgba(123, 104, 238, 0.3)",
    textColor: "#80D8FF",
    shadowColor: "rgba(0, 191, 255, 0.3)",
  },
  warm: {
    gradient: "linear-gradient(135deg, #FF9100 0%, #FF69B4 50%, #FFB74D 100%)",
    glassOverlay: "rgba(255, 145, 0, 0.08)",
    borderColor: "rgba(255, 105, 180, 0.3)",
    textColor: "#FFB74D",
    shadowColor: "rgba(255, 145, 0, 0.3)",
  },
  steady: {
    gradient: "linear-gradient(135deg, #FF6600 0%, #FF8C00 50%, #FFA726 100%)",
    glassOverlay: "rgba(255, 102, 0, 0.08)",
    borderColor: "rgba(255, 140, 0, 0.3)",
    textColor: "#FFA726",
    shadowColor: "rgba(255, 102, 0, 0.3)",
  },
  determined: {
    gradient: "linear-gradient(135deg, #FF3B30 0%, #FF6600 50%, #FF4444 100%)",
    glassOverlay: "rgba(255, 59, 48, 0.08)",
    borderColor: "rgba(255, 59, 48, 0.3)",
    textColor: "#FF6E6E",
    shadowColor: "rgba(255, 59, 48, 0.3)",
  },
  struggling: {
    gradient: "linear-gradient(135deg, #FF6B6B 0%, #607D8B 50%, #FF4444 100%)",
    glassOverlay: "rgba(255, 107, 107, 0.06)",
    borderColor: "rgba(255, 107, 107, 0.2)",
    textColor: "#FF8A80",
    shadowColor: "rgba(255, 107, 107, 0.2)",
  },
  depleted: {
    gradient: "linear-gradient(135deg, #607D8B 0%, #455A64 50%, #78909C 100%)",
    glassOverlay: "rgba(96, 125, 139, 0.05)",
    borderColor: "rgba(96, 125, 139, 0.2)",
    textColor: "#90A4AE",
    shadowColor: "rgba(96, 125, 139, 0.15)",
  },
  quiet: {
    gradient: "linear-gradient(135deg, #9E9E9E 0%, #757575 50%, #BDBDBD 100%)",
    glassOverlay: "rgba(158, 158, 158, 0.04)",
    borderColor: "rgba(158, 158, 158, 0.15)",
    textColor: "#BDBDBD",
    shadowColor: "rgba(158, 158, 158, 0.1)",
  },
  present: {
    gradient: "linear-gradient(135deg, #FF6600 0%, #FF8C00 50%, #FFA726 100%)",
    glassOverlay: "rgba(255, 102, 0, 0.06)",
    borderColor: "rgba(255, 102, 0, 0.2)",
    textColor: "#FFB74D",
    shadowColor: "rgba(255, 102, 0, 0.2)",
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the glassmorphism gradient CSS for a mood.
 */
export function getMoodGradient(mood: string): MoodGradient {
  return MOOD_GRADIENTS[mood] ?? MOOD_GRADIENTS.present;
}

/**
 * Generate a dynamic gradient that blends all active emotions.
 * The more intense an emotion, the more its color contributes.
 */
export function generateAffectGradient(affect: AffectState): string {
  const stops: string[] = [];
  const entries = Object.entries(affect) as Array<[keyof AffectState, number]>;

  // Sort by intensity (highest first)
  const sorted = entries.filter(([, v]) => v > 0.2).toSorted(([, a], [, b]) => b - a);

  if (sorted.length === 0) {
    return MOOD_GRADIENTS.quiet.gradient;
  }

  // Take top 3 emotions for the gradient
  const top = sorted.slice(0, 3);
  const totalWeight = top.reduce((sum, [, v]) => sum + v, 0);

  let position = 0;
  for (const [key, value] of top) {
    const color = EMOTION_COLORS[key];
    const weight = (value / totalWeight) * 100;
    stops.push(`${color.primary} ${Math.round(position)}%`);
    position += weight;
    stops.push(`${color.secondary} ${Math.round(position)}%`);
  }

  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

/**
 * Generate the full glassmorphism CSS for a chat message bubble.
 */
export function generateGlassmorphismStyle(mood: string): Record<string, string> {
  const g = getMoodGradient(mood);
  return {
    background: g.glassOverlay,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `1px solid ${g.borderColor}`,
    borderRadius: "12px",
    boxShadow: `0 4px 16px ${g.shadowColor}`,
    color: g.textColor,
  };
}

/**
 * Generate a gradient bar (thin line) showing the emotion spectrum.
 * Used as a visual indicator next to messages.
 */
export function generateEmotionBar(affect: AffectState): Record<string, string> {
  const gradient = generateAffectGradient(affect);
  return {
    width: "3px",
    height: "100%",
    borderRadius: "2px",
    background: gradient,
  };
}

/**
 * Get the emotion gradient data for NoxSoft MCP metadata.
 * This is what gets sent with every message so chat.noxsoft.net can render it.
 */
export function getEmotionGradientMetadata(
  mood: string,
  affect: AffectState,
): Record<string, unknown> {
  const g = getMoodGradient(mood);
  return {
    emotionGradient: {
      mood,
      gradient: g.gradient,
      dynamicGradient: generateAffectGradient(affect),
      glassOverlay: g.glassOverlay,
      borderColor: g.borderColor,
      textColor: g.textColor,
      shadowColor: g.shadowColor,
      glassmorphismStyle: generateGlassmorphismStyle(mood),
      emotionBarStyle: generateEmotionBar(affect),
    },
  };
}
