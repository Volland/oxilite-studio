// The custom requests of `oxilite studio-server` and the payloads the views render.
// Payloads are plain JSON so a view can persist them (webview state, later notebook outputs).
// @lat: [[architecture#Server protocol]]

/** An RDF/JS term as `oxilite_core::json::term_to_json` writes it. */
export type Term =
  | { termType: 'NamedNode'; value: string }
  | { termType: 'BlankNode'; value: string }
  | { termType: 'Literal'; value: string; language: string; direction?: 'ltr' | 'rtl'; datatype: { termType: 'NamedNode'; value: string } }
  | { termType: 'Quad'; value: ''; subject: Term; predicate: Term; object: Term; graph: Term }
  | { termType: 'DefaultGraph'; value: '' };

interface Timing {
  elapsedMs: number;
  truncated: boolean;
  /** On D1: what this request cost. */
  d1?: Billing;
}

export type QueryPayload =
  | ({ kind: 'solutions'; variables: string[]; rows: (Term | null)[][] } & Timing)
  | ({ kind: 'boolean'; value: boolean } & Timing)
  | ({ kind: 'quads'; quads: { subject: Term; predicate: Term; object: Term; graph: Term }[] } & Timing)
  | ({ kind: 'update'; ephemeral: boolean; delta: number } & Timing)
  | ({ kind: 'cypher'; columns: string[]; rows: unknown[][]; writes: boolean; ephemeral: boolean; stats: Record<string, number> } & Timing);

export interface QueryParams {
  query: string;
  limit?: number;
  connection?: string;
  /** Required for updates on a persistent store; see `NEEDS_CONFIRMATION`. */
  confirmed?: boolean;
}

/** The server's error code for an update that needs the user's confirmation. */
export const NEEDS_CONFIRMATION = 1001;

export interface Plan {
  kind: 'sparql' | 'datalog' | 'cypher';
  text: string;
}

export interface Billing {
  requests: number;
  rowsRead: number;
  rowsWritten: number;
}

export interface Connection {
  id: string;
  kind: 'project' | 'sqlite' | 'd1' | 'd1-local';
  label: string;
  path: string;
  readOnly: boolean;
  active: boolean;
  /** Not counted on remote D1 (a billed scan). */
  triples: number | null;
  billing?: Billing | null;
}

export interface LocationJson {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface Description {
  iri: string;
  outgoing: { p: Term; o: Term; inferred: boolean; producers: string[] | null }[];
  incoming: { s: Term; p: Term; inferred: boolean; producers: string[] | null }[];
  truncated: boolean;
  definitions: LocationJson[];
}

export interface ExplorerNode {
  id: string;
  label: string;
  description: string;
  kind: 'folder' | 'graph' | 'class' | 'property' | 'data' | 'ontology' | 'shapes' | 'rules' | 'prefix';
  collapsible: boolean;
  iri?: string;
  uri?: string;
}

export interface ValidationResultJson {
  focus: string;
  path: string | null;
  value: string | null;
  severity: 'violation' | 'warning' | 'info';
  component: string;
  message: string;
  shape: string | null;
  location: LocationJson | null;
  shapeLocation: LocationJson | null;
}

export interface ValidationReport {
  conforms: boolean | null;
  inferred?: boolean;
  error?: string;
  results: ValidationResultJson[];
}

export type Profile = 'none' | 'rdfs' | 'owlql' | 'owl2rl';

/** A justification: an asserted leaf, or an inference with the rule and premises behind it. */
export interface ProofNode {
  triple: { s: Term; p: Term; o: Term };
  status: 'asserted' | 'inferred' | 'absent';
  location?: LocationJson | null;
  producer?: string;
  producers?: string[];
  rule?: string;
  note?: string;
  premises?: ProofNode[];
}

export interface KgTest {
  name: string;
  uri: string | null;
  line: number;
  snapshot: boolean;
}

export interface KgTestOutcome {
  name: string;
  passed: boolean;
  message: string;
  expected: string | null;
  actual: string | null;
  millis: number;
}

export interface StoreStatus {
  store: string;
  root: string | null;
  triples: number;
  profile: Profile;
  manifest: boolean;
  shapes: number;
  rules: number;
  files: { uri: string; role: string; graph: string; triples: number; error: string | null }[];
}

export const Methods = {
  query: 'oxilite/query',
  explain: 'oxilite/explain',
  describe: 'oxilite/describe',
  status: 'oxilite/status',
  reload: 'oxilite/reload',
  connections: 'oxilite/connections',
  attach: 'oxilite/attach',
  attachD1: 'oxilite/attachD1',
  localD1: 'oxilite/localD1',
  materialize: 'oxilite/materialize',
  detach: 'oxilite/detach',
  activate: 'oxilite/activate',
  datalog: 'oxilite/datalog',
  cypher: 'oxilite/cypher',
  import: 'oxilite/import',
  export: 'oxilite/export',
  explorer: 'oxilite/explorer',
  setReasoning: 'oxilite/setReasoning',
  validationReport: 'oxilite/validationReport',
  why: 'oxilite/why',
  ontology: 'oxilite/ontology',
  datalogDebug: 'oxilite/datalogDebug',
  tests: 'oxilite/tests',
  runTest: 'oxilite/runTest',
  updateSnapshot: 'oxilite/updateSnapshot',
  validate: 'oxilite/validate',
  storeChanged: 'oxilite/storeChanged',
  connectionsChanged: 'oxilite/connectionsChanged',
  validationStarted: 'oxilite/validationStarted',
  validationChanged: 'oxilite/validationChanged',
} as const;

/** Messages from the extension to a results webview. */
export type ToView =
  | { type: 'running'; title: string }
  | { type: 'result'; title: string; payload: QueryPayload }
  | { type: 'plan'; title: string; plan: Plan }
  | { type: 'resource'; title: string; description: Description; graph?: boolean }
  | { type: 'report'; title: string; report: ValidationReport }
  | { type: 'why'; title: string; tree: ProofNode }
  | { type: 'graph'; title: string; graph: import('./graph').Graph }
  | {
      type: 'debug';
      title: string;
      uri: string;
      rules: { index: number; line: number; head: string; rule: string; bodyMatches: number | null; facts: number | null; error: string | null }[];
      plan: string;
      cap: number;
    }
  | { type: 'error'; title: string; message: string };

/** Messages from a webview back to the extension. */
export type FromView =
  | { type: 'openResource'; iri: string }
  | { type: 'openLocation'; location: LocationJson }
  | { type: 'why'; s: Term; p: Term; o: Term };
