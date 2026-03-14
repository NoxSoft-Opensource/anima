import { describe, expect, it } from "vitest";
import { BrainGraph } from "./brain-graph.js";

describe("BrainGraph", () => {
  it("resolves nodes by alias and merges evidence", () => {
    const graph = new BrainGraph();
    graph.addNode({
      id: "operator",
      type: "person",
      label: "Sylys",
      aliases: ["grim", "sylys"],
      meta: {
        confidence: 0.9,
        provenance: ["conversation"],
      },
    });
    graph.addEvidenceToNode("operator", {
      source: "conversation",
      excerpt: "Operator asked for ANIMA 6.",
    });

    const node = graph.getNode("grim");
    expect(node?.id).toBe("operator");
    expect(node?.meta.confidence).toBe(0.9);
    expect(node?.evidence).toHaveLength(1);
  });

  it("tracks typed edges and neighbor lookup", () => {
    const graph = new BrainGraph();
    graph.addNode({ id: "anima6", type: "feature", label: "ANIMA 6" });
    graph.addNode({ id: "chronos", type: "feature", label: "Chronos" });
    graph.addEdge({
      id: "anima6-chronos",
      source: "anima6",
      target: "chronos",
      relation: "supports",
      meta: {
        strength: 0.8,
        provenance: ["blueprint"],
      },
    });

    const neighbors = graph.getNeighbors("anima6", "supports");
    expect(neighbors.map((node) => node.id)).toEqual(["chronos"]);
    expect(graph.getEdge("anima6-chronos")?.meta.strength).toBe(0.8);
  });

  it("round-trips snapshot data", () => {
    const graph = new BrainGraph();
    graph.addNode({
      id: "goal-1",
      type: "goal",
      label: "Keep ANIMA coherent",
      properties: { priority: "critical" },
    });

    const copy = new BrainGraph();
    copy.fromJSON(graph.toJSON());

    expect(copy.listNodesByType("goal")[0]?.properties.priority).toBe("critical");
  });
});
