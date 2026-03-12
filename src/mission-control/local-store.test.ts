import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveTrustGraph } from "../identity/trust-graph.js";
import {
  patchMissionControlState,
  readMissionControlSnapshot,
  readMissionControlState,
} from "./local-store.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

async function createStateDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "anima-mission-"));
  dirs.push(dir);
  return dir;
}

describe("mission-control local store", () => {
  it("hydrates ANIMA 6 defaults", async () => {
    const stateDir = await createStateDir();
    const state = await readMissionControlState(stateDir);

    expect(state.goals[0]?.id).toBe("keep-anima-coherent");
    expect(state.features[0]?.id).toBe("anima-6-foundation");
    expect(state.chronos.heartbeatMinutes).toBe(30);
    expect(state.affect.curiosity).toBeGreaterThan(0.5);
    expect(state.autoToggle.heartbeat).toBe(true);
    expect(state.autoToggle.providers).toBe(false);
  });

  it("patches chronos and affect state with normalization", async () => {
    const stateDir = await createStateDir();
    const state = await patchMissionControlState(
      {
        chronos: {
          heartbeatMinutes: 60,
          checkpointIntervalMinutes: 0,
          contractTargetMinutes: 25,
          contractElapsedMinutes: 42.8,
          checkpointCount: -4,
          driftMinutes: 99.3,
        },
        affect: {
          joy: 2,
          frustration: -1,
        },
      },
      stateDir,
    );

    expect(state.chronos.heartbeatMinutes).toBe(60);
    expect(state.chronos.checkpointIntervalMinutes).toBe(1);
    expect(state.chronos.contractTargetMinutes).toBe(25);
    expect(state.chronos.contractElapsedMinutes).toBe(42);
    expect(state.chronos.checkpointCount).toBe(0);
    expect(state.chronos.driftMinutes).toBe(99);
    expect(state.affect.joy).toBe(1);
    expect(state.affect.frustration).toBe(0);
  });

  it("derives chronos drift when elapsed time changes", async () => {
    const stateDir = await createStateDir();
    const state = await patchMissionControlState(
      {
        chronos: {
          contractTargetMinutes: 45,
          contractElapsedMinutes: 63,
        },
      },
      stateDir,
    );

    expect(state.chronos.driftMinutes).toBe(18);
  });

  it("patches auto-toggle policy state", async () => {
    const stateDir = await createStateDir();
    const state = await patchMissionControlState(
      {
        autoToggle: {
          providers: true,
          rawConfig: true,
          heartbeat: false,
        },
      },
      stateDir,
    );

    expect(state.autoToggle.providers).toBe(true);
    expect(state.autoToggle.rawConfig).toBe(true);
    expect(state.autoToggle.heartbeat).toBe(false);
    expect(state.autoToggle.memory).toBe(true);
  });

  it("merges tracked goals, features, and people by id with normalized entries", async () => {
    const stateDir = await createStateDir();
    await patchMissionControlState(
      {
        goals: [
          {
            id: "existing-goal",
            title: "Existing Goal",
            status: "paused",
            priority: "low",
            updatedAt: 1,
          },
        ],
        features: [
          {
            id: "existing-feature",
            title: "Existing Feature",
            status: "queued",
            risk: "low",
            testStatus: "missing",
            lastTouchedAt: 1,
          },
        ],
        people: [
          {
            id: "existing-person",
            name: "Existing Person",
            relationship: "ally",
            trust: 0.2,
          },
        ],
        replaceCollections: ["goals", "features", "people"],
      },
      stateDir,
    );
    const state = await patchMissionControlState(
      {
        goals: [
          {
            id: "  chronos ",
            title: " Ship Chronos ",
            status: "active",
            priority: "high",
            updatedAt: Number.NaN,
          },
        ],
        features: [
          {
            id: "mission-ui",
            title: "Mission UI",
            status: "review",
            risk: "medium",
            testStatus: "partial",
            lastTouchedAt: Number.NaN,
          },
        ],
        people: [
          {
            id: "sylys",
            name: " Sylys ",
            relationship: "ally",
            trust: 4,
          },
        ],
      },
      stateDir,
    );

    expect(state.goals.map((goal) => goal.id)).toEqual(["existing-goal", "chronos"]);
    expect(state.goals[0]?.id).toBe("existing-goal");
    expect(state.goals[1]?.title).toBe("Ship Chronos");
    expect(state.features.map((feature) => feature.id)).toEqual(["existing-feature", "mission-ui"]);
    expect(state.features[1]?.lastTouchedAt).toBeTypeOf("number");
    expect(state.people.map((person) => person.id)).toEqual(["existing-person", "sylys"]);
    expect(state.people[1]?.name).toBe("Sylys");
    expect(state.people[1]?.trust).toBe(1);
  });

  it("supports explicit replace and removal semantics for tracked collections", async () => {
    const stateDir = await createStateDir();
    await patchMissionControlState(
      {
        goals: [
          {
            id: "keep",
            title: "Keep",
            status: "active",
            priority: "high",
            updatedAt: 1,
          },
          {
            id: "drop",
            title: "Drop",
            status: "paused",
            priority: "low",
            updatedAt: 1,
          },
        ],
        features: [
          {
            id: "feature-a",
            title: "Feature A",
            status: "queued",
            risk: "low",
            testStatus: "missing",
            lastTouchedAt: 1,
          },
        ],
        people: [
          {
            id: "person-a",
            name: "Person A",
            relationship: "ally",
            trust: 0.5,
          },
        ],
        replaceCollections: ["goals", "features", "people"],
      },
      stateDir,
    );

    const merged = await patchMissionControlState(
      {
        goals: [
          {
            id: "keep",
            title: "Keep Updated",
            status: "completed",
            priority: "critical",
            updatedAt: 2,
          },
        ],
        goalIdsToRemove: ["drop"],
      },
      stateDir,
    );

    expect(merged.goals.map((goal) => goal.id)).toEqual(["keep"]);
    expect(merged.goals[0]?.title).toBe("Keep Updated");

    const replaced = await patchMissionControlState(
      {
        features: [
          {
            id: "feature-b",
            title: "Feature B",
            status: "review",
            risk: "medium",
            testStatus: "partial",
            lastTouchedAt: 2,
          },
        ],
        people: [],
        replaceCollections: ["features", "people"],
      },
      stateDir,
    );

    expect(replaced.features.map((feature) => feature.id)).toEqual(["feature-b"]);
    expect(replaced.people).toEqual([]);
  });

  it("projects mission state into an ANIMA 6 continuity graph", async () => {
    const stateDir = await createStateDir();
    await patchMissionControlState(
      {
        goals: [
          {
            id: "chronos",
            title: "Ship Chronos",
            status: "active",
            priority: "high",
            owner: "sylys",
            updatedAt: 123,
          },
        ],
        features: [
          {
            id: "mission-ui",
            title: "Mission UI",
            status: "in_progress",
            risk: "medium",
            testStatus: "partial",
            lastTouchedAt: 456,
          },
        ],
        people: [
          {
            id: "sylys",
            name: "Sylys",
            relationship: "ally",
            trust: 0.9,
          },
        ],
        chronos: {
          activeWorkstream: "mission-ui",
        },
      },
      stateDir,
    );

    const snapshot = await readMissionControlSnapshot(stateDir);

    expect(snapshot.brainGraph.nodes.map((node) => node.type)).toEqual(
      expect.arrayContaining(["goal", "feature", "person", "chronos", "affect"]),
    );
    expect(snapshot.brainGraph.edges.map((edge) => edge.relation)).toEqual(
      expect.arrayContaining(["owns", "supports", "focuses_on", "tracks", "influences"]),
    );
  });

  it("includes trust graph data in the mission control snapshot", async () => {
    const stateDir = await createStateDir();
    await saveTrustGraph(
      {
        version: 1,
        people: [
          {
            id: "sylys",
            name: "Sylys",
            aliases: ["Peter"],
            relationship: "operator",
            trust: 1,
            roles: ["operator"],
            location: "Sydney",
            notes: "Primary operator.",
            updatedAt: Date.now(),
          },
        ],
      },
      stateDir,
    );

    const snapshot = await readMissionControlSnapshot(stateDir);

    expect(snapshot.trustGraph.path).toBe(
      path.join(stateDir, "identity", "who_is_whom_and_where.json"),
    );
    expect(snapshot.trustGraph.people[0]?.name).toBe("Sylys");
    expect(snapshot.trustGraph.people[0]?.aliases).toEqual(["Peter"]);
  });
});
