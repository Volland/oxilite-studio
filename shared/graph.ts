// Turns results into a node-link graph for the graph view: RDF triples, Cypher values, or a
// resource's neighbourhood. Pure, so it is tested outside the webview.
// @lat: [[architecture#Views#Graph view]]
import type { Description, QueryPayload, Term } from './protocol';
import { formatIri, formatTerm } from './terms';

export interface GraphNode {
  id: string;
  label: string;
  kind: 'iri' | 'blank' | 'literal' | 'node';
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  inferred?: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Nodes left out to keep the drawing readable. */
  omitted: number;
}

export const MAX_NODES = 1500;

class Builder {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  omitted = 0;

  node(n: GraphNode): boolean {
    if (this.nodes.has(n.id)) return true;
    if (this.nodes.size >= MAX_NODES) {
      this.omitted++;
      return false;
    }
    this.nodes.set(n.id, n);
    return true;
  }

  edge(source: string, target: string, label: string, inferred?: boolean): void {
    if (!this.nodes.has(source) || !this.nodes.has(target)) return;
    this.edges.push({ id: `e${this.edges.length}`, source, target, label, inferred });
  }

  build(): Graph {
    return { nodes: [...this.nodes.values()], edges: this.edges, omitted: this.omitted };
  }
}

function termNode(t: Term, literalId: string): GraphNode {
  switch (t.termType) {
    case 'NamedNode':
      return { id: t.value, label: formatIri(t.value).replace(/^<(.*)>$/, (_, i: string) => i.replace(/^.*[/#]/, '')), kind: 'iri' };
    case 'BlankNode':
      return { id: `_:${t.value}`, label: `_:${t.value}`, kind: 'blank' };
    default:
      return { id: literalId, label: formatTerm(t), kind: 'literal' };
  }
}

function predicateLabel(p: Term): string {
  return p.termType === 'NamedNode' ? formatIri(p.value).replace(/^<(.*)>$/, (_, i: string) => i.replace(/^.*[/#]/, '')) : formatTerm(p);
}

/** Triples: subjects and objects become nodes (each literal its own node), predicates edges. */
export function fromQuads(quads: { subject: Term; predicate: Term; object: Term }[]): Graph {
  const b = new Builder();
  quads.forEach((q, i) => {
    const s = termNode(q.subject, `lit${i}s`);
    const o = termNode(q.object, `lit${i}`);
    if (b.node(s) && b.node(o)) b.edge(s.id, o.id, predicateLabel(q.predicate));
  });
  return b.build();
}

interface CypherNode {
  type: 'node';
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}
interface CypherRel {
  type: 'relationship';
  id: string;
  relType: string;
  start: string;
  end: string;
}
interface CypherPath {
  type: 'path';
  nodes: CypherNode[];
  relationships: CypherRel[];
}

function cypherNodeLabel(n: CypherNode): string {
  const name = n.properties.name ?? n.properties.label ?? n.properties.title;
  return typeof name === 'string' ? name : `${n.labels[0] ? `:${n.labels[0]} ` : ''}${n.id.replace(/^.*[/#:]/, '')}`;
}

/** Cypher values: nodes, relationships and paths anywhere in the rows (lists and maps too). */
export function fromCypher(rows: unknown[][]): Graph {
  const b = new Builder();
  const rels: CypherRel[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== 'object') return;
    const o = v as { type?: string };
    if (o.type === 'node') {
      const n = o as CypherNode;
      b.node({ id: n.id, label: cypherNodeLabel(n), kind: 'node' });
    } else if (o.type === 'relationship') {
      rels.push(o as CypherRel);
    } else if (o.type === 'path') {
      const p = o as CypherPath;
      p.nodes.forEach(visit);
      rels.push(...p.relationships);
    } else {
      Object.values(o).forEach(visit);
    }
  };
  rows.forEach(visit);
  // The same relationship appears in every path through it: draw it once.
  const seen = new Set<string>();
  for (const r of rels) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    // A relationship's ends may not be returned as nodes: draw them anyway.
    for (const end of [r.start, r.end]) b.node({ id: end, label: end.replace(/^.*[/#:]/, ''), kind: 'node' });
    b.edge(r.start, r.end, r.relType);
  }
  return b.build();
}

/** A resource and its neighbours, inferred statements marked. */
export function fromDescription(d: Description): Graph {
  const b = new Builder();
  const center = termNode({ termType: 'NamedNode', value: d.iri }, 'center');
  b.node(center);
  d.outgoing.forEach((r, i) => {
    const o = termNode(r.o, `out${i}`);
    if (b.node(o)) b.edge(center.id, o.id, predicateLabel(r.p), r.inferred);
  });
  d.incoming.forEach((r) => {
    const s = termNode(r.s, `in-${r.s.value}`);
    if (b.node(s)) b.edge(s.id, center.id, predicateLabel(r.p), r.inferred);
  });
  return b.build();
}

/** Whether a payload has a graph to draw. */
export function graphOf(payload: QueryPayload): Graph | undefined {
  if (payload.kind === 'quads') return fromQuads(payload.quads);
  if (payload.kind === 'cypher') {
    const g = fromCypher(payload.rows);
    return g.nodes.length ? g : undefined;
  }
  return undefined;
}

export interface Ontology {
  classes: { iri: string; instances: number }[];
  subclass: [string, string][];
  properties: { iri: string; domain: string | null; range: string | null; datatype: boolean }[];
}

function local(iri: string): string {
  const short = formatIri(iri);
  return short.startsWith('<') ? iri.replace(/^.*[/#]/, '') : short;
}

/** The ontology diagram: classes (with their datatype properties) linked by subclass edges and
 * by object properties from domain to range. */
export function fromOntology(o: Ontology): Graph {
  const b = new Builder();
  const attributes = new Map<string, string[]>();
  for (const p of o.properties) {
    if (p.datatype && p.domain) attributes.set(p.domain, [...(attributes.get(p.domain) ?? []), local(p.iri)]);
  }
  const label = (iri: string, instances?: number) => {
    const attrs = attributes.get(iri);
    return `${local(iri)}${instances ? ` (${instances})` : ''}${attrs ? `\n${attrs.join(', ')}` : ''}`;
  };
  for (const c of o.classes) b.node({ id: c.iri, label: label(c.iri, c.instances), kind: 'iri' });
  for (const [c, s] of o.subclass) {
    for (const x of [c, s]) b.node({ id: x, label: label(x), kind: 'iri' });
    b.edge(c, s, 'subClassOf', true);
  }
  for (const p of o.properties) {
    if (p.datatype || !p.domain || !p.range) continue;
    for (const x of [p.domain, p.range]) b.node({ id: x, label: label(x), kind: 'iri' });
    b.edge(p.domain, p.range, local(p.iri));
  }
  return b.build();
}
