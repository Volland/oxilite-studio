## ADDED Requirements

### Requirement: Schema registry view
The extension SHALL show a connection's schema registry: its registered graphs with roles, active
flag, targets, imports, version and size, the registry's problems, and whether the system graphs
are installed at the current vocabulary version.

#### Scenario: Registered ontology
- **WHEN** a store registers `<https://ex.org/onto/hr>` as an ontology applying to
  `<https://ex.org/data/staff>` and the user shows the schema registry
- **THEN** the Registrations tab lists `onto/hr` with the role ontology, active, and the target
  `data/staff`

#### Scenario: Old server
- **WHEN** the server does not know `oxilite/registry`
- **THEN** the view says the server is too old instead of showing an empty registry

### Requirement: Mapping graph between named graphs
The view SHALL draw every named graph of the connection as a node styled by role, an edge from each
schema graph to each graph it applies to, and an edge from each ontology to each registered ontology
it imports. A schema applying to every graph SHALL link to an "All graphs" node, or to every data
graph when the user expands it. Inactive registrations SHALL be drawn faded, and targets holding no
triples SHALL be drawn as missing.

#### Scenario: Two datasets, one shared ontology
- **WHEN** `onto/zoo` applies to `data/zoo`, `onto/garden` to `data/garden` and `onto/common` to
  `oxl:AllGraphs`
- **THEN** the graph has an edge zoo→data/zoo, garden→data/garden and common→All graphs, and
  expanding All graphs replaces the last with edges to both data graphs

#### Scenario: Import
- **WHEN** `onto/zoo` records `oxl:imports <https://ex.org/core#>` and `onto/core` is registered
  with that `oxl:ontologyIri`
- **THEN** a dashed imports edge links `onto/zoo` to `onto/core`

### Requirement: Effective schemas per graph
For each data graph the view SHALL list the active schemas that apply to it and the reason: a
direct target, `oxl:AllGraphs` (or no target), or an import chain from a schema that applies. While
no ontology is registered, it SHALL say that reasoning reads every graph but the system graphs.

#### Scenario: Imported ontology applies transitively
- **WHEN** `onto/zoo` applies to `data/zoo` and imports the active `onto/core`, which applies only
  to `data/other`
- **THEN** `data/zoo` lists `onto/core` as applying through the import of `onto/zoo`

#### Scenario: Inactive ontology
- **WHEN** `onto/zoo` is deactivated
- **THEN** it applies to no graph and is not followed as an import

### Requirement: Manage the registry
From the view the user SHALL be able to register a graph with a role and targets, add a role,
change targets, activate, deactivate, unregister, drop a schema graph with its triples, and install
the system graphs. Edits on an attached store SHALL ask for confirmation, a read-only connection
SHALL refuse them, and the view SHALL refresh after each edit. An edit on the Project store SHALL be
reported as temporary until the next reload.

#### Scenario: Remap
- **WHEN** the user changes the targets of `onto/hr` on an attached store to All graphs and
  confirms
- **THEN** the registry records `oxl:appliesTo oxl:AllGraphs` for it, its other roles are kept, and
  the mapping graph links it to All graphs

#### Scenario: Project store edit
- **WHEN** the user deactivates an ontology on the Project store
- **THEN** the edit applies and the user is told the manifest rebuilds the registry on reload

### Requirement: Store Explorer shows registry roles
Graphs in the Store Explorer SHALL show their registry role (ontology, shapes, ShEx or system) and
targets, and a graph SHALL offer "Register as Schema Graph…".

#### Scenario: Registered graph in the explorer
- **WHEN** `onto/hr` is registered as an ontology for `data/staff`
- **THEN** its explorer entry shows "ontology → data/staff" next to its size
