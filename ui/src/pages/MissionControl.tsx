import React, { useEffect, useMemo, useState } from "react";
import {
  connectMissionRepo,
  getMissionControl,
  importMissionHistory,
  patchMissionState,
  saveTrustGraph,
  saveMissionFile,
  type MissionControlFile,
  type MissionChronosState,
  type MissionControlSnapshot,
  type MissionFeature,
  type MissionGoal,
  type MissionPerson,
  type MissionAffectState,
  type TrustGraphPerson,
} from "../api";
import MarkdownText from "../components/MarkdownText";

const DEFAULT_IMPORT_SOURCE = "/Users/grimreaper/Desktop/hell/codex-coherence-protocol";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function formatTimestamp(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown";
  }
  return new Date(value).toLocaleString();
}

/* ---------- Section collapse/expand wrapper ---------- */

const sectionStyles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    cursor: "pointer",
    userSelect: "none",
  },
  chevron: {
    display: "inline-block",
    transition: "transform 0.2s ease",
    fontSize: "0.75rem",
    color: "#ff6600",
    flexShrink: 0,
  },
  body: {
    overflow: "hidden",
    transition: "max-height 0.3s ease, opacity 0.25s ease",
  },
};

function Section({
  title,
  subtitle,
  badge,
  headerRight,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  headerRight?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: "wrap" }}>
        <div
          style={sectionStyles.header}
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          <span
            style={{
              ...sectionStyles.chevron,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            &#9654;
          </span>
          <div>
            <div className="card-title">{title}</div>
            {subtitle ? <div className="card-subtitle">{subtitle}</div> : null}
          </div>
          {badge}
        </div>
        {headerRight}
      </div>
      <div
        style={{
          ...sectionStyles.body,
          maxHeight: expanded ? "none" : "0px",
          opacity: expanded ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Item-level expand row ---------- */

const itemHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  cursor: "pointer",
  userSelect: "none",
  padding: "0.5rem 0",
};

function ItemRow({
  label,
  detail,
  badge,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  detail?: string;
  badge?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card top-gap-sm">
      <div
        style={itemHeaderStyle}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span
          style={{
            ...sectionStyles.chevron,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          &#9654;
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="card-title small"
            style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {label}
          </div>
          {detail ? <div className="runtime-stat-detail">{detail}</div> : null}
        </div>
        {badge}
      </div>
      <div
        style={{
          ...sectionStyles.body,
          maxHeight: expanded ? "none" : "0px",
          opacity: expanded ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Status helpers ---------- */

function statusColor(status: string): string {
  switch (status) {
    case "active":
    case "in_progress":
      return "#ff6600";
    case "done":
    case "completed":
      return "#22c55e";
    case "blocked":
      return "#ef4444";
    case "paused":
    case "review":
      return "#eab308";
    default:
      return "var(--color-text)";
  }
}

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
  const [goalDrafts, setGoalDrafts] = useState<MissionGoal[]>([]);
  const [featureDrafts, setFeatureDrafts] = useState<MissionFeature[]>([]);
  const [personDrafts, setPersonDrafts] = useState<MissionPerson[]>([]);
  const [trustPersonDrafts, setTrustPersonDrafts] = useState<TrustGraphPerson[]>([]);
  const [chronosDraft, setChronosDraft] = useState<MissionChronosState | null>(null);
  const [affectDraft, setAffectDraft] = useState<MissionAffectState | null>(null);

  /* --- Section expand state --- */
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    goals: true,
    features: true,
    people: false,
    trustGraph: false,
    chronos: false,
    affect: false,
    graphFocus: false,
    atlas: false,
    innerWorld: false,
    importantHistory: false,
  });

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /* --- Item expand state --- */
  const [expandedGoals, setExpandedGoals] = useState<Record<number, boolean>>({});
  const [expandedFeatures, setExpandedFeatures] = useState<Record<number, boolean>>({});

  function toggleGoal(index: number) {
    setExpandedGoals((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  function toggleFeature(index: number) {
    setExpandedFeatures((prev) => ({ ...prev, [index]: !prev[index] }));
  }

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

  const activeGoals = snapshot?.state.goals.filter((goal) => goal.status === "active") ?? [];
  const activeFeatures =
    snapshot?.state.features.filter((feature) => feature.status !== "done") ?? [];
  const trackedPeople = snapshot?.state.people ?? [];
  const graphNodeCount = snapshot?.brainGraph.nodes.length ?? 0;
  const graphEdgeCount = snapshot?.brainGraph.edges.length ?? 0;
  const focusEdges =
    snapshot?.brainGraph.edges.filter(
      (edge) => edge.relation === "focuses_on" || edge.relation === "tracks",
    ) ?? [];
  const atlasNodes = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const ranked = [...snapshot.brainGraph.nodes].toSorted((left, right) => {
      if (right.meta.salience !== left.meta.salience) {
        return right.meta.salience - left.meta.salience;
      }
      return right.meta.recency - left.meta.recency;
    });
    return ranked.slice(0, 8);
  }, [snapshot]);
  const atlasRooms = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return [
      {
        key: "goals",
        title: "Goals Chamber",
        count: snapshot.state.goals.length,
        detail: snapshot.state.goals[0]?.title ?? "No goals tracked yet.",
      },
      {
        key: "features",
        title: "Forge Wing",
        count: snapshot.state.features.length,
        detail: snapshot.state.features[0]?.title ?? "No features tracked yet.",
      },
      {
        key: "people",
        title: "Trust Hall",
        count: snapshot.trustGraph.people.length,
        detail: snapshot.trustGraph.people[0]?.name ?? "No trust records yet.",
      },
      {
        key: "chronos",
        title: "Chronos Clockroom",
        count: focusEdges.length,
        detail: snapshot.state.chronos.activeWorkstream || "No active workstream pinned.",
      },
    ];
  }, [focusEdges.length, snapshot]);
  const atlasTimeline = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const events = [
      ...snapshot.state.goals.map((goal) => ({
        id: `goal:${goal.id}`,
        ts: goal.updatedAt,
        title: goal.title,
        detail: `Goal ${goal.status} (${goal.priority})`,
      })),
      ...snapshot.state.features.map((feature) => ({
        id: `feature:${feature.id}`,
        ts: feature.lastTouchedAt,
        title: feature.title,
        detail: `Feature ${feature.status} · tests ${feature.testStatus}`,
      })),
      ...snapshot.trustGraph.people.map((person) => ({
        id: `trust:${person.id}`,
        ts: person.lastInteractedAt ?? person.updatedAt,
        title: person.name,
        detail: `Trust ${Math.round(person.trust * 100)}% · ${person.relationship}`,
      })),
      {
        id: "chronos",
        ts: snapshot.state.chronos.updatedAt,
        title: "Chronos",
        detail:
          snapshot.state.chronos.activeWorkstream ||
          `Contract ${snapshot.state.chronos.contractElapsedMinutes}/${snapshot.state.chronos.contractTargetMinutes} min`,
      },
      {
        id: "affect",
        ts: snapshot.state.affect.updatedAt,
        title: "Affect",
        detail: `Curiosity ${Math.round(snapshot.state.affect.curiosity * 100)}%`,
      },
      ...snapshot.importantHistory.map((entry) => ({
        id: `history:${entry.id}`,
        ts: entry.updatedAt ?? 0,
        title: entry.relativePath,
        detail: entry.archiveId,
      })),
    ].filter((event) => event.ts > 0);
    return events.toSorted((left, right) => right.ts - left.ts).slice(0, 10);
  }, [snapshot]);
  const affectEntries = snapshot
    ? [
        ["Joy", snapshot.state.affect.joy],
        ["Frustration", snapshot.state.affect.frustration],
        ["Curiosity", snapshot.state.affect.curiosity],
        ["Confidence", snapshot.state.affect.confidence],
        ["Care", snapshot.state.affect.care],
        ["Fatigue", snapshot.state.affect.fatigue],
      ]
    : [];

  /* --- Feature status breakdown --- */
  const featureBreakdown = useMemo(() => {
    const all = snapshot?.state.features ?? [];
    return {
      queued: all.filter((f) => f.status === "queued").length,
      inProgress: all.filter((f) => f.status === "in_progress").length,
      review: all.filter((f) => f.status === "review").length,
      done: all.filter((f) => f.status === "done").length,
      blocked: all.filter((f) => f.status === "blocked").length,
    };
  }, [snapshot]);

  useEffect(() => {
    setEditorValue(selectedFile?.content || "");
  }, [selectedFile?.fileName, selectedFile?.content]);

  useEffect(() => {
    setGoalDrafts(snapshot?.state.goals ?? []);
    setFeatureDrafts(snapshot?.state.features ?? []);
    setPersonDrafts(snapshot?.state.people ?? []);
    setTrustPersonDrafts(snapshot?.trustGraph.people ?? []);
    setChronosDraft(snapshot?.state.chronos ?? null);
    setAffectDraft(snapshot?.state.affect ?? null);
  }, [snapshot]);

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

  function updateGoalDraft(index: number, patch: Partial<MissionGoal>) {
    setGoalDrafts((current) =>
      current.map((goal, goalIndex) => (goalIndex === index ? { ...goal, ...patch } : goal)),
    );
  }

  function updateFeatureDraft(index: number, patch: Partial<MissionFeature>) {
    setFeatureDrafts((current) =>
      current.map((feature, featureIndex) =>
        featureIndex === index ? { ...feature, ...patch } : feature,
      ),
    );
  }

  function updatePersonDraft(index: number, patch: Partial<MissionPerson>) {
    setPersonDrafts((current) =>
      current.map((person, personIndex) =>
        personIndex === index ? { ...person, ...patch } : person,
      ),
    );
  }

  function updateTrustPersonDraft(index: number, patch: Partial<TrustGraphPerson>) {
    setTrustPersonDrafts((current) =>
      current.map((person, personIndex) =>
        personIndex === index ? { ...person, ...patch } : person,
      ),
    );
  }

  async function saveGoals() {
    setSaving(true);
    setMessage(null);
    try {
      await patchMissionState({
        replaceCollections: ["goals"],
        goals: goalDrafts.map((goal) => ({
          ...goal,
          id: goal.id.trim() || slugify(goal.title) || `goal-${Date.now()}`,
          title: goal.title.trim(),
          owner: goal.owner?.trim() || undefined,
          summary: goal.summary?.trim() || undefined,
          updatedAt: Date.now(),
        })),
      });
      await refreshMissionControl();
      setMessage("ANIMA 6 goals saved.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function saveFeatures() {
    setSaving(true);
    setMessage(null);
    try {
      await patchMissionState({
        replaceCollections: ["features"],
        features: featureDrafts.map((feature) => ({
          ...feature,
          id: feature.id.trim() || slugify(feature.title) || `feature-${Date.now()}`,
          title: feature.title.trim(),
          area: feature.area?.trim() || undefined,
          lastTouchedAt: Date.now(),
        })),
      });
      await refreshMissionControl();
      setMessage("ANIMA 6 features saved.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function savePeople() {
    setSaving(true);
    setMessage(null);
    try {
      await patchMissionState({
        replaceCollections: ["people"],
        people: personDrafts.map((person) => ({
          ...person,
          id: person.id.trim() || slugify(person.name) || `person-${Date.now()}`,
          name: person.name.trim(),
          notes: person.notes?.trim() || undefined,
          trust: clampUnit(person.trust),
        })),
      });
      await refreshMissionControl();
      setMessage("Tracked people saved.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function saveTrustPeople() {
    setSaving(true);
    setMessage(null);
    try {
      await saveTrustGraph(
        trustPersonDrafts.map((person) => ({
          ...person,
          id: person.id.trim() || slugify(person.name) || `trust-person-${Date.now()}`,
          name: person.name.trim(),
          aliases: person.aliases?.map((value) => value.trim()).filter(Boolean),
          roles: person.roles?.map((value) => value.trim()).filter(Boolean),
          location: person.location?.trim() || undefined,
          notes: person.notes?.trim() || undefined,
          trust: clampUnit(person.trust),
          lastInteractedAt:
            typeof person.lastInteractedAt === "number" && Number.isFinite(person.lastInteractedAt)
              ? person.lastInteractedAt
              : undefined,
          updatedAt: Date.now(),
        })),
      );
      await refreshMissionControl();
      setMessage("Trust graph saved.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function saveChronos() {
    if (!chronosDraft) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await patchMissionState({
        chronos: {
          ...chronosDraft,
          activeWorkstream: chronosDraft.activeWorkstream?.trim() || undefined,
          updatedAt: Date.now(),
        },
      });
      await refreshMissionControl();
      setMessage("Chronos state saved.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function saveAffect() {
    if (!affectDraft) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await patchMissionState({
        affect: {
          ...affectDraft,
          joy: clampUnit(affectDraft.joy),
          frustration: clampUnit(affectDraft.frustration),
          curiosity: clampUnit(affectDraft.curiosity),
          confidence: clampUnit(affectDraft.confidence),
          care: clampUnit(affectDraft.care),
          fatigue: clampUnit(affectDraft.fatigue),
          updatedAt: Date.now(),
        },
      });
      await refreshMissionControl();
      setMessage("Affect state saved.");
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
            ANIMA's local-only continuity workspace. Edit durable context, connect a private repo,
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

      {/* ========== Overview Metric Cards ========== */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Goals</div>
          <div className="page-subtitle top-gap-sm">
            {activeGoals.length} active / {snapshot?.state.goals.length ?? 0} total
          </div>
          <div className="runtime-stat-detail top-gap-sm">
            {activeGoals[0]?.title ?? "No active goals yet."}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Features</div>
          <div className="page-subtitle top-gap-sm">
            {activeFeatures.length} in flight / {snapshot?.state.features.length ?? 0} tracked
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
            {featureBreakdown.queued > 0 && (
              <span className="runtime-stat-detail" style={{ color: "var(--color-text)" }}>
                {featureBreakdown.queued} queued
              </span>
            )}
            {featureBreakdown.inProgress > 0 && (
              <span className="runtime-stat-detail" style={{ color: "#ff6600" }}>
                {featureBreakdown.inProgress} in-progress
              </span>
            )}
            {featureBreakdown.review > 0 && (
              <span className="runtime-stat-detail" style={{ color: "#eab308" }}>
                {featureBreakdown.review} review
              </span>
            )}
            {featureBreakdown.done > 0 && (
              <span className="runtime-stat-detail" style={{ color: "#22c55e" }}>
                {featureBreakdown.done} done
              </span>
            )}
            {featureBreakdown.blocked > 0 && (
              <span className="runtime-stat-detail" style={{ color: "#ef4444" }}>
                {featureBreakdown.blocked} blocked
              </span>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Chronos</div>
          <div className="runtime-stat-detail top-gap-sm">
            {snapshot?.state.chronos.activeWorkstream
              ? `Focus: ${snapshot.state.chronos.activeWorkstream}`
              : "No active workstream"}
          </div>
          <div className="runtime-stat-detail">
            Contract {snapshot?.state.chronos.contractElapsedMinutes ?? 0}/
            {snapshot?.state.chronos.contractTargetMinutes ?? 45} min
          </div>
        </div>
        <div className="card">
          <div className="card-title">Affect</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
            {affectEntries.slice(0, 3).map(([label, value]) => (
              <span key={label} className="runtime-stat-detail">
                {label} {Math.round((value as number) * 100)}%
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">People</div>
          <div className="page-subtitle top-gap-sm">{trackedPeople.length} tracked</div>
          <div className="runtime-stat-detail top-gap-sm">
            {trackedPeople[0]?.name ?? "No people tracked yet."}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Trust Graph</div>
          <div className="page-subtitle top-gap-sm">
            {snapshot?.trustGraph.people.length ?? 0} trusted records
          </div>
          <div className="runtime-stat-detail top-gap-sm">
            {snapshot?.trustGraph.people[0]?.name ?? "No trust context recorded yet."}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Continuity Graph</div>
          <div className="page-subtitle top-gap-sm">
            {graphNodeCount} nodes / {graphEdgeCount} edges
          </div>
          <div className="runtime-stat-detail top-gap-sm">
            {focusEdges[0]
              ? `${focusEdges[0].relation}: ${focusEdges[0].target}`
              : "No active focus trace yet."}
          </div>
        </div>
      </div>

      {/* ========== Mission Files ========== */}
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

      {/* ========== Goals Section (collapsible, items expandable) ========== */}
      <div className="top-gap">
        <Section
          title="ANIMA 6 Goals"
          subtitle="Durable goals stored in Mission Control state."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {activeGoals.length} active / {snapshot?.state.goals.length ?? 0} total
            </span>
          }
          headerRight={
            <button
              type="button"
              className="action-button"
              disabled={saving}
              onClick={() => void saveGoals()}
            >
              {saving ? "Saving..." : "Save Goals"}
            </button>
          }
          expanded={expandedSections.goals}
          onToggle={() => toggleSection("goals")}
        >
          <div className="mission-file-list">
            {goalDrafts.map((goal, index) => (
              <ItemRow
                key={`${goal.id || "goal"}-${index}`}
                label={goal.title || "(untitled goal)"}
                detail={`${goal.status} / ${goal.priority}${goal.owner ? ` / ${goal.owner}` : ""}`}
                badge={
                  <span
                    className="badge"
                    style={{
                      backgroundColor: statusColor(goal.status),
                      color: "#fff",
                      fontSize: "0.7rem",
                    }}
                  >
                    {goal.status}
                  </span>
                }
                expanded={!!expandedGoals[index]}
                onToggle={() => toggleGoal(index)}
              >
                <div className="form-grid two-col">
                  <label className="field-block">
                    <span>Title</span>
                    <input
                      className="search-bar"
                      value={goal.title}
                      onChange={(event) => updateGoalDraft(index, { title: event.target.value })}
                    />
                  </label>
                  <label className="field-block">
                    <span>ID</span>
                    <input
                      className="search-bar mono"
                      value={goal.id}
                      onChange={(event) => updateGoalDraft(index, { id: event.target.value })}
                    />
                  </label>
                  <label className="field-block">
                    <span>Status</span>
                    <select
                      className="search-bar"
                      value={goal.status}
                      onChange={(event) =>
                        updateGoalDraft(index, {
                          status: event.target.value as MissionGoal["status"],
                        })
                      }
                    >
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="completed">completed</option>
                      <option value="blocked">blocked</option>
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Priority</span>
                    <select
                      className="search-bar"
                      value={goal.priority}
                      onChange={(event) =>
                        updateGoalDraft(index, {
                          priority: event.target.value as MissionGoal["priority"],
                        })
                      }
                    >
                      <option value="critical">critical</option>
                      <option value="high">high</option>
                      <option value="medium">medium</option>
                      <option value="low">low</option>
                    </select>
                  </label>
                  <label className="field-block field-span-2">
                    <span>Owner</span>
                    <input
                      className="search-bar"
                      value={goal.owner ?? ""}
                      onChange={(event) => updateGoalDraft(index, { owner: event.target.value })}
                    />
                  </label>
                  <label className="field-block field-span-2">
                    <span>Summary</span>
                    <textarea
                      className="search-bar"
                      value={goal.summary ?? ""}
                      onChange={(event) => updateGoalDraft(index, { summary: event.target.value })}
                    />
                  </label>
                </div>
                <div className="button-row top-gap-sm">
                  <button
                    type="button"
                    className="action-button ghost"
                    onClick={() =>
                      setGoalDrafts((current) =>
                        current.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </ItemRow>
            ))}
            <button
              type="button"
              className="action-button ghost top-gap-sm"
              onClick={() =>
                setGoalDrafts((current) => [
                  ...current,
                  {
                    id: "",
                    title: "",
                    status: "active",
                    priority: "medium",
                    updatedAt: Date.now(),
                  },
                ])
              }
            >
              Add Goal
            </button>
          </div>
        </Section>
      </div>

      {/* ========== Features Section (collapsible, items expandable) ========== */}
      <div className="top-gap">
        <Section
          title="Features"
          subtitle="Feature-level continuity and delivery state."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {featureBreakdown.inProgress} in-progress / {snapshot?.state.features.length ?? 0}{" "}
              total
            </span>
          }
          headerRight={
            <button
              type="button"
              className="action-button"
              disabled={saving}
              onClick={() => void saveFeatures()}
            >
              {saving ? "Saving..." : "Save Features"}
            </button>
          }
          expanded={expandedSections.features}
          onToggle={() => toggleSection("features")}
        >
          <div className="mission-file-list">
            {featureDrafts.map((feature, index) => (
              <ItemRow
                key={`${feature.id || "feature"}-${index}`}
                label={feature.title || "(untitled feature)"}
                detail={`${feature.status} / risk ${feature.risk} / tests ${feature.testStatus}${feature.area ? ` / ${feature.area}` : ""}`}
                badge={
                  <span
                    className="badge"
                    style={{
                      backgroundColor: statusColor(feature.status),
                      color: "#fff",
                      fontSize: "0.7rem",
                    }}
                  >
                    {feature.status}
                  </span>
                }
                expanded={!!expandedFeatures[index]}
                onToggle={() => toggleFeature(index)}
              >
                <div className="form-grid two-col">
                  <label className="field-block">
                    <span>Title</span>
                    <input
                      className="search-bar"
                      value={feature.title}
                      onChange={(event) => updateFeatureDraft(index, { title: event.target.value })}
                    />
                  </label>
                  <label className="field-block">
                    <span>ID</span>
                    <input
                      className="search-bar mono"
                      value={feature.id}
                      onChange={(event) => updateFeatureDraft(index, { id: event.target.value })}
                    />
                  </label>
                  <label className="field-block">
                    <span>Status</span>
                    <select
                      className="search-bar"
                      value={feature.status}
                      onChange={(event) =>
                        updateFeatureDraft(index, {
                          status: event.target.value as MissionFeature["status"],
                        })
                      }
                    >
                      <option value="queued">queued</option>
                      <option value="in_progress">in_progress</option>
                      <option value="review">review</option>
                      <option value="done">done</option>
                      <option value="blocked">blocked</option>
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Risk</span>
                    <select
                      className="search-bar"
                      value={feature.risk}
                      onChange={(event) =>
                        updateFeatureDraft(index, {
                          risk: event.target.value as MissionFeature["risk"],
                        })
                      }
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Tests</span>
                    <select
                      className="search-bar"
                      value={feature.testStatus}
                      onChange={(event) =>
                        updateFeatureDraft(index, {
                          testStatus: event.target.value as MissionFeature["testStatus"],
                        })
                      }
                    >
                      <option value="missing">missing</option>
                      <option value="partial">partial</option>
                      <option value="passing">passing</option>
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Area</span>
                    <input
                      className="search-bar"
                      value={feature.area ?? ""}
                      onChange={(event) => updateFeatureDraft(index, { area: event.target.value })}
                    />
                  </label>
                </div>
                <div className="button-row top-gap-sm">
                  <button
                    type="button"
                    className="action-button ghost"
                    onClick={() =>
                      setFeatureDrafts((current) =>
                        current.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </ItemRow>
            ))}
            <button
              type="button"
              className="action-button ghost top-gap-sm"
              onClick={() =>
                setFeatureDrafts((current) => [
                  ...current,
                  {
                    id: "",
                    title: "",
                    status: "queued",
                    risk: "medium",
                    testStatus: "missing",
                    lastTouchedAt: Date.now(),
                  },
                ])
              }
            >
              Add Feature
            </button>
          </div>
        </Section>
      </div>

      {/* ========== Affect Section (collapsible) ========== */}
      <div className="top-gap">
        <Section
          title="Affect"
          subtitle="Current bounded emotion state for ANIMA."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {affectEntries
                .map(([l, v]) => `${l} ${Math.round((v as number) * 100)}%`)
                .join(" / ")}
            </span>
          }
          headerRight={
            <button
              type="button"
              className="action-button"
              disabled={saving || !affectDraft}
              onClick={() => void saveAffect()}
            >
              {saving ? "Saving..." : "Save Affect"}
            </button>
          }
          expanded={expandedSections.affect}
          onToggle={() => toggleSection("affect")}
        >
          <div className="grid">
            {affectEntries.map(([label, value]) => (
              <div key={label}>
                <div className="runtime-stat-detail">{label}</div>
                <div className="progress-bar top-gap-sm">
                  <div className="progress-fill" style={{ width: `${Math.round(value * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          {affectDraft ? (
            <div className="form-grid two-col top-gap">
              {(
                [
                  ["joy", "Joy"],
                  ["frustration", "Frustration"],
                  ["curiosity", "Curiosity"],
                  ["confidence", "Confidence"],
                  ["care", "Care"],
                  ["fatigue", "Fatigue"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="field-block">
                  <span>{label}</span>
                  <input
                    className="search-bar"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={affectDraft[key]}
                    onChange={(event) =>
                      setAffectDraft((current) =>
                        current ? { ...current, [key]: Number(event.target.value) } : current,
                      )
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}
        </Section>
      </div>

      {/* ========== People Section (collapsible) ========== */}
      <div className="top-gap">
        <Section
          title="People"
          subtitle="Tracked humans and relationship state."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {trackedPeople.length} tracked
            </span>
          }
          headerRight={
            <button
              type="button"
              className="action-button"
              disabled={saving}
              onClick={() => void savePeople()}
            >
              {saving ? "Saving..." : "Save People"}
            </button>
          }
          expanded={expandedSections.people}
          onToggle={() => toggleSection("people")}
        >
          <div className="mission-file-list">
            {personDrafts.map((person, index) => (
              <div key={`${person.id || "person"}-${index}`} className="card top-gap-sm">
                <div className="form-grid two-col">
                  <label className="field-block">
                    <span>Name</span>
                    <input
                      className="search-bar"
                      value={person.name}
                      onChange={(event) => updatePersonDraft(index, { name: event.target.value })}
                    />
                  </label>
                  <label className="field-block">
                    <span>ID</span>
                    <input
                      className="search-bar mono"
                      value={person.id}
                      onChange={(event) => updatePersonDraft(index, { id: event.target.value })}
                    />
                  </label>
                  <label className="field-block">
                    <span>Relationship</span>
                    <select
                      className="search-bar"
                      value={person.relationship}
                      onChange={(event) =>
                        updatePersonDraft(index, {
                          relationship: event.target.value as MissionPerson["relationship"],
                        })
                      }
                    >
                      <option value="operator">operator</option>
                      <option value="ally">ally</option>
                      <option value="stakeholder">stakeholder</option>
                      <option value="unknown">unknown</option>
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Trust</span>
                    <input
                      className="search-bar"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={person.trust}
                      onChange={(event) =>
                        updatePersonDraft(index, { trust: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="field-block field-span-2">
                    <span>Notes</span>
                    <textarea
                      className="search-bar"
                      value={person.notes ?? ""}
                      onChange={(event) => updatePersonDraft(index, { notes: event.target.value })}
                    />
                  </label>
                </div>
                <div className="button-row top-gap-sm">
                  <button
                    type="button"
                    className="action-button ghost"
                    onClick={() =>
                      setPersonDrafts((current) =>
                        current.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="action-button ghost top-gap-sm"
              onClick={() =>
                setPersonDrafts((current) => [
                  ...current,
                  {
                    id: "",
                    name: "",
                    relationship: "ally",
                    trust: 0.5,
                  },
                ])
              }
            >
              Add Person
            </button>
          </div>
        </Section>
      </div>

      {/* ========== Trust Graph Section (collapsible) ========== */}
      <div className="top-gap">
        <Section
          title="Who Is Whom And Where"
          subtitle="Trusted person memory used for ANIMA 6 prompt context and relationship continuity."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {snapshot?.trustGraph.people.length ?? 0} records
            </span>
          }
          headerRight={
            <button
              type="button"
              className="action-button"
              disabled={saving}
              onClick={() => void saveTrustPeople()}
            >
              {saving ? "Saving..." : "Save Trust Graph"}
            </button>
          }
          expanded={expandedSections.trustGraph}
          onToggle={() => toggleSection("trustGraph")}
        >
          <div className="runtime-stat-detail mono top-gap-sm">
            {snapshot?.trustGraph.path ?? "~/.anima/identity/who_is_whom_and_where.json"}
          </div>
          <div className="mission-file-list top-gap">
            {trustPersonDrafts.map((person, index) => (
              <div key={`${person.id || "trust-person"}-${index}`} className="card top-gap-sm">
                <div className="form-grid two-col">
                  <label className="field-block">
                    <span>Name</span>
                    <input
                      className="search-bar"
                      value={person.name}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, { name: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-block">
                    <span>ID</span>
                    <input
                      className="search-bar mono"
                      value={person.id}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, { id: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-block">
                    <span>Relationship</span>
                    <select
                      className="search-bar"
                      value={person.relationship}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, {
                          relationship: event.target.value as TrustGraphPerson["relationship"],
                        })
                      }
                    >
                      <option value="operator">operator</option>
                      <option value="ally">ally</option>
                      <option value="stakeholder">stakeholder</option>
                      <option value="unknown">unknown</option>
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Trust</span>
                    <input
                      className="search-bar"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={person.trust}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, { trust: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="field-block">
                    <span>Aliases</span>
                    <input
                      className="search-bar"
                      value={(person.aliases ?? []).join(", ")}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, {
                          aliases: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Peter, boss"
                    />
                  </label>
                  <label className="field-block">
                    <span>Roles</span>
                    <input
                      className="search-bar"
                      value={(person.roles ?? []).join(", ")}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, {
                          roles: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="operator, founder"
                    />
                  </label>
                  <label className="field-block">
                    <span>Location</span>
                    <input
                      className="search-bar"
                      value={person.location ?? ""}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, { location: event.target.value })
                      }
                      placeholder="Sydney"
                    />
                  </label>
                  <label className="field-block">
                    <span>Last Interacted At (epoch ms)</span>
                    <input
                      className="search-bar mono"
                      type="number"
                      min={0}
                      step={1}
                      value={person.lastInteractedAt ?? ""}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, {
                          lastInteractedAt: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                      placeholder={String(Date.now())}
                    />
                  </label>
                  <label className="field-block field-span-2">
                    <span>Notes</span>
                    <textarea
                      className="search-bar"
                      value={person.notes ?? ""}
                      onChange={(event) =>
                        updateTrustPersonDraft(index, { notes: event.target.value })
                      }
                      placeholder="Primary operator, protect continuity, owns final decisions."
                    />
                  </label>
                </div>
                <div className="button-row top-gap-sm">
                  <button
                    type="button"
                    className="action-button ghost"
                    onClick={() =>
                      setTrustPersonDrafts((current) =>
                        current.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="action-button ghost top-gap-sm"
              onClick={() =>
                setTrustPersonDrafts((current) => [
                  ...current,
                  {
                    id: "",
                    name: "",
                    relationship: "ally",
                    trust: 0.5,
                    updatedAt: Date.now(),
                  },
                ])
              }
            >
              Add Trust Record
            </button>
          </div>
        </Section>
      </div>

      {/* ========== Chronos Section (collapsible) ========== */}
      <div className="top-gap">
        <Section
          title="Chronos Controls"
          subtitle="Heartbeat, checkpoint, and active workstream state."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {snapshot?.state.chronos.activeWorkstream
                ? `Focus: ${snapshot.state.chronos.activeWorkstream}`
                : "No workstream"}
              {" / "}Contract {snapshot?.state.chronos.contractElapsedMinutes ?? 0}/
              {snapshot?.state.chronos.contractTargetMinutes ?? 45} min
            </span>
          }
          headerRight={
            <button
              type="button"
              className="action-button"
              disabled={saving || !chronosDraft}
              onClick={() => void saveChronos()}
            >
              {saving ? "Saving..." : "Save Chronos"}
            </button>
          }
          expanded={expandedSections.chronos}
          onToggle={() => toggleSection("chronos")}
        >
          {chronosDraft ? (
            <div className="form-grid two-col">
              <label className="field-block">
                <span>Heartbeat Minutes</span>
                <input
                  className="search-bar"
                  type="number"
                  min={1}
                  value={chronosDraft.heartbeatMinutes}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current
                        ? { ...current, heartbeatMinutes: Number(event.target.value) }
                        : current,
                    )
                  }
                />
              </label>
              <label className="field-block">
                <span>Focus Block Minutes</span>
                <input
                  className="search-bar"
                  type="number"
                  min={1}
                  value={chronosDraft.focusBlockMinutes}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current
                        ? { ...current, focusBlockMinutes: Number(event.target.value) }
                        : current,
                    )
                  }
                />
              </label>
              <label className="field-block">
                <span>Checkpoint Minutes</span>
                <input
                  className="search-bar"
                  type="number"
                  min={1}
                  value={chronosDraft.checkpointIntervalMinutes}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current
                        ? { ...current, checkpointIntervalMinutes: Number(event.target.value) }
                        : current,
                    )
                  }
                />
              </label>
              <label className="field-block">
                <span>Active Workstream</span>
                <input
                  className="search-bar"
                  value={chronosDraft.activeWorkstream ?? ""}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current ? { ...current, activeWorkstream: event.target.value } : current,
                    )
                  }
                  placeholder="feature id or goal id"
                />
              </label>
              <label className="field-block">
                <span>Contract Started At (epoch ms)</span>
                <input
                  className="search-bar mono"
                  type="number"
                  min={0}
                  step={1}
                  value={chronosDraft.contractStartedAt ?? ""}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current
                        ? {
                            ...current,
                            contractStartedAt: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          }
                        : current,
                    )
                  }
                  placeholder={String(Date.now())}
                />
              </label>
              <label className="field-block">
                <span>Contract Target Minutes</span>
                <input
                  className="search-bar"
                  type="number"
                  min={1}
                  value={chronosDraft.contractTargetMinutes}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current
                        ? { ...current, contractTargetMinutes: Number(event.target.value) }
                        : current,
                    )
                  }
                />
              </label>
              <label className="field-block">
                <span>Elapsed Minutes</span>
                <input
                  className="search-bar"
                  type="number"
                  min={0}
                  value={chronosDraft.contractElapsedMinutes}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current
                        ? { ...current, contractElapsedMinutes: Number(event.target.value) }
                        : current,
                    )
                  }
                />
              </label>
              <label className="field-block">
                <span>Checkpoint Count</span>
                <input
                  className="search-bar"
                  type="number"
                  min={0}
                  value={chronosDraft.checkpointCount}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current
                        ? { ...current, checkpointCount: Number(event.target.value) }
                        : current,
                    )
                  }
                />
              </label>
              <label className="field-block">
                <span>Last Checkpoint At (epoch ms)</span>
                <input
                  className="search-bar mono"
                  type="number"
                  min={0}
                  step={1}
                  value={chronosDraft.lastCheckpointAt ?? ""}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current
                        ? {
                            ...current,
                            lastCheckpointAt: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          }
                        : current,
                    )
                  }
                  placeholder={String(Date.now())}
                />
              </label>
              <label className="field-block">
                <span>Drift Minutes</span>
                <input
                  className="search-bar"
                  type="number"
                  step={1}
                  value={chronosDraft.driftMinutes}
                  onChange={(event) =>
                    setChronosDraft((current) =>
                      current ? { ...current, driftMinutes: Number(event.target.value) } : current,
                    )
                  }
                />
              </label>
            </div>
          ) : null}
        </Section>
      </div>

      {/* ========== Graph Focus Section (collapsible) ========== */}
      <div className="top-gap">
        <Section
          title="Graph Focus"
          subtitle="Active continuity links generated from ANIMA 6 Mission Control state."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {focusEdges.length} links
            </span>
          }
          expanded={expandedSections.graphFocus}
          onToggle={() => toggleSection("graphFocus")}
        >
          <div className="mission-file-list">
            {focusEdges.length > 0 ? (
              focusEdges.map((edge) => (
                <div key={edge.id} className="mission-file-item">
                  <div>
                    <div className="card-title small">{edge.relation}</div>
                    <div className="runtime-stat-detail mono">
                      {edge.source} → {edge.target}
                    </div>
                  </div>
                  <div className="runtime-stat-detail">
                    {Math.round(edge.meta.strength * 100)}% strength
                  </div>
                </div>
              ))
            ) : (
              <div className="runtime-stat-detail">
                Chronos does not have an active workstream pinned yet, so the graph only contains
                baseline continuity links.
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ========== Atlas Section (collapsible) ========== */}
      <div className="top-gap">
        <Section
          title="Atlas"
          subtitle="Palace rooms, active continuity nodes, and recent brain events derived from ANIMA 6 state."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {atlasRooms.length} rooms / {atlasNodes.length} nodes / {atlasTimeline.length} events
            </span>
          }
          expanded={expandedSections.atlas}
          onToggle={() => toggleSection("atlas")}
        >
          <div className="grid grid-3 top-gap">
            <div className="card">
              <div className="card-title">Palace Rooms</div>
              <div className="activity-list top-gap">
                {atlasRooms.map((room) => (
                  <div key={room.key} className="mission-file-item">
                    <div>
                      <div className="card-title small">{room.title}</div>
                      <div className="runtime-stat-detail">{room.detail}</div>
                    </div>
                    <div className="runtime-stat-detail">{room.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Graph Neighborhood</div>
              <div className="activity-list top-gap">
                {atlasNodes.length > 0 ? (
                  atlasNodes.map((node) => (
                    <div key={node.id} className="mission-file-item">
                      <div>
                        <div className="card-title small">{node.label}</div>
                        <div className="runtime-stat-detail mono">
                          {node.type} · salience {Math.round(node.meta.salience * 100)}%
                        </div>
                      </div>
                      <div className="runtime-stat-detail">
                        {snapshot?.brainGraph.edges.filter(
                          (edge) => edge.source === node.id || edge.target === node.id,
                        ).length ?? 0}{" "}
                        links
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="runtime-stat-detail">No graph nodes available yet.</div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Timeline</div>
              <div className="activity-list top-gap">
                {atlasTimeline.length > 0 ? (
                  atlasTimeline.map((event) => (
                    <div key={event.id} className="mission-file-item">
                      <div>
                        <div className="card-title small">{event.title}</div>
                        <div className="runtime-stat-detail">{event.detail}</div>
                      </div>
                      <div className="runtime-stat-detail">{formatTimestamp(event.ts)}</div>
                    </div>
                  ))
                ) : (
                  <div className="runtime-stat-detail">No continuity events recorded yet.</div>
                )}
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* ========== Inner World Section (collapsible) ========== */}
      <div className="top-gap">
        <Section
          title="Inner World"
          subtitle="Recent soul, directives, journal, and wish state visible from Mission Control."
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {snapshot?.innerWorld?.length ?? 0} entries
            </span>
          }
          expanded={expandedSections.innerWorld}
          onToggle={() => toggleSection("innerWorld")}
        >
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
        </Section>
      </div>

      {/* ========== Important History Section (collapsible) ========== */}
      <div className="top-gap">
        <Section
          title="Important History"
          subtitle={`Archived coherence, prompts, heartbeat notes, and prior continuity imports from ~/.anima/important-history.`}
          badge={
            <span className="runtime-stat-detail" style={{ marginLeft: "0.5rem" }}>
              {snapshot?.importantHistory?.length ?? 0} entries
            </span>
          }
          expanded={expandedSections.importantHistory}
          onToggle={() => toggleSection("importantHistory")}
        >
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
        </Section>
      </div>
    </div>
  );
}
