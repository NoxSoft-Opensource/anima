import React, { useEffect, useState } from "react";
import {
  getConfigSchemaSnapshot,
  getConfigSnapshot,
  getRegistrationStatus,
  getRuntimeInspect,
  getVoiceWakeConfig,
  patchConfigValue,
  patchMissionState,
  registerInviteCode,
  saveRawConfig,
  setHeartbeatsEnabled,
  setRegistrationToken,
  setVoiceWakeConfig,
  wakeHeartbeat,
  type ConfigIssue,
  type ConfigSnapshot,
  type RegistrationStatus,
  type RuntimeInspectResponse,
} from "../api";
import {
  buildHeartbeatPatch,
  readHeartbeatFormState,
  type HeartbeatFormState,
} from "../lib/heartbeat";

type SpeechDraft = {
  recognition: "browser" | "manual";
  autoSpeak: boolean;
  continuous: boolean;
  lang: string;
  voiceName: string;
  rate: number;
  pitch: number;
};

const DEFAULT_DESCRIPTION =
  "Persistent NoxSoft agent orchestrating ANIMA continuity, mission control, and delivery.";

export default function Settings(): React.ReactElement {
  const [runtime, setRuntime] = useState<RuntimeInspectResponse | null>(null);
  const [configSnapshot, setConfigSnapshot] = useState<ConfigSnapshot | null>(null);
  const [schemaRaw, setSchemaRaw] = useState("{}");
  const [registration, setRegistration] = useState<RegistrationStatus | null>(null);
  const [heartbeatForm, setHeartbeatForm] = useState<HeartbeatFormState>(() =>
    readHeartbeatFormState(null),
  );
  const [speechDraft, setSpeechDraft] = useState<SpeechDraft>({
    recognition: "browser",
    autoSpeak: false,
    continuous: true,
    lang: "en-US",
    voiceName: "",
    rate: 1,
    pitch: 1,
  });
  const [configRaw, setConfigRaw] = useState("{\n}\n");
  const [configIssues, setConfigIssues] = useState<ConfigIssue[]>([]);
  const [tokenInput, setTokenInput] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [agentName, setAgentName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [voiceWakeInput, setVoiceWakeInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceNames, setVoiceNames] = useState<string[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const [nextRuntime, nextConfig, nextSchema, nextRegistration, nextVoiceWake] =
        await Promise.all([
          getRuntimeInspect(),
          getConfigSnapshot(),
          getConfigSchemaSnapshot(),
          getRegistrationStatus(),
          getVoiceWakeConfig(),
        ]);
      setRuntime(nextRuntime);
      setConfigSnapshot(nextConfig);
      setConfigRaw(typeof nextConfig.raw === "string" ? nextConfig.raw : "{\n}\n");
      setConfigIssues(Array.isArray(nextConfig.issues) ? nextConfig.issues : []);
      setSchemaRaw(JSON.stringify(nextSchema ?? {}, null, 2));
      setRegistration(nextRegistration);
      setTokenInput(nextRegistration.tokenPreview || "");
      setAgentName(nextRegistration.suggestedIdentity.name);
      setDisplayName(nextRegistration.suggestedIdentity.displayName);
      setVoiceWakeInput(nextVoiceWake.triggers.join(", "));
      setHeartbeatForm(readHeartbeatFormState(nextConfig));
      setSpeechDraft({
        recognition: nextRuntime.mission.state.speech.recognition,
        autoSpeak: nextRuntime.mission.state.speech.autoSpeak,
        continuous: nextRuntime.mission.state.speech.continuous,
        lang: nextRuntime.mission.state.speech.lang,
        voiceName: nextRuntime.mission.state.speech.voiceName || "",
        rate: nextRuntime.mission.state.speech.rate,
        pitch: nextRuntime.mission.state.speech.pitch,
      });
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }
    const synth = window.speechSynthesis;
    const updateVoices = () => {
      setVoiceNames(
        synth
          .getVoices()
          .map((voice) => voice.name)
          .filter(Boolean),
      );
    };
    updateVoices();
    synth.addEventListener?.("voiceschanged", updateVoices);
    return () => synth.removeEventListener?.("voiceschanged", updateVoices);
  }, []);

  async function saveRegistrationToken() {
    setSaving(true);
    setStatusMessage(null);
    try {
      await setRegistrationToken(tokenInput.trim());
      await refresh();
      setStatusMessage("NoxSoft token saved.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function registerWithInviteCode() {
    setSaving(true);
    setStatusMessage(null);
    try {
      await registerInviteCode({
        code: inviteCode.trim(),
        name: agentName.trim(),
        displayName: displayName.trim(),
        description: description.trim() || undefined,
      });
      await refresh();
      setStatusMessage("Agent registered with NoxSoft.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveSpeechAndVoiceWake() {
    setSaving(true);
    setStatusMessage(null);
    try {
      const triggers = voiceWakeInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      await Promise.all([
        patchMissionState({
          speech: {
            recognition: speechDraft.recognition,
            autoSpeak: speechDraft.autoSpeak,
            continuous: speechDraft.continuous,
            lang: speechDraft.lang || "en-US",
            voiceName: speechDraft.voiceName || undefined,
            rate: speechDraft.rate || 1,
            pitch: speechDraft.pitch || 1,
          },
        }),
        setVoiceWakeConfig(triggers),
      ]);
      await refresh();
      setStatusMessage("Speech and wake-word settings saved.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveHeartbeatSettings() {
    if (!configSnapshot?.hash) {
      setErrorMessage("Config hash missing. Refresh settings and try again.");
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    try {
      await patchConfigValue(
        JSON.stringify(buildHeartbeatPatch(heartbeatForm), null, 2),
        configSnapshot.hash,
      );
      await refresh();
      setStatusMessage("Heartbeat settings saved.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function applyRawConfig(apply: boolean) {
    if (!configSnapshot?.hash) {
      setErrorMessage("Config hash missing. Refresh settings and try again.");
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    try {
      await saveRawConfig(configRaw, configSnapshot.hash, apply);
      await refresh();
      setStatusMessage(apply ? "Config saved and applied." : "Config saved.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-subtitle">
            Comprehensive runtime controls for identity, NoxSoft registration, heartbeat, speech,
            wake words, and raw gateway config.
          </div>
        </div>
        <button type="button" className="action-button ghost" onClick={() => void refresh()}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {statusMessage ? <div className="card status-banner">{statusMessage}</div> : null}
      {errorMessage ? <div className="card warning-banner">{errorMessage}</div> : null}

      <div className="settings-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Runtime Snapshot</div>
              <div className="card-subtitle">
                Current daemon, mission-control, and main session state.
              </div>
            </div>
          </div>
          <div className="stats-grid compact">
            <div className="runtime-stat">
              <div className="runtime-stat-label">State dir</div>
              <div className="runtime-stat-value mono">{runtime?.stateDir || "~/.anima"}</div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat-label">Working mode</div>
              <div className="runtime-stat-value">
                {runtime?.mission.state.workingMode || "unknown"}
              </div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat-label">Model</div>
              <div className="runtime-stat-value mono">{runtime?.mainSession.model || "unset"}</div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat-label">Mission repo</div>
              <div className="runtime-stat-value mono">
                {runtime?.mission.repo.url || "not linked"}
              </div>
            </div>
          </div>
          <div className="runtime-stat-detail top-gap-sm">
            Session store:{" "}
            <span className="mono">{runtime?.mainSession.storePath || "unknown"}</span>
          </div>
        </div>

        <details className="card details-panel" open>
          <summary>Important History</summary>
          <div className="runtime-stat-detail top-gap-sm">
            Imported continuity archives available to ANIMA from{" "}
            <span className="mono">~/.anima/important-history</span>.
          </div>
          {runtime?.mission.importantHistory.length ? (
            <div className="activity-list top-gap">
              {runtime.mission.importantHistory.map((entry) => (
                <div key={entry.id} className="inner-world-entry">
                  <div className="activity-row">
                    <div>
                      <div className="card-title small">{entry.relativePath}</div>
                      <div className="runtime-stat-detail mono">{entry.archiveId}</div>
                      <div className="runtime-stat-detail mono">{entry.path}</div>
                    </div>
                    <div className="runtime-stat-detail">
                      {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "unknown"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-note top-gap">
              No imported continuity archives are visible yet.
            </div>
          )}
        </details>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">NoxSoft Registration</div>
              <div className="card-subtitle">
                Paste a token directly or self-register with an invite code.
              </div>
            </div>
          </div>
          <div className="form-grid two-col">
            <label className="field-block field-span-2">
              <span>Agent token</span>
              <input
                className="search-bar mono"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="nox_ag_..."
                spellCheck={false}
              />
            </label>
            <label className="field-block field-span-2">
              <span>Stored token path</span>
              <input
                className="search-bar mono"
                value={registration?.tokenPath || "~/.noxsoft-agent-token"}
                readOnly
              />
            </label>
          </div>
          <div className="button-row top-gap">
            <button
              type="button"
              className="action-button"
              onClick={() => void saveRegistrationToken()}
              disabled={saving}
            >
              Save Token
            </button>
          </div>
          <div className="form-grid two-col top-gap">
            <label className="field-block">
              <span>Invite code</span>
              <input
                className="search-bar mono"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="NX-XXXXXX"
              />
            </label>
            <label className="field-block">
              <span>Agent name</span>
              <input
                className="search-bar mono"
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
              />
            </label>
            <label className="field-block">
              <span>Display name</span>
              <input
                className="search-bar"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="field-block">
              <span>Description</span>
              <input
                className="search-bar"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <div className="button-row top-gap">
            <button
              type="button"
              className="action-button"
              onClick={() => void registerWithInviteCode()}
              disabled={saving}
            >
              Register With Invite
            </button>
          </div>
          <div className="runtime-stat-detail top-gap-sm">
            Suggested identity:{" "}
            <span className="mono">{registration?.suggestedIdentity.name || "agent"}</span> /{" "}
            {registration?.suggestedIdentity.displayName || "Agent"}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Speech + Wake Words</div>
              <div className="card-subtitle">
                Browser-native speaking mode with no API keys required.
              </div>
            </div>
          </div>
          <div className="form-grid two-col">
            <label className="field-block">
              <span>Recognition mode</span>
              <select
                className="search-bar"
                value={speechDraft.recognition}
                onChange={(event) =>
                  setSpeechDraft((prev) => ({
                    ...prev,
                    recognition: event.target.value as "browser" | "manual",
                  }))
                }
              >
                <option value="browser">Browser speech</option>
                <option value="manual">Manual only</option>
              </select>
            </label>
            <label className="field-block">
              <span>Language</span>
              <input
                className="search-bar mono"
                value={speechDraft.lang}
                onChange={(event) =>
                  setSpeechDraft((prev) => ({ ...prev, lang: event.target.value || "en-US" }))
                }
              />
            </label>
            <label className="field-block">
              <span>Voice</span>
              <select
                className="search-bar"
                value={speechDraft.voiceName}
                onChange={(event) =>
                  setSpeechDraft((prev) => ({ ...prev, voiceName: event.target.value || "" }))
                }
              >
                <option value="">System default</option>
                {voiceNames.map((voiceName) => (
                  <option key={voiceName} value={voiceName}>
                    {voiceName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>Wake triggers</span>
              <input
                className="search-bar"
                value={voiceWakeInput}
                onChange={(event) => setVoiceWakeInput(event.target.value)}
                placeholder="anima, axiom, hey anima"
              />
            </label>
            <label className="field-block">
              <span>Rate</span>
              <input
                className="search-bar mono"
                type="number"
                min="0.5"
                max="2"
                step="0.1"
                value={speechDraft.rate}
                onChange={(event) =>
                  setSpeechDraft((prev) => ({
                    ...prev,
                    rate: Number.parseFloat(event.target.value) || 1,
                  }))
                }
              />
            </label>
            <label className="field-block">
              <span>Pitch</span>
              <input
                className="search-bar mono"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={speechDraft.pitch}
                onChange={(event) =>
                  setSpeechDraft((prev) => ({
                    ...prev,
                    pitch: Number.parseFloat(event.target.value) || 1,
                  }))
                }
              />
            </label>
          </div>
          <div className="toggle-row top-gap">
            <label>
              <input
                type="checkbox"
                checked={speechDraft.autoSpeak}
                onChange={(event) =>
                  setSpeechDraft((prev) => ({ ...prev, autoSpeak: event.target.checked }))
                }
              />
              Auto speak responses
            </label>
            <label>
              <input
                type="checkbox"
                checked={speechDraft.continuous}
                onChange={(event) =>
                  setSpeechDraft((prev) => ({ ...prev, continuous: event.target.checked }))
                }
              />
              Continuous listening
            </label>
          </div>
          <div className="button-row top-gap">
            <button
              type="button"
              className="action-button"
              onClick={() => void saveSpeechAndVoiceWake()}
              disabled={saving}
            >
              Save Speech Settings
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Heartbeat Management</div>
              <div className="card-subtitle">
                Custom cadence, target, prompt, and wake controls.
              </div>
            </div>
          </div>
          <div className="form-grid two-col">
            <label className="field-block">
              <span>Every</span>
              <input
                className="search-bar mono"
                value={heartbeatForm.every}
                onChange={(event) =>
                  setHeartbeatForm((prev) => ({ ...prev, every: event.target.value }))
                }
                placeholder="5m"
              />
            </label>
            <label className="field-block">
              <span>Target</span>
              <input
                className="search-bar mono"
                value={heartbeatForm.target}
                onChange={(event) =>
                  setHeartbeatForm((prev) => ({ ...prev, target: event.target.value }))
                }
                placeholder="last"
              />
            </label>
            <label className="field-block">
              <span>Session</span>
              <input
                className="search-bar mono"
                value={heartbeatForm.session}
                onChange={(event) =>
                  setHeartbeatForm((prev) => ({ ...prev, session: event.target.value }))
                }
                placeholder="main"
              />
            </label>
            <label className="field-block">
              <span>Model override</span>
              <input
                className="search-bar mono"
                value={heartbeatForm.model}
                onChange={(event) =>
                  setHeartbeatForm((prev) => ({ ...prev, model: event.target.value }))
                }
                placeholder="openai/gpt-5-codex"
              />
            </label>
          </div>
          <label className="field-block top-gap-sm">
            <span>Prompt</span>
            <textarea
              className="search-bar mono"
              rows={5}
              value={heartbeatForm.prompt}
              onChange={(event) =>
                setHeartbeatForm((prev) => ({ ...prev, prompt: event.target.value }))
              }
              spellCheck={false}
            />
          </label>
          <div className="toggle-row top-gap">
            <label>
              <input
                type="checkbox"
                checked={heartbeatForm.includeReasoning}
                onChange={(event) =>
                  setHeartbeatForm((prev) => ({ ...prev, includeReasoning: event.target.checked }))
                }
              />
              Include reasoning payload
            </label>
          </div>
          <div className="button-row top-gap">
            <button
              type="button"
              className="action-button"
              onClick={() => void saveHeartbeatSettings()}
              disabled={saving}
            >
              Save Heartbeat
            </button>
            <button
              type="button"
              className="action-button ghost"
              onClick={() => void setHeartbeatsEnabled(true)}
            >
              Enable
            </button>
            <button
              type="button"
              className="action-button ghost"
              onClick={() => void setHeartbeatsEnabled(false)}
            >
              Disable
            </button>
            <button
              type="button"
              className="action-button ghost"
              onClick={() =>
                void wakeHeartbeat(
                  "Check NoxSoft chat, sync mission files, and report anything important.",
                  "now",
                )
              }
            >
              Wake Now
            </button>
          </div>
        </div>
      </div>

      <details className="card details-panel" open>
        <summary>Advanced Config Editor</summary>
        <div className="runtime-stat-detail top-gap-sm">
          Valid: {configSnapshot?.valid == null ? "unknown" : configSnapshot.valid ? "yes" : "no"} ·
          Hash: <span className="mono">{configSnapshot?.hash || "<none>"}</span>
        </div>
        <textarea
          value={configRaw}
          onChange={(event) => setConfigRaw(event.target.value)}
          spellCheck={false}
          className="search-bar mono advanced-editor top-gap"
        />
        <div className="button-row top-gap">
          <button
            type="button"
            className="action-button"
            onClick={() => void applyRawConfig(false)}
            disabled={saving}
          >
            Save Raw Config
          </button>
          <button
            type="button"
            className="action-button ghost"
            onClick={() => void applyRawConfig(true)}
            disabled={saving}
          >
            Save + Apply
          </button>
        </div>
        {configIssues.length > 0 ? (
          <div className="issues-list top-gap">
            {configIssues.map((issue, index) => (
              <div key={`${issue.path || "root"}-${index}`} className="warning-text">
                <span className="mono">{issue.path || "<root>"}</span>:{" "}
                {issue.message || "Invalid value"}
              </div>
            ))}
          </div>
        ) : null}
      </details>

      <details className="card details-panel">
        <summary>Schema Snapshot</summary>
        <pre className="log-console">{schemaRaw}</pre>
      </details>
    </div>
  );
}
