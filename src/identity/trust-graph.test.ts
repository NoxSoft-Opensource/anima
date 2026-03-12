import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTrustGraph,
  loadTrustGraphDigest,
  resolveTrustGraphPath,
  saveTrustGraph,
} from "./trust-graph.js";

describe("trust graph", () => {
  it("uses an empty default graph when no file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "anima-trust-graph-"));

    const graph = await loadTrustGraph(root);
    const digest = await loadTrustGraphDigest({ stateDir: root });

    expect(graph.people).toEqual([]);
    expect(digest).toBe("");

    await rm(root, { recursive: true, force: true });
  });

  it("persists and summarizes normalized people context", async () => {
    const root = await mkdtemp(join(tmpdir(), "anima-trust-graph-"));

    await saveTrustGraph(
      {
        version: 1,
        people: [
          {
            id: "",
            name: " Sylys ",
            aliases: [" Peter ", "Sylys"],
            relationship: "operator",
            trust: 3,
            roles: [" founder ", "operator"],
            location: " Sydney ",
            notes: "Primary operator and product lead.",
            lastInteractedAt: Date.now() - 86_400_000,
            updatedAt: NaN,
          },
          {
            id: "nox",
            name: "Nox",
            relationship: "ally",
            trust: 0.8,
            notes: "Useful coordination point.",
            updatedAt: Date.now(),
          },
        ],
      },
      root,
    );

    const stored = await loadTrustGraph(root);
    const digest = await loadTrustGraphDigest({ stateDir: root, maxPeople: 1 });

    expect(resolveTrustGraphPath(root)).toBe(join(root, "identity", "who_is_whom_and_where.json"));
    expect(stored.people[0]?.id).toBe("sylys");
    expect(stored.people[0]?.trust).toBe(1);
    expect(stored.people[0]?.aliases).toEqual(["Peter", "Sylys"]);
    expect(stored.people[0]?.roles).toEqual(["founder", "operator"]);
    expect(stored.people[0]?.location).toBe("Sydney");
    expect(digest).toContain("# People And Trust Context");
    expect(digest).toContain("Sylys (sylys)");
    expect(digest).toContain("relationship=operator; trust=1.00");
    expect(digest).not.toContain("Nox");

    await rm(root, { recursive: true, force: true });
  });
});
