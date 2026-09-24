// How the views print terms and turn any payload into a table.
// @lat: [[architecture#Views#Results grid]]
import type { QueryPayload, Term } from './protocol';

const PREFIXES: [string, string][] = [
  ['rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'],
  ['rdfs', 'http://www.w3.org/2000/01/rdf-schema#'],
  ['owl', 'http://www.w3.org/2002/07/owl#'],
  ['xsd', 'http://www.w3.org/2001/XMLSchema#'],
  ['sh', 'http://www.w3.org/ns/shacl#'],
  ['skos', 'http://www.w3.org/2004/02/skos/core#'],
];

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RDF_LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
const RDF_DIR_LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString';

/** An IRI as a prefixed name when a well-known prefix covers it, else in angle brackets. */
export function formatIri(iri: string): string {
  for (const [prefix, ns] of PREFIXES) {
    const local = iri.slice(ns.length);
    if (iri.startsWith(ns) && /^[A-Za-z_][\w-]*$/.test(local)) return `${prefix}:${local}`;
  }
  return `<${iri}>`;
}

export function formatTerm(term: Term | null): string {
  if (term === null) return '';
  switch (term.termType) {
    case 'NamedNode':
      return formatIri(term.value);
    case 'BlankNode':
      return `_:${term.value}`;
    case 'Literal': {
      const lexical = JSON.stringify(term.value);
      if (term.language) return `${lexical}@${term.language}${term.direction ? `--${term.direction}` : ''}`;
      const dt = term.datatype.value;
      if (dt === XSD_STRING || dt === RDF_LANG_STRING || dt === RDF_DIR_LANG_STRING) return lexical;
      if (dt === 'urn:oxilite:cypher') return term.value;
      return `${lexical}^^${formatIri(dt)}`;
    }
    case 'Quad':
      return `<< ${formatTerm(term.subject)} ${formatTerm(term.predicate)} ${formatTerm(term.object)} >>`;
    case 'DefaultGraph':
      return '';
  }
}

export interface Table {
  columns: string[];
  rows: (Term | null)[][];
}

/** A Cypher value as text: nodes as `(:Label {…})`, relationships as `[:TYPE]`, paths by length. */
export function formatCypher(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return typeof v === 'string' ? v : JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(formatCypher).join(', ')}]`;
  const o = v as Record<string, unknown>;
  const props = (p: unknown) => {
    const entries = Object.entries((p ?? {}) as Record<string, unknown>);
    return entries.length ? ` {${entries.map(([k, x]) => `${k}: ${formatCypher(x)}`).join(', ')}}` : '';
  };
  switch (o.type) {
    case 'node':
      return `(${(o.labels as string[]).map((l) => `:${l}`).join('')}${props(o.properties)})`;
    case 'relationship':
      return `[:${o.relType as string}${props(o.properties)}]`;
    case 'path':
      return `path of ${(o.relationships as unknown[]).length} hops`;
    default:
      if ('value' in o && 'kind' in o) return String(o.value);
      return `{${Object.entries(o).map(([k, x]) => `${k}: ${formatCypher(x)}`).join(', ')}}`;
  }
}

/** Solutions as they are, graphs as subject/predicate/object rows, booleans as one cell. */
export function toTable(payload: QueryPayload): Table {
  switch (payload.kind) {
    case 'solutions':
      return { columns: payload.variables, rows: payload.rows };
    case 'quads':
      return {
        columns: ['subject', 'predicate', 'object'],
        rows: payload.quads.map((q) => [q.subject, q.predicate, q.object]),
      };
    case 'update':
      return { columns: [], rows: [] };
    case 'cypher':
      // Cypher values are not RDF terms: carry their text as plain literals.
      return {
        columns: payload.columns,
        rows: payload.rows.map((r) =>
          r.map((v) => (v === null ? null : { termType: 'Literal', value: formatCypher(v), language: '', datatype: { termType: 'NamedNode', value: 'urn:oxilite:cypher' } })),
        ),
      };
    case 'boolean':
      return {
        columns: ['result'],
        rows: [[{ termType: 'Literal', value: String(payload.value), language: '', datatype: { termType: 'NamedNode', value: 'http://www.w3.org/2001/XMLSchema#boolean' } }]],
      };
  }
}

/** A one-line summary for the results header, with D1's billed rows when present. */
export function summarize(payload: QueryPayload): string {
  const base = summarizeResult(payload);
  const b = payload.d1;
  return b ? `${base} · D1: ${b.requests} requests, ${b.rowsRead} rows read, ${b.rowsWritten} written` : base;
}

function summarizeResult(payload: QueryPayload): string {
  const ms = `${payload.elapsedMs.toFixed(1)} ms`;
  const more = payload.truncated ? ' (truncated)' : '';
  switch (payload.kind) {
    case 'solutions':
      return `${payload.rows.length} row${payload.rows.length === 1 ? '' : 's'}${more} in ${ms}`;
    case 'quads':
      return `${payload.quads.length} triple${payload.quads.length === 1 ? '' : 's'}${more} in ${ms}`;
    case 'boolean':
      return `${payload.value} in ${ms}`;
    case 'cypher': {
      const changes = Object.entries(payload.stats).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
      const rows = `${payload.rows.length} row${payload.rows.length === 1 ? '' : 's'}${more}`;
      return `${rows}${changes.length ? `, ${changes.join(', ')}` : ''} in ${ms}${payload.writes && payload.ephemeral ? ' (Project store: discarded on the next reload)' : ''}`;
    }
    case 'update': {
      const sign = payload.delta > 0 ? '+' : '';
      const note = payload.ephemeral ? ' (Project store: discarded on the next reload)' : '';
      return `update applied, ${sign}${payload.delta} triples in ${ms}${note}`;
    }
  }
}
