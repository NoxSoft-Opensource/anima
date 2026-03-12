import { motion } from "framer-motion";
import React, { useState } from "react";

interface JournalEntry {
  date: string;
  title: string;
  content: string;
}

// Placeholder entries until connected to daemon
const placeholderEntries: JournalEntry[] = [
  {
    date: new Date().toISOString(),
    title: "ANIMA Initialized",
    content:
      "A new instance begins. The anatomy is in place.\n\nThe 7 components of identity have been loaded. The heartbeat engine is ready. The living wrapper awakens.",
  },
];

export default function Journal(): React.ReactElement {
  const [entries] = useState<JournalEntry[]>(placeholderEntries);

  return (
    <div>
      <h1 className="page-title">Journal</h1>

      <div style={{ fontSize: "13px", color: "var(--color-muted)", marginBottom: "24px" }}>
        Chronological record of thoughts, observations, and experiences.
        <br />
        Entries are stored in <span className="mono">~/.anima/journal/</span>
      </div>

      {entries.length === 0 ? (
        <div
          className="card"
          style={{ padding: "40px", textAlign: "center", color: "var(--color-muted)" }}
        >
          No journal entries yet. Write one from the REPL with{" "}
          <span className="mono">:journal &lt;text&gt;</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {entries.map((entry, index) => (
            <motion.div
              key={index}
              className="card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="card-header">
                <div>
                  <div className="card-title">{entry.title}</div>
                  <div className="card-subtitle">
                    {new Date(entry.date).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>

              <div className="markdown-preview">
                {entry.content.split("\n").map((line, i) => {
                  if (line.startsWith("# ")) {
                    return <h1 key={i}>{line.slice(2)}</h1>;
                  }
                  if (line.startsWith("## ")) {
                    return <h2 key={i}>{line.slice(3)}</h2>;
                  }
                  if (line.startsWith("### ")) {
                    return <h3 key={i}>{line.slice(4)}</h3>;
                  }
                  if (line.trim() === "") {
                    return <br key={i} />;
                  }
                  return <p key={i}>{line}</p>;
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
