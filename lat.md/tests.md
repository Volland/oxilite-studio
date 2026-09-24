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

### Bad query rejects

A query that does not parse rejects the request instead of crashing the server.
