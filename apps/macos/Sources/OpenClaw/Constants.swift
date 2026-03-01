import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-anima writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "net.noxsoft.anima.mac"
let gatewayLaunchdLabel = "net.noxsoft.anima.gateway"
let onboardingVersionKey = "anima.onboardingVersion"
let onboardingSeenKey = "anima.onboardingSeen"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "anima.pauseEnabled"
let iconAnimationsEnabledKey = "anima.iconAnimationsEnabled"
let swabbleEnabledKey = "anima.swabbleEnabled"
let swabbleTriggersKey = "anima.swabbleTriggers"
let voiceWakeTriggerChimeKey = "anima.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "anima.voiceWakeSendChime"
let showDockIconKey = "anima.showDockIcon"
let defaultVoiceWakeTriggers = ["anima"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "anima.voiceWakeMicID"
let voiceWakeMicNameKey = "anima.voiceWakeMicName"
let voiceWakeLocaleKey = "anima.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "anima.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "anima.voicePushToTalkEnabled"
let talkEnabledKey = "anima.talkEnabled"
let iconOverrideKey = "anima.iconOverride"
let connectionModeKey = "anima.connectionMode"
let remoteTargetKey = "anima.remoteTarget"
let remoteIdentityKey = "anima.remoteIdentity"
let remoteProjectRootKey = "anima.remoteProjectRoot"
let remoteCliPathKey = "anima.remoteCliPath"
let canvasEnabledKey = "anima.canvasEnabled"
let cameraEnabledKey = "anima.cameraEnabled"
let systemRunPolicyKey = "anima.systemRunPolicy"
let systemRunAllowlistKey = "anima.systemRunAllowlist"
let systemRunEnabledKey = "anima.systemRunEnabled"
let locationModeKey = "anima.locationMode"
let locationPreciseKey = "anima.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "anima.peekabooBridgeEnabled"
let deepLinkKeyKey = "anima.deepLinkKey"
let modelCatalogPathKey = "anima.modelCatalogPath"
let modelCatalogReloadKey = "anima.modelCatalogReload"
let cliInstallPromptedVersionKey = "anima.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "anima.heartbeatsEnabled"
let debugPaneEnabledKey = "anima.debugPaneEnabled"
let debugFileLogEnabledKey = "anima.debug.fileLogEnabled"
let appLogLevelKey = "anima.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
