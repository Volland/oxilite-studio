import { describe, expect, it } from 'vitest';
import { formatTerm, summarize, toTable } from '../shared/terms';
import type { QueryPayload, Term } from '../shared/protocol';

const iri = (value: string): Term => ({ termType: 'NamedNode', value });
const lit = (value: string, datatype = 'http://www.w3.org/2001/XMLSchema#string', language = ''): Term => ({
  termType: 'Literal',
  value,
  language,
  datatype: { termType: 'NamedNode', value: datatype },
});

describe('formatTerm', () => {
  // @lat: [[tests#Term formatting#Well-known prefixes shorten IRIs]]
  it('shortens IRIs under well-known prefixes and brackets the rest', () => {
    expect(formatTerm(iri('http://www.w3.org/2002/07/owl#Class'))).toBe('owl:Class');
    expect(formatTerm(iri('http://ex.org/alice'))).toBe('<http://ex.org/alice>');
    expect(formatTerm(iri('http://www.w3.org/2002/07/owl#a/b'))).toBe('<http://www.w3.org/2002/07/owl#a/b>');
  });

  // @lat: [[tests#Term formatting#Literals show language or datatype]]
  it('prints plain, language-tagged and typed literals', () => {
    expect(formatTerm(lit('Alice'))).toBe('"Alice"');
    expect(formatTerm(lit('chat', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', 'fr'))).toBe('"chat"@fr');
    expect(formatTerm(lit('42', 'http://www.w3.org/2001/XMLSchema#integer'))).toBe('"42"^^xsd:integer');
    expect(formatTerm(null)).toBe('');
    expect(formatTerm({ termType: 'BlankNode', value: 'b0' })).toBe('_:b0');
  });

  // @lat: [[tests#Term formatting#Triple terms nest]]
  it('prints triple terms recursively', () => {
    const t: Term = {
      termType: 'Quad',
      value: '',
      subject: iri('http://ex.org/a'),
      predicate: iri('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      object: lit('x'),
      graph: { termType: 'DefaultGraph', value: '' },
    };
    expect(formatTerm(t)).toBe('<< <http://ex.org/a> rdf:type "x" >>');
  });
});

describe('toTable', () => {
  // @lat: [[tests#Term formatting#Every payload becomes a table]]
  it('turns solutions, graphs and booleans into tables', () => {
    const graph: QueryPayload = {
      kind: 'quads',
      quads: [{ subject: iri('s'), predicate: iri('p'), object: iri('o'), graph: { termType: 'DefaultGraph', value: '' } }],
      elapsedMs: 1,
      truncated: false,
    };
    expect(toTable(graph)).toEqual({ columns: ['subject', 'predicate', 'object'], rows: [[iri('s'), iri('p'), iri('o')]] });
    const ask: QueryPayload = { kind: 'boolean', value: true, elapsedMs: 0.5, truncated: false };
    expect(formatTerm(toTable(ask).rows[0][0])).toBe('"true"^^xsd:boolean');
    expect(summarize({ kind: 'solutions', variables: ['x'], rows: [[null]], elapsedMs: 2, truncated: true })).toBe(
      '1 row (truncated) in 2.0 ms',
    );
  });
});
