import { describe, expect, it } from 'vitest';
import { formatCypher } from '../shared/terms';
import { fromCypher, fromDescription, fromQuads } from '../shared/graph';
import type { Term } from '../shared/protocol';

const iri = (value: string): Term => ({ termType: 'NamedNode', value });
const lit = (value: string): Term => ({ termType: 'Literal', value, language: '', datatype: { termType: 'NamedNode', value: 'http://www.w3.org/2001/XMLSchema#string' } });

describe('graph view models', () => {
  // @lat: [[tests#Graph view#Triples become nodes and edges]]
  it('turns triples into nodes and labelled edges, each literal its own node', () => {
    const g = fromQuads([
      { subject: iri('http://ex.org/alice'), predicate: iri('http://ex.org/knows'), object: iri('http://ex.org/bob') },
      { subject: iri('http://ex.org/alice'), predicate: iri('http://ex.org/name'), object: lit('Alice') },
      { subject: iri('http://ex.org/bob'), predicate: iri('http://ex.org/name'), object: lit('Bob') },
    ]);
    expect(g.nodes.map((n) => n.label)).toEqual(['alice', 'bob', '"Alice"', '"Bob"']);
    expect(g.edges.map((e) => e.label)).toEqual(['knows', 'name', 'name']);
  });

  // @lat: [[tests#Graph view#Cypher paths are drawn]]
  it('collects nodes and relationships from Cypher paths and values', () => {
    const node = (id: string, name: string) => ({ type: 'node', id, labels: ['Person'], properties: { name } });
    const rows = [[{ type: 'path', nodes: [node('a', 'Alice'), node('b', 'Bob')], relationships: [{ type: 'relationship', id: 'r', relType: 'knows', start: 'a', end: 'b', properties: {} }] }]];
    const g = fromCypher(rows);
    expect(g.nodes.map((n) => n.label)).toEqual(['Alice', 'Bob']);
    expect(g.edges).toEqual([{ id: 'e0', source: 'a', target: 'b', label: 'knows', inferred: undefined }]);
    expect(formatCypher(node('a', 'Alice'))).toBe('(:Person {name: Alice})');
    expect(formatCypher([1, 'x'])).toBe('[1, x]');
  });

  // @lat: [[tests#Graph view#Neighbourhood marks inferences]]
  it('draws a resource neighbourhood with inferred edges marked', () => {
    const g = fromDescription({
      iri: 'http://ex.org/carol',
      outgoing: [{ p: iri('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), o: iri('http://ex.org/Person'), inferred: true, producers: ['owl2rl'] }],
      incoming: [{ s: iri('http://ex.org/dan'), p: iri('http://ex.org/knows'), inferred: false, producers: null }],
      truncated: false,
      definitions: [],
    });
    expect(g.nodes).toHaveLength(3);
    expect(g.edges.map((e) => [e.label, e.inferred])).toEqual([['rdf:type', true], ['knows', false]]);
  });
});

describe('ontology diagram', () => {
  // @lat: [[tests#Graph view#Ontology diagram]]
  it('draws classes with their datatype properties, subclass and object property edges', async () => {
    const { fromOntology } = await import('../shared/graph');
    const g = fromOntology({
      classes: [{ iri: 'http://ex.org/Person', instances: 2 }, { iri: 'http://ex.org/Company', instances: 0 }],
      subclass: [['http://ex.org/Employee', 'http://ex.org/Person']],
      properties: [
        { iri: 'http://ex.org/name', domain: 'http://ex.org/Person', range: 'http://www.w3.org/2001/XMLSchema#string', datatype: true },
        { iri: 'http://ex.org/worksFor', domain: 'http://ex.org/Employee', range: 'http://ex.org/Company', datatype: false },
      ],
    });
    expect(g.nodes.find((n) => n.id === 'http://ex.org/Person')?.label).toBe('Person (2)\nname');
    expect(g.edges.map((e) => [e.source.replace(/.*\//, ''), e.label, e.target.replace(/.*\//, '')])).toEqual([
      ['Employee', 'subClassOf', 'Person'],
      ['Employee', 'worksFor', 'Company'],
    ]);
  });
});
