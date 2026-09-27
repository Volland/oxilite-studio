---
lat:
  require-code-mention: true
---
# Tests

Test specifications implemented in `test/` and run with `npm test`; each leaf is referenced by one `@lat:` comment next to its test.

## Term formatting

How the views print RDF/JS terms and turn payloads into tables, see [[architecture#Views#Results grid]].

### Well-known prefixes shorten IRIs

IRIs under rdf, rdfs, owl, xsd, sh and skos print as prefixed names when the local part is a plain name; others print in angle brackets.

### Literals show language or datatype

Plain strings print quoted, language-tagged strings with their tag, other literals with their datatype; unbound cells are empty and blank nodes print as `_:label`.

### Triple terms nest

An RDF 1.2 triple term prints as `<< s p o >>` with each part formatted recursively.

### Every payload becomes a table

Graph results become subject, predicate and object rows, a boolean becomes one typed cell, and the summary counts rows and flags truncation.

## Graph view

The node-link models the graph view draws, see [[architecture#Views#Graph view]].

### Triples become nodes and edges

Subjects and objects become nodes with short labels, each literal its own node, and predicates labelled edges.

### Cypher paths are drawn

Nodes and relationships are collected from paths, and Cypher values print as `(:Label {…})` and lists.

### Ontology diagram

Classes carry their instance counts and datatype properties; subclass links and object properties from domain to range become edges.

### Neighbourhood marks inferences

A resource's statements become its neighbours, with inferred edges flagged.

## Server end to end

The real `oxilite studio-server` binary driven over stdio with `vscode-jsonrpc`, the transport the language client uses; skipped when no binary is found (`OXILITE_BIN` or `../oxilite/target/release/oxilite`).

### Status reports the workspace

After initialize with a workspace folder, `oxilite/status` counts its file and triples and `oxilite/storeChanged` has been sent.

### Query payload renders

A SELECT and a CONSTRUCT come back in shapes `toTable` and `formatTerm` render, with language tags and datatypes intact.

### Rules, Cypher and why

A Datalog goal and a Cypher path come back in the shapes the views use (the path draws as a graph), a workspace rule's conclusion is explained down to an asserted premise, and the explorer lists its folders.

### Attaching a new path creates the database

Attaching a SQLite path that does not exist creates the file as an empty, active, read-write connection whose confirmed updates persist; detaching returns to the Project store.

### Registry round trip

On an attached store, a registry edit needs confirmation; registered ontologies come back with the imports asserted in their graphs, and the shared functions derive direct, import and All-graphs mappings from the payload.

### Bad query rejects

A query that does not parse rejects the request instead of crashing the server.

## Schema registry

How the registry view reads a registry payload, see [[architecture#Views#Schema registry view]].

### Roles merge and data graphs are the rest

A graph registered with two roles is one schema graph; unregistered, non-system graphs are data, and a target holding no triples is listed as missing.

### Mapping graph links schemas to graphs

Each schema links to its targets, a schema for every graph links to an "All graphs" node, and expanding it links it to every data graph instead.

### Imports resolve by graph or ontology IRI

An import links to the registered ontology whose graph name or `oxl:ontologyIri` it names; one naming an inactive ontology is drawn inactive, one naming nothing registered as an unresolved node.

### Effective schemas follow oxilite's rules

A schema applies directly or through `oxl:AllGraphs`, imports are followed transitively through active ontologies only, and an import cycle ends.

### Without ontologies reasoning reads every graph

The every-graph fallback holds only while no ontology is registered; an inactive ontology still counts as registered.

### Graph labels are short

Hierarchical IRIs are shown by their last two path segments, opaque IRIs (`urn:`) and system graphs whole, the default graph by name.

## Pins

Pin comments and connection references, which decide where a query file or notebook runs.

### Each language pins in its own comments

SPARQL pins with `#`, Datalog with `%` or `#`, Cypher with `//`; a marker from another language is not a pin, and `read-write` makes a SQLite pin writable.

### A pin cannot hide below the query

Only the leading comment block is read, so a pin-like comment after the first query line is ignored.

### References round-trip and resolve

A reference survives being saved to notebook metadata, resolves to the server's connection id, and a workspace path is stored relative to the workspace, with `/` separators on every platform (so a notebook saved on Windows opens elsewhere).

## New project

The files "New Project…" writes, see [[architecture#Project manifest#New project and new database]].

### Names and namespaces are normalized

A project name becomes a file-safe slug, a base IRI gains a trailing `/` unless it ends in `/` or `#`, and only absolute IRIs without forbidden characters are accepted.

### The database query is pinned

With a database, `queries/database.rq` carries a read-write pin to it, and an existing `.gitignore` gets only the lines it lacks.

### A new project passes oxilite check

The scaffold written to an empty folder passes `oxilite check` (both manifest tests, no SHACL violations) under every reasoning profile; skipped when no binary is found.
