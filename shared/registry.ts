// The schema registry as the studio shows it: registered graphs merged across roles, the data
// graphs they map, which schemas apply to each graph and why, and the mapping graph. Pure, so it
// is tested outside the webview; it follows oxilite's rules (docs/schema-registry.md).
// @lat: [[architecture#Views#Schema registry view]]
import type { Graph, GraphEdge, GraphNode } from './graph';
import type { Registry, SchemaRole } from './protocol';

export const OXL = 'https://oxilite.dev/ns#';
export const ALL_GRAPHS = `${OXL}AllGraphs`;
export const DEFAULT_GRAPH = `${OXL}DefaultGraph`;
export const SCHEMA_GRAPH = 'oxilite:schema';
export const VOCABULARY_GRAPH = 'oxilite:vocabulary';
export const SYSTEM_GRAPHS = [SCHEMA_GRAPH, VOCABULARY_GRAPH];

/** A registered graph with all its roles; roles share one description in oxilite. */
export interface SchemaGraph {
  graph: string;
  roles: SchemaRole[];
  active: boolean;
  /** Empty: every graph. */
  appliesTo: string[];
  /** Recorded in the registry (`oxl:imports`) or asserted in the graph (`owl:imports`). */
  imports: string[];
  iri: string | null;
  version: string | null;
  sha256: string | null;
  loadedAt: string | null;
  triples: number | null;
}

export interface DataGraph {
  graph: string;
  triples: number | null;
  /** Named as a target but holding no triples. */
  missing: boolean;
}

/** Why a schema applies to a graph. */
export interface Applying {
  schema: string;
  roles: SchemaRole[];
  via: 'direct' | 'all' | 'import';
  /** For an import: the chain of ontologies from the one that applies directly. */
  through?: string[];
}

export const ROLE_NAMES: Record<SchemaRole, string> = { ontology: 'ontology', shacl: 'shapes', shex: 'ShEx' };

/** Registered graphs, one per graph, in the registry's order. */
export function schemaGraphs(r: Registry): SchemaGraph[] {
  const sizes = new Map(r.graphs.map((g) => [g.graph, g.triples]));
  const own = new Map(r.ownImports.map((o) => [o.graph, o.imports]));
  const by = new Map<string, SchemaGraph>();
  for (const e of r.entries) {
    const g = by.get(e.graph);
    if (g) {
      if (!g.roles.includes(e.role)) g.roles.push(e.role);
      continue;
    }
    by.set(e.graph, {
      graph: e.graph,
      roles: [e.role],
      active: e.active,
      appliesTo: e.appliesTo.filter((t) => t !== ALL_GRAPHS),
      imports: [...new Set([...e.imports, ...(own.get(e.graph) ?? [])])],
      iri: e.iri,
      version: e.version,
      sha256: e.sha256,
      loadedAt: e.loadedAt,
      triples: sizes.get(e.graph) ?? 0,
    });
  }
  return [...by.values()];
}

/** Graphs holding data: every graph that is neither registered nor a system graph, plus targets
 * that hold no triples (marked missing). */
export function dataGraphs(r: Registry): DataGraph[] {
  const registered = new Set(r.entries.map((e) => e.graph));
  const out = new Map<string, DataGraph>();
  for (const g of r.graphs) {
    if (!registered.has(g.graph) && !SYSTEM_GRAPHS.includes(g.graph)) out.set(g.graph, { ...g, missing: false });
  }
  for (const e of r.entries) {
    for (const t of e.appliesTo) {
      if (t === ALL_GRAPHS || out.has(t) || registered.has(t) || SYSTEM_GRAPHS.includes(t)) continue;
      out.set(t, { graph: t, triples: 0, missing: true });
    }
  }
  return [...out.values()];
}

/** The active registered ontology an import names, by graph name or `oxl:ontologyIri`. */
export function resolveImport(schemas: SchemaGraph[], target: string): SchemaGraph | undefined {
  return schemas.find((s) => s.active && s.roles.includes('ontology') && (s.graph === target || s.iri === target));
}

/** Whether reasoning reads every graph because no ontology is registered (inactive ones count). */
export function reasoningReadsEveryGraph(r: Registry): boolean {
  return !r.entries.some((e) => e.role === 'ontology');
}

/** The active schemas that apply to `graph`: directly, through `oxl:AllGraphs`, or through a chain
 * of imports from an ontology that applies (transitive, cycles safe, inactive ones never followed). */
export function effectiveSchemas(r: Registry, graph: string, schemas = schemaGraphs(r)): Applying[] {
  if (SYSTEM_GRAPHS.includes(graph)) return [];
  const out = new Map<string, Applying>();
  for (const s of schemas) {
    if (!s.active || s.graph === graph) continue;
    if (s.appliesTo.length === 0) out.set(s.graph, { schema: s.graph, roles: s.roles, via: 'all' });
    else if (s.appliesTo.includes(graph)) out.set(s.graph, { schema: s.graph, roles: s.roles, via: 'direct' });
  }
  const queue: { schema: SchemaGraph; path: string[] }[] = [...out.values()]
    .filter((a) => a.roles.includes('ontology'))
    .map((a) => ({ schema: schemas.find((s) => s.graph === a.schema)!, path: [a.schema] }));
  while (queue.length) {
    const { schema, path } = queue.shift()!;
    for (const i of schema.imports) {
      const imported = resolveImport(schemas, i);
      if (!imported || out.has(imported.graph) || imported.graph === graph) continue;
      // Imports bring axioms only, whatever other roles the imported graph has.
      out.set(imported.graph, { schema: imported.graph, roles: ['ontology'], via: 'import', through: path });
      queue.push({ schema: imported, path: [...path, imported.graph] });
    }
  }
  return [...out.values()];
}

/** A short, readable name for a graph IRI: the last path segments without scheme and host. */
export function graphLabel(iri: string): string {
  if (iri === DEFAULT_GRAPH) return 'default graph';
  if (iri === ALL_GRAPHS) return 'All graphs';
  if (iri.startsWith('oxilite:')) return iri;
  // Opaque IRIs (urn:, tag:) read best whole.
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]*\/*(.*)$/i.exec(iri);
  if (!m) return iri;
  const rest = m[1].replace(/[/#]+$/, '');
  if (!rest) return iri;
  const parts = rest.split(/[/#]/).filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/');
}

export interface MappingOptions {
  /** One edge per data graph instead of an "All graphs" hub. */
  expandAll?: boolean;
  /** Draw the system graphs. */
  showSystem?: boolean;
}

/** The mapping graph: schema, data and system graphs as nodes, `appliesTo` and imports as edges. */
export function mappingGraph(r: Registry, options: MappingOptions = {}): Graph {
  const schemas = schemaGraphs(r);
  const data = dataGraphs(r);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const node = (id: string, label: string, classes: string[]) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, kind: 'iri', classes });
  };
  const edge = (source: string, target: string, label: string, classes: string[]) => {
    edges.push({ id: `e${edges.length}`, source, target, label, classes });
  };
  const size = (n: number | null) => (n === null ? '' : ` · ${n.toLocaleString()}`);

  for (const s of schemas) {
    const roles = s.roles.map((x) => ROLE_NAMES[x]).join(' + ');
    node(s.graph, `${graphLabel(s.graph)}\n${roles}${size(s.triples)}`, [
      'schema',
      ...s.roles.map((x) => `role-${x}`),
      ...(s.active ? [] : ['inactive']),
    ]);
  }
  for (const d of data) {
    node(d.graph, `${graphLabel(d.graph)}${d.missing ? '\n(no triples)' : size(d.triples)}`, ['data', ...(d.missing ? ['missing'] : [])]);
  }
  const present = data.filter((d) => !d.missing);
  for (const s of schemas) {
    const state = s.active ? [] : ['inactive'];
    if (s.appliesTo.length === 0) {
      if (options.expandAll) {
        for (const d of present) edge(s.graph, d.graph, 'all graphs', ['applies', 'via-all', ...state]);
      } else {
        node(ALL_GRAPHS, 'All graphs', ['all']);
        edge(s.graph, ALL_GRAPHS, 'applies to', ['applies', ...state]);
      }
    } else {
      for (const t of s.appliesTo) {
        if (nodes.has(t)) edge(s.graph, t, 'applies to', ['applies', ...state]);
      }
    }
    for (const i of s.imports) {
      const target = resolveImport(schemas, i);
      // An inactive ontology is registered but never imported.
      const idle = target ? undefined : schemas.find((x) => x.roles.includes('ontology') && (x.graph === i || x.iri === i));
      if (target) {
        edge(s.graph, target.graph, 'imports', ['imports', ...state]);
      } else if (idle) {
        edge(s.graph, idle.graph, 'imports', ['imports', 'inactive']);
      } else {
        // Recorded and ignored by oxilite: nothing registered (and active) answers to it.
        node(i, `${graphLabel(i)}\n(not registered)`, ['missing', 'external']);
        edge(s.graph, i, 'imports', ['imports', 'unresolved']);
      }
    }
  }
  if (options.showSystem) {
    for (const g of r.systemGraphs.present) node(g, g, ['system']);
    if (nodes.has(VOCABULARY_GRAPH) && nodes.has(SCHEMA_GRAPH)) edge(VOCABULARY_GRAPH, SCHEMA_GRAPH, 'applies to', ['applies', 'system']);
  }
  return { nodes: [...nodes.values()], edges, omitted: 0 };
}
