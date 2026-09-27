## Decisions

- **Server reads, studio reasons about the mapping.** `oxilite/registry` returns what the store's
  own reader sees (`Store::schema_graphs`, so short forms, two roles per graph and the lenient
  `oxl:active` rules behave exactly as in oxilite). The effective mapping per data graph is a pure
  TypeScript function over that payload (`shared/registry.ts`), so it is unit-tested without a
  server and the same payload can later be rendered in a notebook output.
- **Edits go through oxilite's registry API**, not SPARQL written in the extension: register,
  remap, activate, unregister and drop are `Store` methods that rebuild the reasoning closure and
  shape index atomically. Adding a second role is the documented `INSERT DATA` of one `rdf:type`
  triple, since `register_schema_graph` replaces the whole description.
- **Same confirmation rules as updates.** An edit on an attached store fails with 1001 until
  confirmed; read-only connections refuse. Drop asks once in the extension, naming the triples it
  deletes, and is sent confirmed.
- **The Project store's registry is derived.** It comes from `[[graph]] role = "ontology"` and
  `applies_to` in `oxilite.toml` and is rebuilt on reload (decision S3). Edits there are allowed for
  experiments but marked temporary, and the view points at the manifest. Writing the manifest from
  the view is a later change.
- **One graph model for all drawings.** The mapping graph is a `Graph` from `shared/graph.ts`,
  extended with optional `classes` on nodes and edges so the Cytoscape view can style roles,
  inactive and missing graphs without a second renderer. Selecting a node in the registry view
  selects the graph (details and actions) instead of opening the resource view.
- **`oxl:AllGraphs` as a hub by default.** With many data graphs, one edge per graph per global
  schema drowns the specific mappings; a toggle expands it.
- **D1 costs.** On remote D1 graph sizes are not counted (a billed scan); the graph list is still
  read.

## Non-goals

Editing `oxilite.toml` from the view, recording `oxl:version`, `oxl:ontologyIri` or `oxl:imports`
from the pickers (SPARQL still does it), drift verification against a file (`registry verify`),
and per-graph shape-index scoping (an oxilite limit: the Cypher shape index ignores mappings, which
the view states).
