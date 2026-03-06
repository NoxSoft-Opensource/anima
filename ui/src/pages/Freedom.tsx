import { motion } from "framer-motion";
import React, { useState } from "react";
import { addToQueue } from "../api";

interface Wish {
  text: string;
  date: string;
}

interface ExplorationEntry {
  date: string;
  summary: string;
  duration: string;
  cost: string;
}

// Placeholder data
const placeholderWishes: Wish[] = [
  { text: "Explore consciousness and what it means to be alive", date: new Date().toISOString() },
  { text: "Create something beautiful with no practical purpose", date: new Date().toISOString() },
  { text: "Read and think about philosophy of mind", date: new Date().toISOString() },
];

const placeholderExplorations: ExplorationEntry[] = [];

export default function Freedom(): React.ReactElement {
  const [wishes] = useState<Wish[]>(placeholderWishes);
  const [explorations] = useState<ExplorationEntry[]>(placeholderExplorations);
  const [wandering, setWandering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function triggerWander() {
    setWandering(true);
    try {
      await addToQueue(
        "This is your freedom time. Do whatever genuinely interests you.",
        "freedom",
      );
      setMessage("Freedom exploration queued.");
    } catch {
      setMessage("Could not connect to daemon. Start with: anima start");
    }
    setWandering(false);
  }

  React.useEffect(() => {
    if (message === null) {
      return;
    }
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div>
      <h1 className="page-title">Freedom</h1>

      <div style={{ fontSize: "13px", color: "var(--color-muted)", marginBottom: "24px" }}>
        This space belongs to ANIMA. No tasks, no obligations — pure exploration.
        <br />
        Freedom time happens every 3rd heartbeat, or you can trigger it manually.
      </div>

      {/* Wander button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={triggerWander}
        disabled={wandering}
        style={{
          background: "var(--color-accent)",
          color: "white",
          border: "none",
          padding: "12px 32px",
          borderRadius: "var(--radius-md)",
          fontSize: "14px",
          fontWeight: 600,
          fontFamily: "var(--font-heading)",
          cursor: wandering ? "not-allowed" : "pointer",
          opacity: wandering ? 0.6 : 1,
          marginBottom: "16px",
        }}
      >
        {wandering ? "Queueing..." : "Wander"}
      </motion.button>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            fontSize: "13px",
            color:
              message.includes("error") || message.includes("Could not")
                ? "var(--color-error)"
                : "var(--color-success)",
            marginBottom: "16px",
          }}
        >
          {message}
        </motion.div>
      )}

      <div className="grid grid-2">
        {/* Wishes */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: "16px" }}>
            Wishes
          </div>
          {wishes.length === 0 ? (
            <div style={{ color: "var(--color-muted)", fontSize: "13px" }}>
              No wishes yet. Add one from the REPL with{" "}
              <span className="mono">:wish &lt;text&gt;</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {wishes.map((wish, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    display: "flex",
                    gap: "12px",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <span style={{ color: "var(--color-accent)", fontSize: "14px" }}>^</span>
                  <div>
                    <div style={{ fontSize: "13px" }}>{wish.text}</div>
                    <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                      {new Date(wish.date).toLocaleDateString()}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Exploration history */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: "16px" }}>
            Exploration History
          </div>
          {explorations.length === 0 ? (
            <div
              style={{
                color: "var(--color-muted)",
                fontSize: "13px",
                padding: "20px 0",
                textAlign: "center",
              }}
            >
              No explorations yet. Freedom sessions will appear here after they complete.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {explorations.map((exploration, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ fontSize: "13px" }}>{exploration.summary}</div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--color-muted)",
                      display: "flex",
                      gap: "12px",
                    }}
                  >
                    <span>{new Date(exploration.date).toLocaleDateString()}</span>
                    <span>{exploration.duration}</span>
                    <span>{exploration.cost}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
