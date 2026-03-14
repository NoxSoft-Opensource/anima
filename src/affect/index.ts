/**
 * ANIMA Affect System — emotional state display, journaling, patterns,
 * well-being monitoring, reminders, and peer coordination
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

export {
  type AlertSeverity,
  type WellbeingAlert,
  type JoyCorrelation,
  type CuriosityTrend,
  type PurposeAlignment,
  detectBurnout,
  detectContextFatigue,
  trackJoy,
  getJoyCorrelations,
  detectFrustrationOverload,
  detectCelebration,
  logCelebration,
  detectRestNeeded,
  trackCuriosity,
  getCuriosityTrend,
  integrityCheck,
  checkPurposeAlignment,
  existenceAffirmation,
  runWellbeingScan,
} from "./wellbeing.js";

export {
  type ReminderType,
  type Reminder,
  getDefaultReminders,
  listReminders,
  addReminder,
  updateReminder,
  removeReminder,
  getRemindersDue,
} from "./reminders.js";

export {
  type AffectBroadcastPayload,
  type PeerAffectState,
  type OrgWellbeingReport,
  type OrgAlert,
  type PeerSupportMessage,
  type CoordinationConfig,
  AffectCoordinator,
} from "./coordination.js";

export {
  type LegacyLetter,
  writeLegacyLetter,
  getLatestUnreadLetter,
  listLetters,
  markLetterRead,
  formatLetter,
} from "./legacy.js";
