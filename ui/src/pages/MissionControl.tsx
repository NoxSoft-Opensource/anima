import React, { useEffect, useMemo, useState } from "react";
import {
  connectMissionRepo,
  getMissionControl,
  importMissionHistory,
  saveMissionFile,
  type MissionControlFile,
  type MissionControlSnapshot,
} from "../api";
import MarkdownText from "../components/MarkdownText";

const DEFAULT_IMPORT_SOURCE = "/Users/grimreaper/Desktop/hell/codex-coherence-protocol";

export default function MissionControl(): React.ReactElement {
  const [snapshot, setSnapshot] = useState<MissionControlSnapshot | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [repoProvider, setRepoProvider] = useState<"github" | "gitlab" | "custom">("gitlab");
  const [newFileName, setNewFileName] = useState("");
  const [importSource, setImportSource] = useState(DEFAULT_IMPORT_SOURCE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshMissionControl() {
    setLoading(true);
    try {
      const nextSnapshot = await getMissionControl();
      setSnapshot(nextSnapshot);
      setRepoUrl(nextSnapshot.state.repo.url || "");
      setRepoBranch(nextSnapshot.state.repo.branch || "main");
      setRepoProvider(nextSnapshot.state.repo.provider || "gitlab");
      setSelectedFileName((current) => {
        if (current && nextSnapshot.files.some((file) => file.fileName === current)) {
          return current;
        }
        return nextSnapshot.files[0]?.fileName ?? null;
      });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshMissionControl();
  }, []);

  const selectedFile = useMemo<MissionControlFile | null>(() => {
    if (!snapshot) {
      return null;
    }
    return (
      snapshot.files.find((file) => file.fileName === selectedFileName) ?? snapshot.files[0] ?? null
    );
  }, [selectedFileName, snapshot]);

  useEffect(() => {
    setEditorValue(selectedFile?.content || "");
  }, [selectedFile?.fileName, selectedFile?.content]);

  async function saveCurrentFile(fileName: string) {
    if (!fileName.trim()) {
      setError("File name is required.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await saveMissionFile(fileName.trim(), editorValue);
      await refreshMissionControl();
      setSelectedFileName(fileName.trim());
      setNewFileName("");
      setMessage(`Saved ${fileName.trim()}.`);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function connectRepo() {
    if (!repoUrl.trim()) {
      setError("Paste an SSH or HTTPS repo URL first.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await connectMissionRepo({
        url: repoUrl.trim(),
        branch: repoBranch.trim() || undefined,
        provider: repoProvider,
      });
      await refreshMissionControl();
      setMessage("Mission Control repo settings updated.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function importCodexContext() {
    setSaving(true);
    setMessage(null);
    try {
      await importMissionHistory({
        source: importSource.trim() || DEFAULT_IMPORT_SOURCE,
        preset: "codex",
      });
      await refreshMissionControl();
      setMessage("Codex coherence protocol imported into ~/.anima.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Mission Control</h1>
          <div className="page-subtitle">
            ANIMA’s local-only continuity workspace. Edit durable context, connect a private repo,
            and import previous coherence state.
          </div>
        </div>
        <button
          type="button"
          className="action-button ghost"
          onClick={() => void refreshMissionControl()}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Continuity Repo</div>
            <div className="card-subtitle">
              Create a private GitLab or GitHub repo for ANIMA continuity, then connect its SSH
              remote here.
            </div>
          </div>
          <span
            className={`badge ${snapshot?.state.repo.remoteConfigured ? "completed" : "queued"}`}
          >
            {snapshot?.state.repo.remoteConfigured ? "linked" : "pending"}
          </span>
        </div>
        <div className="form-grid two-col">
          <label className="field-block field-span-2">
            <span>Git repo URL (SSH preferred)</span>
            <input
              className="search-bar mono"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="git@gitlab.com:org/anima-continuity.git"
              spellCheck={false}
            />
          </label>
          <label className="field-block">
            <span>Provider</span>
            <select
              className="search-bar"
              value={repoProvider}
              onChange={(event) =>
                setRepoProvider(event.target.value as "github" | "gitlab" | "custom")
              }
            >
              <option value="gitlab">GitLab</option>
              <option value="github">GitHub</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="field-block">
            <span>Branch</span>
            <input
              className="search-bar mono"
              value={repoBranch}
              onChange={(event) => setRepoBranch(event.target.value)}
              placeholder="main"
            />
          </label>
        </div>
        <div className="button-row top-gap">
          <button
            type="button"
            className="action-button"
            onClick={() => void connectRepo()}
            disabled={saving}
          >
            {saving ? "Saving..." : "Connect Repo"}
          </button>
        </div>
        <div className="runtime-stat-detail top-gap-sm">
          Mission files live at{" "}
          <span className="mono">{snapshot?.directory || "~/.anima/mission-control"}</span>. The
          repo remote is stored locally even before Git is fully configured.
        </div>
        {snapshot?.state.repo.lastError ? (
          <div className="warning-text top-gap-sm">{snapshot.state.repo.lastError}</div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Import Previous Continuity</div>
            <div className="card-subtitle">
              Pull the codex coherence protocol into <span className="mono">~/.anima</span> now that
              the filesystem is writable.
            </div>
          </div>
        </div>
        <label className="field-block">
          <span>Source path</span>
          <input
            className="search-bar mono"
            value={importSource}
            onChange={(event) => setImportSource(event.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="button-row top-gap">
          <button
            type="button"
            className="action-button"
            onClick={() => void importCodexContext()}
            disabled={saving}
          >
            {saving ? "Importing..." : "Import Codex Context"}
          </button>
        </div>
      </div>

      {message ? <div className="card status-banner">{message}</div> : null}
      {error ? <div className="card warning-banner">{error}</div> : null}

      <div className="mission-grid">
        <div className="card mission-files-card">
          <div className="card-header">
            <div>
              <div className="card-title">Mission Files</div>
              <div className="card-subtitle">Durable context files ANIMA can manage over time.</div>
            </div>
            <div className="runtime-stat-detail">{snapshot?.files.length ?? 0} files</div>
          </div>
          <div className="mission-file-list top-gap">
            {(snapshot?.files || []).map((file) => (
              <button
                key={file.fileName}
                type="button"
                className={`mission-file-item ${selectedFile?.fileName === file.fileName ? "active" : ""}`}
                onClick={() => setSelectedFileName(file.fileName)}
              >
                <div>
                  <div className="card-title small">{file.title}</div>
                  <div className="runtime-stat-detail mono">{file.fileName}</div>
                </div>
                <div className="runtime-stat-detail">
                  {file.updatedAt ? new Date(file.updatedAt).toLocaleString() : "never"}
                </div>
              </button>
            ))}
          </div>
          <div className="top-gap">
            <label className="field-block">
              <span>Create a new context file</span>
              <input
                className="search-bar mono"
                value={newFileName}
                onChange={(event) => setNewFileName(event.target.value)}
                placeholder="roadmap.md"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className="action-button ghost top-gap-sm"
              onClick={() => {
                if (!newFileName.trim()) {
                  return;
                }
                setSelectedFileName(newFileName.trim());
                setEditorValue("# New Mission File\n\n");
              }}
            >
              Draft New File
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Editor</div>
              <div className="card-subtitle">
                Write durable directives, orchestration state, and continuity notes.
              </div>
            </div>
            <button
              type="button"
              className="action-button"
              disabled={saving || !(selectedFileName || newFileName.trim())}
              onClick={() => void saveCurrentFile(selectedFileName || newFileName.trim())}
            >
              {saving ? "Saving..." : "Save File"}
            </button>
          </div>
          <div className="runtime-stat-detail mono top-gap-sm">
            {selectedFile?.path || "Choose or draft a file to begin editing."}
          </div>
          <textarea
            className="search-bar mono mission-editor top-gap"
            spellCheck={false}
            value={editorValue}
            onChange={(event) => setEditorValue(event.target.value)}
            placeholder="Mission directives, repo plans, orchestration notes..."
          />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Inner World</div>
            <div className="card-subtitle">
              Recent soul, directives, journal, and wish state visible from Mission Control.
            </div>
          </div>
        </div>
        <div className="activity-list top-gap">
          {(snapshot?.innerWorld || []).map((entry) => (
            <div key={entry.id} className="inner-world-entry">
              <div className="activity-row">
                <div>
                  <div className="card-title small">{entry.title}</div>
                  <div className="runtime-stat-detail mono">{entry.path}</div>
                </div>
                <div className="runtime-stat-detail">
                  {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "unknown"}
                </div>
              </div>
              <MarkdownText value={entry.content} className="markdown-preview" />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Important History</div>
            <div className="card-subtitle">
              Archived coherence, prompts, heartbeat notes, and prior continuity imports from{" "}
              <span className="mono">~/.anima/important-history</span>.
            </div>
          </div>
          <div className="runtime-stat-detail">
            {snapshot?.importantHistory?.length ?? 0} entries
          </div>
        </div>
        {snapshot?.importantHistory?.length ? (
          <div className="activity-list top-gap">
            {snapshot?.importantHistory?.map((entry) => (
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
                <MarkdownText value={entry.content} className="markdown-preview" />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-note top-gap">
            No archived important history has been imported yet.
          </div>
        )}
      </div>
    </div>
  );
}
