import React, { useEffect, useMemo, useState } from "react";
import { listMemory, type MemoryEntry, type MemoryKind } from "../api";
import MarkdownText from "../components/MarkdownText";

const memoryKinds: Array<{ key: MemoryKind; label: string; description: string }> = [
  {
    key: "episodic",
    label: "Episodic",
    description: "Specific experiences, conversations, and time-bound events.",
  },
  {
    key: "semantic",
    label: "Semantic",
    description: "Distilled facts, preferences, knowledge, and learned patterns.",
  },
  {
    key: "procedural",
    label: "Procedural",
    description: "How-to knowledge, workflows, debugging steps, and operating routines.",
  },
];

export default function Memory(): React.ReactElement {
  const [activeKind, setActiveKind] = useState<MemoryKind>("episodic");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        try {
          const nextEntries = await listMemory(activeKind, query.trim() || undefined, 120);
          if (cancelled) {
            return;
          }
          setEntries(nextEntries);
          setSelectedEntryId((current) => {
            if (current && nextEntries.some((entry) => entry.id === current)) {
              return current;
            }
            return nextEntries[0]?.id ?? null;
          });
          setError(null);
        } catch (nextError) {
          if (!cancelled) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
            setEntries([]);
            setSelectedEntryId(null);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      },
      query.trim() ? 220 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeKind, query]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null,
    [entries, selectedEntryId],
  );

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Memory</h1>
          <div className="page-subtitle">
            Browse real ANIMA memory files from <span className="mono">~/.anima/memory</span>{" "}
            instead of placeholder views.
          </div>
        </div>
      </div>

      <input
        className="search-bar"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search memory excerpts, facts, people, workflows..."
        spellCheck={false}
      />

      <div className="tabs top-gap">
        {memoryKinds.map((kind) => (
          <div
            key={kind.key}
            className={`tab ${activeKind === kind.key ? "active" : ""}`}
            onClick={() => setActiveKind(kind.key)}
          >
            {kind.label}
          </div>
        ))}
      </div>

      <div className="memory-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                {memoryKinds.find((kind) => kind.key === activeKind)?.label} Memory
              </div>
              <div className="card-subtitle">
                {memoryKinds.find((kind) => kind.key === activeKind)?.description}
              </div>
            </div>
            <div className="runtime-stat-detail">
              {loading ? "Loading..." : `${entries.length} entries`}
            </div>
          </div>

          {error ? <div className="warning-text">{error}</div> : null}

          {entries.length === 0 ? (
            <div className="empty-note top-gap">
              {loading ? "Loading memory..." : "No matching memory entries found."}
            </div>
          ) : (
            <div className="memory-list top-gap">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`memory-list-item ${selectedEntry?.id === entry.id ? "active" : ""}`}
                  onClick={() => setSelectedEntryId(entry.id)}
                >
                  <div>
                    <div className="card-title small">{entry.name}</div>
                    <div className="runtime-stat-detail mono">{entry.path}</div>
                  </div>
                  <div className="runtime-stat-detail">
                    {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "unknown"}
                  </div>
                  <div className="memory-excerpt">{entry.excerpt || "No excerpt available."}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Preview</div>
              <div className="card-subtitle">Inspect the selected memory file directly.</div>
            </div>
            {selectedEntry ? (
              <div className="runtime-stat-detail mono">{selectedEntry.name}</div>
            ) : null}
          </div>

          {selectedEntry ? (
            <>
              <div className="runtime-stat-detail mono top-gap-sm">{selectedEntry.path}</div>
              <div className="memory-preview top-gap">
                <MarkdownText value={selectedEntry.content} className="markdown-preview" />
              </div>
            </>
          ) : (
            <div className="empty-note top-gap">Select a memory entry to preview it here.</div>
          )}
        </div>
      </div>
    </div>
  );
}
