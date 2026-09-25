// The files "New Project" writes: a manifest, an ontology, data, a shape, rules, a query and two
// manifest tests that `oxilite check` passes. Pure, so it is tested without VS Code.
// @lat: [[architecture#Project manifest#New project and new database]]
import type { Profile } from './protocol';

export interface ScaffoldOptions {
  /** The project's name, used for labels and the database file name. */
  name: string;
  /** The namespace of the project's terms; a `/` is added unless it ends in `/` or `#`. */
  base: string;
  reasoning: Profile;
  /** A SQLite database path relative to the project, pinned by `queries/database.rq`. */
  database?: string;
}

export interface ScaffoldFile {
  path: string;
  content: string;
}

/** A file-name-safe form of a project name. */
export function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

/** The namespace for a base IRI as typed: trimmed, ending in `/` or `#`. */
export function namespace(base: string): string {
  const b = base.trim();
  return /[/#]$/.test(b) ? b : `${b}/`;
}

/** A base IRI is usable when it is absolute and has no characters an IRI reference forbids. */
export function validBase(base: string): boolean {
  return /^[a-z][a-z0-9+.-]*:[^\s<>"{}|\\^`]+$/i.test(base.trim());
}

export function scaffold(o: ScaffoldOptions): ScaffoldFile[] {
  const ns = namespace(o.base);
  const graphs = ns.endsWith('#') ? ns.slice(0, -1) + '/g/' : `${ns}g/`;
  const label = o.name.trim() || 'Project';
  const prefixes = (...names: string[]) =>
    [`@prefix ex: <${ns}> .`, ...names.map((n) => `@prefix ${n}: <${PREFIXES[n]}> .`)].join('\n');
  const files: ScaffoldFile[] = [
    {
      path: 'oxilite.toml',
      content: `# ${label}: an oxilite project. Graphs, roles, reasoning and tests are declared here.
reasoning = "${o.reasoning}"

[[graph]]
iri = "${graphs}data"
files = ["data/**/*.ttl"]

[[graph]]
iri = "${graphs}ontology"
files = ["ontology/*.ttl"]
role = "ontology"

[shapes]
files = ["shapes/*.ttl"]

[rules]
files = ["rules/*.dl"]

[[test]]
name = "whoever you know, you are connected to"
entails = "tests/entailed.ttl"

[[test]]
name = "an agent without a name is rejected"
data = "tests/nameless.ttl"
expect_violations = ["ex:AgentShape"]
`,
    },
    {
      path: 'ontology/ontology.ttl',
      content: `${prefixes('owl', 'rdfs', 'xsd')}

<${ns.replace(/[/#]$/, '')}/ontology> a owl:Ontology ;
  rdfs:label "${escape(label)} ontology" .

ex:Agent        a owl:Class ; rdfs:label "Agent" .
ex:Person       a owl:Class ; rdfs:label "Person" ; rdfs:subClassOf ex:Agent .
ex:Organization a owl:Class ; rdfs:label "Organization" ; rdfs:subClassOf ex:Agent .

ex:name     a owl:DatatypeProperty ; rdfs:label "name" ;
  rdfs:domain ex:Agent ; rdfs:range xsd:string .
ex:memberOf a owl:ObjectProperty ; rdfs:label "member of" ;
  rdfs:domain ex:Person ; rdfs:range ex:Organization .
ex:knows    a owl:ObjectProperty ; rdfs:label "knows" ;
  rdfs:domain ex:Person ; rdfs:range ex:Person .
`,
    },
    {
      path: 'data/data.ttl',
      content: `${prefixes()}

ex:alice a ex:Person ;
  ex:name "Alice" ;
  ex:memberOf ex:acme ;
  ex:knows ex:bob .

ex:bob a ex:Person ;
  ex:name "Bob" ;
  ex:knows ex:carol .

ex:carol a ex:Person ;
  ex:name "Carol" .

ex:acme a ex:Organization ;
  ex:name "Acme" .
`,
    },
    {
      path: 'shapes/shapes.ttl',
      content: `${prefixes('sh', 'xsd')}

ex:AgentShape a sh:NodeShape ;
  sh:targetClass ex:Agent ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
    sh:message "Every agent needs a name." ;
  ] .
`,
    },
    {
      path: 'rules/rules.dl',
      content: `${prefixes()}

% Whoever you know, directly or through others, you are connected to.
ex:connected(?x, ?y) :- ex:knows(?x, ?y).
ex:connected(?x, ?z) :- ex:knows(?x, ?y), ex:connected(?y, ?z).
`,
    },
    {
      path: 'queries/example.rq',
      content: `PREFIX ex: <${ns}>

# Everyone with a name, and who they are connected to (the rules infer ex:connected).
SELECT ?person ?name ?connected WHERE {
  ?person a ex:Person ;
    ex:name ?name .
  OPTIONAL { ?person ex:connected ?connected }
}
ORDER BY ?name
`,
    },
    {
      path: 'tests/entailed.ttl',
      content: `${prefixes()}

# Statements the project must entail.
ex:alice ex:connected ex:carol .
`,
    },
    {
      path: 'tests/nameless.ttl',
      content: `${prefixes()}

# Test data: an agent without a name, which the shape rejects.
ex:nobody a ex:Agent .
`,
    },
    {
      path: '.gitignore',
      content: `# oxilite studio's scratch store, rebuilt from the files.
.oxilite/
*.sqlite-wal
*.sqlite-shm
`,
    },
  ];
  if (o.database) {
    files.push({
      path: 'queries/database.rq',
      content: `# oxilite: connection = ${o.database} read-write
# This file runs on the project's SQLite database, not on the files: its updates persist.
# Fill it with "Import RDF File into Connection…" or an INSERT DATA update.
PREFIX ex: <${ns}>

SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100
`,
    });
  }
  return files;
}

/** Lines to add to an existing `.gitignore` so it covers what the scaffold's would. */
export function gitignoreAdditions(existing: string, scaffolded: string): string[] {
  const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  return scaffolded.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !have.has(l.trim()));
}

const PREFIXES: Record<string, string> = {
  owl: 'http://www.w3.org/2002/07/owl#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  sh: 'http://www.w3.org/ns/shacl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
