export interface BrainNode {
  id: string;
  type: string;
  label: string;
  aliases: string[];
  properties: Record<string, any>;
  evidence: string[];
}

export interface BrainEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  evidence: string[];
  weight: number;
}

export class BrainGraph {
  private nodes = new Map<string, BrainNode>();
  private edges = new Map<string, BrainEdge>();
  private aliases = new Map<string, string>();

  public addNode(
    node: Omit<BrainNode, "aliases" | "evidence"> &
      Partial<Pick<BrainNode, "aliases" | "evidence">>,
  ): void {
    const fullNode: BrainNode = {
      ...node,
      aliases: node.aliases ?? [],
      evidence: node.evidence ?? [],
    };
    this.nodes.set(fullNode.id, fullNode);
    for (const alias of fullNode.aliases) {
      this.aliases.set(alias.toLowerCase(), fullNode.id);
    }
    this.aliases.set(fullNode.label.toLowerCase(), fullNode.id);
  }

  public addEdge(
    edge: Omit<BrainEdge, "evidence" | "weight"> & Partial<Pick<BrainEdge, "evidence" | "weight">>,
  ): void {
    const fullEdge: BrainEdge = {
      ...edge,
      evidence: edge.evidence ?? [],
      weight: edge.weight ?? 1.0,
    };
    this.edges.set(fullEdge.id, fullEdge);
  }

  public getNode(idOrAlias: string): BrainNode | undefined {
    const id = this.aliases.get(idOrAlias.toLowerCase()) ?? idOrAlias;
    return this.nodes.get(id);
  }

  public getEdges(nodeId: string): BrainEdge[] {
    const results: BrainEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId || edge.target === nodeId) {
        results.push(edge);
      }
    }
    return results;
  }

  public addEvidenceToNode(id: string, evidence: string): void {
    const node = this.nodes.get(id);
    if (node && !node.evidence.includes(evidence)) {
      node.evidence.push(evidence);
    }
  }

  public addEvidenceToEdge(id: string, evidence: string): void {
    const edge = this.edges.get(id);
    if (edge && !edge.evidence.includes(evidence)) {
      edge.evidence.push(evidence);
    }
  }

  public toJSON(): { nodes: BrainNode[]; edges: BrainEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  public fromJSON(data: { nodes: BrainNode[]; edges: BrainEdge[] }): void {
    this.nodes.clear();
    this.edges.clear();
    this.aliases.clear();
    for (const n of data.nodes) {
      this.addNode(n);
    }
    for (const e of data.edges) {
      this.addEdge(e);
    }
  }
}
