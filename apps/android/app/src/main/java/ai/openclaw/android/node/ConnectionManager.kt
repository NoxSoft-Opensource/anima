package net.noxsoft.anima.android.node

import android.os.Build
import net.noxsoft.anima.android.BuildConfig
import net.noxsoft.anima.android.SecurePrefs
import net.noxsoft.anima.android.gateway.GatewayClientInfo
import net.noxsoft.anima.android.gateway.GatewayConnectOptions
import net.noxsoft.anima.android.gateway.GatewayEndpoint
import net.noxsoft.anima.android.gateway.GatewayTlsParams
import net.noxsoft.anima.android.protocol.AnimaCanvasA2UICommand
import net.noxsoft.anima.android.protocol.AnimaCanvasCommand
import net.noxsoft.anima.android.protocol.AnimaCameraCommand
import net.noxsoft.anima.android.protocol.AnimaLocationCommand
import net.noxsoft.anima.android.protocol.AnimaScreenCommand
import net.noxsoft.anima.android.protocol.AnimaSmsCommand
import net.noxsoft.anima.android.protocol.AnimaCapability
import net.noxsoft.anima.android.LocationMode
import net.noxsoft.anima.android.VoiceWakeMode

class ConnectionManager(
  private val prefs: SecurePrefs,
  private val cameraEnabled: () -> Boolean,
  private val locationMode: () -> LocationMode,
  private val voiceWakeMode: () -> VoiceWakeMode,
  private val smsAvailable: () -> Boolean,
  private val hasRecordAudioPermission: () -> Boolean,
  private val manualTls: () -> Boolean,
) {
  companion object {
    internal fun resolveTlsParamsForEndpoint(
      endpoint: GatewayEndpoint,
      storedFingerprint: String?,
      manualTlsEnabled: Boolean,
    ): GatewayTlsParams? {
      val stableId = endpoint.stableId
      val stored = storedFingerprint?.trim().takeIf { !it.isNullOrEmpty() }
      val isManual = stableId.startsWith("manual|")

      if (isManual) {
        if (!manualTlsEnabled) return null
        if (!stored.isNullOrBlank()) {
          return GatewayTlsParams(
            required = true,
            expectedFingerprint = stored,
            allowTOFU = false,
            stableId = stableId,
          )
        }
        return GatewayTlsParams(
          required = true,
          expectedFingerprint = null,
          allowTOFU = false,
          stableId = stableId,
        )
      }

      // Prefer stored pins. Never let discovery-provided TXT override a stored fingerprint.
      if (!stored.isNullOrBlank()) {
        return GatewayTlsParams(
          required = true,
          expectedFingerprint = stored,
          allowTOFU = false,
          stableId = stableId,
        )
      }

      val hinted = endpoint.tlsEnabled || !endpoint.tlsFingerprintSha256.isNullOrBlank()
      if (hinted) {
        // TXT is unauthenticated. Do not treat the advertised fingerprint as authoritative.
        return GatewayTlsParams(
          required = true,
          expectedFingerprint = null,
          allowTOFU = false,
          stableId = stableId,
        )
      }

      return null
    }
  }

  fun buildInvokeCommands(): List<String> =
    buildList {
      add(AnimaCanvasCommand.Present.rawValue)
      add(AnimaCanvasCommand.Hide.rawValue)
      add(AnimaCanvasCommand.Navigate.rawValue)
      add(AnimaCanvasCommand.Eval.rawValue)
      add(AnimaCanvasCommand.Snapshot.rawValue)
      add(AnimaCanvasA2UICommand.Push.rawValue)
      add(AnimaCanvasA2UICommand.PushJSONL.rawValue)
      add(AnimaCanvasA2UICommand.Reset.rawValue)
      add(AnimaScreenCommand.Record.rawValue)
      if (cameraEnabled()) {
        add(AnimaCameraCommand.Snap.rawValue)
        add(AnimaCameraCommand.Clip.rawValue)
      }
      if (locationMode() != LocationMode.Off) {
        add(AnimaLocationCommand.Get.rawValue)
      }
      if (smsAvailable()) {
        add(AnimaSmsCommand.Send.rawValue)
      }
      if (BuildConfig.DEBUG) {
        add("debug.logs")
        add("debug.ed25519")
      }
      add("app.update")
    }

  fun buildCapabilities(): List<String> =
    buildList {
      add(AnimaCapability.Canvas.rawValue)
      add(AnimaCapability.Screen.rawValue)
      if (cameraEnabled()) add(AnimaCapability.Camera.rawValue)
      if (smsAvailable()) add(AnimaCapability.Sms.rawValue)
      if (voiceWakeMode() != VoiceWakeMode.Off && hasRecordAudioPermission()) {
        add(AnimaCapability.VoiceWake.rawValue)
      }
      if (locationMode() != LocationMode.Off) {
        add(AnimaCapability.Location.rawValue)
      }
    }

  fun resolvedVersionName(): String {
    val versionName = BuildConfig.VERSION_NAME.trim().ifEmpty { "dev" }
    return if (BuildConfig.DEBUG && !versionName.contains("dev", ignoreCase = true)) {
      "$versionName-dev"
    } else {
      versionName
    }
  }

  fun resolveModelIdentifier(): String? {
    return listOfNotNull(Build.MANUFACTURER, Build.MODEL)
      .joinToString(" ")
      .trim()
      .ifEmpty { null }
  }

  fun buildUserAgent(): String {
    val version = resolvedVersionName()
    val release = Build.VERSION.RELEASE?.trim().orEmpty()
    val releaseLabel = if (release.isEmpty()) "unknown" else release
    return "AnimaAndroid/$version (Android $releaseLabel; SDK ${Build.VERSION.SDK_INT})"
  }

  fun buildClientInfo(clientId: String, clientMode: String): GatewayClientInfo {
    return GatewayClientInfo(
      id = clientId,
      displayName = prefs.displayName.value,
      version = resolvedVersionName(),
      platform = "android",
      mode = clientMode,
      instanceId = prefs.instanceId.value,
      deviceFamily = "Android",
      modelIdentifier = resolveModelIdentifier(),
    )
  }

  fun buildNodeConnectOptions(): GatewayConnectOptions {
    return GatewayConnectOptions(
      role = "node",
      scopes = emptyList(),
      caps = buildCapabilities(),
      commands = buildInvokeCommands(),
      permissions = emptyMap(),
      client = buildClientInfo(clientId = "anima-android", clientMode = "node"),
      userAgent = buildUserAgent(),
    )
  }

  fun buildOperatorConnectOptions(): GatewayConnectOptions {
    return GatewayConnectOptions(
      role = "operator",
      scopes = listOf("operator.read", "operator.write", "operator.talk.secrets"),
      caps = emptyList(),
      commands = emptyList(),
      permissions = emptyMap(),
      client = buildClientInfo(clientId = "anima-control-ui", clientMode = "ui"),
      userAgent = buildUserAgent(),
    )
  }

  fun resolveTlsParams(endpoint: GatewayEndpoint): GatewayTlsParams? {
    val stored = prefs.loadGatewayTlsFingerprint(endpoint.stableId)
    return resolveTlsParamsForEndpoint(endpoint, storedFingerprint = stored, manualTlsEnabled = manualTls())
  }
}
