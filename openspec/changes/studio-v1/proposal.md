## Why

Milestones S1 to v1.1 of `lat.md/milestones.md` turn the walking skeleton into the studio.

## What Changes

- Views: Connections, Store Explorer, Query History, resource view, SHACL report, "why?"
  proof trees, graph view, ontology diagram, rules debugger, plan view, Test Explorer.
- Languages: SPARQL, Turtle, Datalog, Cypher and ShEx registered and highlighted; run and
  explain for `.rq`, `.dl` and `.cypher`.
- Connections: attach SQLite files, local and remote D1 (tokens in secret storage, restored on
  restart), confirmations with billed-row estimates, materialize, import and export.
- Notebooks (`.oxnb`) with a renderer sharing the panels' components.
- MCP server registration and a copyable config.

## Capabilities

### Modified Capabilities
- `studio-extension`

## Impact

`src/`, `shared/`, `webview/`, `syntaxes/`, `test/`, `package.json`. Server side: oxilite
changes `studio-server-v1` and `inference-provenance`.
