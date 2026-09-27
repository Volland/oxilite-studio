import { describe, expect, it } from 'vitest';
import type { Registry, RegistryEntry } from '../shared/protocol';
import { ALL_GRAPHS, dataGraphs, effectiveSchemas, graphLabel, mappingGraph, reasoningReadsEveryGraph, schemaGraphs } from '../shared/registry';

const ex = (path: string) => `https://ex.org/${path}`;

function entry(graph: string, over: Partial<RegistryEntry> = {}): RegistryEntry {
  return { graph: ex(graph), role: 'ontology', iri: null, version: null, sha256: null, imports: [], appliesTo: [ALL_GRAPHS], active: true, loadedAt: null, ...over };
}

function registry(entries: RegistryEntry[], graphs: string[], over: Partial<Registry> = {}): Registry {
  return {
    entries,
    graphs: graphs.map((g) => ({ graph: ex(g), triples: 10 })),
    ownImports: [],
    problems: [],
    systemGraphs: { present: [], current: false },
    ephemeral: false,
    readOnly: false,
    ...over,
  };
}

/** The zoo, garden and common ontologies of docs/schema-registry.md. */
const zooGarden = registry(
  [
    entry('onto/zoo', { appliesTo: [ex('data/zoo')] }),
    entry('onto/garden', { appliesTo: [ex('data/garden')] }),
    entry('onto/common'),
  ],
  ['onto/zoo', 'onto/garden', 'onto/common', 'data/zoo', 'data/garden'],
);

const edges = (r: Registry, expandAll = false) =>
  mappingGraph(r, { expandAll }).edges.map((e) => `${graphLabel(e.source)} -${e.label}-> ${graphLabel(e.target)}`);

describe('schema registry', () => {
  // @lat: [[tests#Schema registry#Roles merge and data graphs are the rest]]
  it('merges roles per graph and lists the unregistered graphs as data', () => {
    const r = registry(
      [entry('onto/hr', { appliesTo: [ex('data/staff'), ex('data/gone')] }), entry('onto/hr', { role: 'shacl', appliesTo: [ex('data/staff'), ex('data/gone')] })],
      ['onto/hr', 'data/staff'],
      { graphs: [{ graph: ex('onto/hr'), triples: 4 }, { graph: ex('data/staff'), triples: 9 }, { graph: 'oxilite:schema', triples: 12 }] },
    );
    const [hr] = schemaGraphs(r);
    expect(hr.roles).toEqual(['ontology', 'shacl']);
    expect(hr.triples).toBe(4);
    expect(dataGraphs(r)).toEqual([
      { graph: ex('data/staff'), triples: 9, missing: false },
      { graph: ex('data/gone'), triples: 0, missing: true },
    ]);
  });

  // @lat: [[tests#Schema registry#Mapping graph links schemas to graphs]]
  it('draws applies-to edges, an All graphs hub, and expands it on request', () => {
    expect(edges(zooGarden)).toEqual(['onto/zoo -applies to-> data/zoo', 'onto/garden -applies to-> data/garden', 'onto/common -applies to-> All graphs']);
    expect(edges(zooGarden, true)).toEqual([
      'onto/zoo -applies to-> data/zoo',
      'onto/garden -applies to-> data/garden',
      'onto/common -all graphs-> data/zoo',
      'onto/common -all graphs-> data/garden',
    ]);
    const g = mappingGraph(zooGarden);
    expect(g.nodes.find((n) => n.id === ex('onto/zoo'))?.classes).toEqual(['schema', 'role-ontology']);
    expect(g.nodes.find((n) => n.id === ex('data/zoo'))?.classes).toEqual(['data']);
  });

  // @lat: [[tests#Schema registry#Imports resolve by graph or ontology IRI]]
  it('links imports by graph name or ontology IRI, and marks unresolved and inactive ones', () => {
    const r = registry(
      [
        entry('onto/zoo', { appliesTo: [ex('data/zoo')], imports: ['https://ex.org/core#'] }),
        entry('onto/core', { appliesTo: [ex('data/other')], iri: 'https://ex.org/core#' }),
        entry('onto/old', { active: false }),
      ],
      ['onto/zoo', 'onto/core', 'onto/old', 'data/zoo', 'data/other'],
      { ownImports: [{ graph: ex('onto/core'), imports: [ex('onto/old'), 'http://xmlns.com/foaf/0.1/'] }] },
    );
    expect(edges(r)).toContain('onto/zoo -imports-> onto/core');
    const g = mappingGraph(r);
    expect(g.edges.find((e) => e.target === ex('onto/old'))?.classes).toEqual(['imports', 'inactive']);
    expect(g.nodes.find((n) => n.id === 'http://xmlns.com/foaf/0.1/')?.classes).toEqual(['missing', 'external']);
  });

  // @lat: [[tests#Schema registry#Effective schemas follow oxilite's rules]]
  it('applies schemas directly, through All graphs and through transitive imports, never inactive ones', () => {
    expect(effectiveSchemas(zooGarden, ex('data/zoo')).map((a) => [a.schema, a.via])).toEqual([
      [ex('onto/zoo'), 'direct'],
      [ex('onto/common'), 'all'],
    ]);
    const chain = registry(
      [
        entry('onto/zoo', { appliesTo: [ex('data/zoo')], imports: ['https://ex.org/core#'] }),
        entry('onto/core', { appliesTo: [ex('data/other')], iri: 'https://ex.org/core#', imports: [ex('onto/base')] }),
        entry('onto/base', { appliesTo: [ex('data/other')], imports: [ex('onto/zoo')] }),
      ],
      ['data/zoo', 'data/other'],
    );
    const zoo = effectiveSchemas(chain, ex('data/zoo'));
    expect(zoo.map((a) => [a.schema, a.via, a.through])).toEqual([
      [ex('onto/zoo'), 'direct', undefined],
      [ex('onto/core'), 'import', [ex('onto/zoo')]],
      [ex('onto/base'), 'import', [ex('onto/zoo'), ex('onto/core')]],
    ]);
    const off = { ...chain, entries: chain.entries.map((e) => (e.graph === ex('onto/core') ? { ...e, active: false } : e)) };
    expect(effectiveSchemas(off, ex('data/zoo')).map((a) => a.schema)).toEqual([ex('onto/zoo')]);
    expect(effectiveSchemas(off, ex('data/other')).map((a) => a.schema)).toEqual([ex('onto/base'), ex('onto/zoo')]);
  });

  // @lat: [[tests#Schema registry#Without ontologies reasoning reads every graph]]
  it('reports the every-graph fallback only while no ontology is registered, active or not', () => {
    expect(reasoningReadsEveryGraph(registry([], ['data/zoo']))).toBe(true);
    expect(reasoningReadsEveryGraph(registry([entry('shapes', { role: 'shacl' })], []))).toBe(true);
    expect(reasoningReadsEveryGraph(registry([entry('onto/zoo', { active: false })], []))).toBe(false);
  });

  // @lat: [[tests#Schema registry#Graph labels are short]]
  it('labels graphs by their last path segments', () => {
    expect(graphLabel('https://ex.org/onto/hr')).toBe('onto/hr');
    expect(graphLabel('file:///home/me/project/data/people.ttl')).toBe('data/people.ttl');
    expect(graphLabel('https://ex.org/core#')).toBe('core');
    expect(graphLabel('urn:x:staff')).toBe('urn:x:staff');
    expect(graphLabel('https://oxilite.dev/ns#DefaultGraph')).toBe('default graph');
    expect(graphLabel('oxilite:schema')).toBe('oxilite:schema');
  });
});
