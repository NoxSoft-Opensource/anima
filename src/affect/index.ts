/**
 * ANIMA Affect System — emotional state display, journaling, and patterns
 */

export {
  type AffectState,
  type AffectDisplay,
  type AffectMetadata,
  formatAffect,
  affectChatPrefix,
  affectChatMetadata,
  moodIndicator,
} from "./display.js";

export {
  type AffectEntry,
  type AffectPattern,
  logAffect,
  getTodayEntries,
  getEntriesForDate,
  getRecentEntries,
  analyzePatterns,
} from "./journal.js";
