# Architecture

How oxilite studio is built: a Rust language server that embeds oxilite, and a thin VS Code extension with React webviews.

## Process model

The extension spawns `oxilite studio-server` over stdio and speaks LSP plus custom `oxilite/*` JSON-RPC requests; all engine work happens in that process.

Why a separate process: [[decisions#S2 Rust language server as a separate process]]. The server links `oxilite`, `oxilite-reason`, `oxilite-validate`, `oxilite-datalog` and `oxilite-cypher`. Long operations (materialization, validation, large queries) report progress and honour `$/cancelRequest`. The TypeScript client owns commands, tree views, the status bar and webviews, and holds no engine state.

## Server protocol

Beyond standard LSP, the server answers `oxilite/query`, `oxilite/status` and `oxilite/reload` and sends `oxilite/storeChanged`; the types are in [[shared/protocol.ts]].

Query results are the RDF/JS JSON oxilite's JavaScript packages already use (`output_to_json`), plus `elapsedMs` and `truncated` (rows beyond `oxilite.query.rowLimit` are dropped). An update answers `kind: "update"`; on an attached store it first fails with code 1001 and the client asks the user before re-sending it `confirmed`. `oxilite/explain` feeds the plan view, and the connection requests feed the Connections view. Load errors arrive as ordinary `publishDiagnostics`, and watched RDF files trigger a full reload (per-file reload is S2). The server side is documented in oxilite's `lat.md` under "Studio server".

## Connections

A connection is a Project store (derived from workspace files) or an Attached store (a real database); queries, explain and views behave the same on both.

The active connection shows in the status bar; a query document can pin one. Project stores live in `.oxilite/studio.sqlite` (git-ignored) and are rebuilt from files, so updates to them are discarded on reload. Attached stores are a local `.sqlite` file, a wrangler D1 file under `.wrangler/state`, or a remote D1 database over the HTTP API with credentials in VS Code SecretStorage. Writes to an attached store need confirmation, D1 connections open read-only by default and D1 writes show estimated billed rows; each D1 result shows its requests and rows read and written. D1 tokens live in VS Code's secret storage and D1 connections are restored when the server restarts. See [[decisions#S3 Project stores are derived, attached stores are real]] and [[decisions#S11 Attached stores are local SQLite and D1]].

## Project manifest

`oxilite.toml` declares graphs, file roles, the shapes and rules sets, the reasoning profile and tests; without it, conventions infer the same from files.

Roles are data, ontology, shapes and rules. Shapes are not loaded as data. A manifest graph IRI is a view over the per-file graphs mapped to it ([[architecture#Reload pipeline]]). A "Create manifest" command writes one from the detected conventions. See [[decisions#S4 Convention first, manifest optional]].

## Reload pipeline

Keystrokes give parse diagnostics from the buffer; a save replaces that file's quads in one atomic request, then re-reasons and revalidates only what changed.

Re-materialization runs when an ontology or rules file changed or the profile is materialized OWL 2 RL; query-time rewriting needs none. SHACL reruns on focus nodes touched by the file, or everywhere when shapes changed. A newer save cancels an in-flight run. Loading also records a source-position index (quad to file and range) kept in memory, which drives diagnostics, hover and go-to-definition. See [[decisions#S10 Per-file reload with a cancellable pipeline]].

## Reasoning and provenance

Reasoning is chosen per connection or query: none, RDFS, OWL QL rewriting, or materialized OWL 2 RL plus rules; inferred triples carry their producer and a justification.

Requires oxilite core work: a producer column on `quads_inf` so each producer is replaced independently, and on-demand justification that re-derives a triple by running each rule body with its head bound, recursively, into a proof tree. Results and the resource view badge rows as asserted or inferred and offer "Why?". See [[decisions#S5 Inferences carry provenance and justifications]].

## Validation

SHACL runs through `oxilite-validate` over asserted plus inferred triples; each result is a diagnostic at the focus triple's source line, linked to the failing shape.

A report view groups results by shape or focus node and exports an `sh:ValidationReport`. An inferred focus triple links to its justification. Attached stores without source files use the report view only. ShEx follows. See [[decisions#S6 SHACL validates asserted plus inferred data, live]].

## Language support

Turtle/TriG, SPARQL, oxilite Datalog and openCypher get diagnostics, completion, hover and go-to-definition in v1; JSON-LD in v2. Run and explain work on `.rq`, `.dl` and `.cypher` files alike.

Diagnostics come from the strict parsers and, for Datalog, oxilite's stratification and safety checks. Completion uses a lenient scanner for position (subject, predicate, after a prefix) and the store's predicate and class statistics for candidates. TextMate grammars give baseline highlighting; semantic tokens come later. See [[decisions#S7 Own parsers with a lenient completion scanner]].

## Views

React + Vite webviews render serializable payloads: a virtualized results grid, a Cytoscape graph, a plan and proof-tree view, a resource view and a Store Explorer.

### Results grid

Implemented in S0: a React webview per query document, beside the editor, showing a TanStack table with virtualized rows; terms are printed by [[shared/terms.ts#formatTerm]].

Every payload becomes a table ([[shared/terms.ts#toTable]]): solutions as they are, graphs as subject, predicate and object, booleans as one cell. The last result is kept in webview state, so it survives the panel reloading. Terms are coloured by kind from the VS Code theme.

### Query history

Every run is remembered per workspace (newest first, 200 at most) with its connection and result summary; opening an entry restores the query in a new editor. See [[src/history.ts#QueryHistory]].

### Connections view

The activity bar lists the connections with triple counts; clicking one activates it, and the status bar shows the active one. Attach, detach and reload live on the view's title bar. See [[src/connectionsView.ts#ConnectionsView]].

### Store Explorer

A lazy tree of graphs, the class hierarchy with asserted and inferred instance counts, properties by use, files with their roles, and prefixes; IRIs open the resource view, files open in the editor. See [[src/explorerView.ts#ExplorerView]].

### Resource view and SHACL report

One reusable panel each on the shared webview bundle. The resource view lists a resource's statements both ways with inferred ones badged by producer; the report groups SHACL results by shape or focus node. See [[src/panels.ts#SinglePanel]].

IRIs anywhere in the webviews (grid cells included) open the resource view, and locations open the file at the line. The status bar shows the reasoning profile (click to change it when no manifest sets it) and the SHACL state (click for the report).

### Graph view

Cytoscape draws CONSTRUCT and DESCRIBE results, Cypher nodes, relationships and paths, and a resource's neighbourhood; inferred edges are dashed and IRI nodes open the resource view. See [[shared/graph.ts#graphOf]].

The node-link model is built by pure functions ([[shared/graph.ts#fromQuads]], [[shared/graph.ts#fromCypher]], [[shared/graph.ts#fromDescription]]) and capped at 1500 nodes, with the rest counted. Results with a graph get a table/graph toggle; the resource view has one too.

### Why view

Inferred statements in the resource view have a "why?" link opening the proof tree: each inference with its producer and rule, down to asserted statements that open at their source line. See [[shared/protocol.ts#ProofNode]].

### Test Explorer

The manifest's tests appear in VS Code's Test Explorer at their line in `oxilite.toml`; a failure shows the expected and actual results as a diff, and "Update Snapshot" rewrites a query test's expected file. See [[src/testing.ts#KgTests]].

### Notebooks

`.oxnb` notebooks mix Markdown with SPARQL, Datalog and Cypher cells run against the active connection; outputs are saved in the file and drawn by the oxilite renderer. See [[src/notebook.ts#OxNotebookController]].

The renderer ([[webview/src/renderer.tsx#activate]]) hosts the same components as the panels; the components reach their host only through `post` ([[webview/src/host.ts#setPost]]), so IRIs in notebook outputs open the resource view too. Outputs keep a plain-text summary for other viewers.

### Ontology diagram, rules debugger, search

The ontology diagram draws classes (with datatype properties and instance counts), subclass links and object properties in the graph view. See [[shared/graph.ts#fromOntology]].

"Debug Rules" on a `.dl` file shows each rule's body matches and head facts, flags empty and exploding rules, and lists the strata; lines open the rule. "Full-Text Search" runs `oxl:textMatch` over string literals into a results panel.

### Still to come

Paging the grid from the server instead of capping it, a structured plan tree, and the v2 items: JSON-LD and credentials, schema diff, in-editor chat, generic SPARQL endpoints and W3C test manifests. See [[decisions#S8 React webviews with serializable result payloads]].

## Testing

Manifest tests are run by `oxilite check` and by the server for Test Explorer, each in an isolated overlay rolled back afterwards.

Kinds: query results against an expected results file, SHACL conformance or expected violations, and entailed or not-entailed triples. Failures show diffs and link to justifications; "Update snapshot" rewrites the expected file. See [[decisions#S12 Knowledge-graph tests in the manifest]].

## Agent tools

`oxilite mcp` exposes query, schema summary, validate and why as MCP tools; the extension registers it for the workspace and can copy its config for other agents. See [[decisions#S13 Agents through MCP tools, not an in-editor chat]].

The MCP server loads its own in-memory copy of the project from the files, so it agrees with the studio without sharing its process. Registration uses VS Code's MCP server definition provider; "Copy MCP Server Config" gives the same command for `.mcp.json`.

## Packaging

The server ships from the oxilite monorepo as `oxilite studio-server`; this repo builds platform-specific VSIXes that bundle the matching binary.

Targets: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64. The logo (`media/logo.svg`, rendered to `media/icon.png`) derives from oxilite's: the same tile and graph-quill, one dashed orange inferred edge, and an editor-window badge in place of the edge cloud; `media/activity.svg` is its monochrome quill for the activity bar. The setting `oxilite.server.path` points at a local build. See [[decisions#S9 Server in the oxilite monorepo, extension in this repo]].
