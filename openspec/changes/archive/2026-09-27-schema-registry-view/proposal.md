## Why

oxilite 0.5 to 0.7 moved the schema registry into the data: `<oxilite:schema>` is a named graph
describing which graphs hold ontologies, SHACL shapes or ShEx (`oxl:OntologyGraph`,
`oxl:ShapesGraph`, `oxl:ShExGraph`), which graphs each one applies to (`oxl:appliesTo`, with
`oxl:AllGraphs` and `oxl:DefaultGraph`), whether it is active, what it imports (`oxl:imports`, and
`owl:imports` in the ontology itself), plus the system graphs `<oxilite:schema>` and
`<oxilite:vocabulary>` (vocabulary 2.1). The mapping decides what query-time reasoning sees per
graph, so a wrong mapping silently changes answers.

The studio shows none of it. The only way to see or change the registry is the CLI or hand-written
SPARQL, the Store Explorer lists `<oxilite:schema>` as one more graph, and nothing answers "which
ontologies apply to this data graph, and why?".

## What Changes

- **Schema Registry view.** "oxilite: Show Schema Registry" (Store Explorer title bar, Connections
  item menu, command palette) opens a panel for a connection with three tabs:
  - **Mapping graph**: every named graph as a node, coloured by role (ontology, shapes, ShEx, data,
    system), with `appliesTo` edges from schema to data graphs, `imports` edges between ontologies,
    an "All graphs" hub (or, toggled, one edge per data graph), inactive registrations faded and
    mapping targets that hold no triples drawn as missing.
  - **Registrations**: one row per registered graph with its roles, active flag, targets, imports,
    version, digest, load time and size.
  - **Per graph**: for each data graph, the schemas that apply to it and why: directly, through
    `oxl:AllGraphs`, or through an import chain. This follows oxilite's rules (only active
    registrations, transitive imports matched by graph name or `oxl:ontologyIri`, the "no ontology
    registered means every graph" fallback).
  - Registry problems (`registry_problems`, the checks of `oxl:RegistrationShape`) and a stale or
    missing system-graph install show as warnings at the top.
- **Manage from the view.** Selecting a graph shows its details and actions: register (role and
  targets from pickers), add a role, change targets, activate or deactivate, unregister, drop with
  its triples, and install or refresh the system graphs. Writes to attached stores ask first, like
  any update; on the Project store they are marked temporary, since the manifest rebuilds the
  registry on reload, and the view offers to open `oxilite.toml`.
- **Store Explorer knows roles.** Graphs in the explorer show their registry role and targets, and
  a graph's context menu offers "Register as Schema Graph…".
- **Server (oxilite change `studio-server-registry`):** `oxilite/registry` returns the registry of a
  connection (entries, graphs with sizes, asserted `owl:imports`, problems, system-graph state) and
  `oxilite/registryEdit` applies one edit through oxilite's registry API.

## Capabilities

### Modified Capabilities
- `studio-extension`

## Impact

`shared/registry.ts` (new, pure: effective mapping and the mapping graph), `shared/graph.ts`
(node and edge classes), `shared/protocol.ts`, `src/registry.ts` (new: command and edit flows),
`src/extension.ts`, `webview/src/registryView.tsx` (new), `webview/src/graphView.tsx`,
`package.json`. The server change lives in the oxilite repository. Needs an oxilite binary with the
new requests; older servers answer "unknown method" and the view says so.
