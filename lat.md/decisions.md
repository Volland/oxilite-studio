# Decisions

Architecture decisions agreed during the design interview (2026-09-24), each with its rationale and the alternatives rejected.

## S1 Two primary users: modellers and app developers

The studio serves knowledge engineers (edit ontologies, shapes and rules; reason; validate) and app developers (query a real store; tune plans) equally.

Modellers are the differentiator: no VS Code tool combines reasoning, SHACL and Datalog over one store. App developers need the query workbench to adopt it. Dogfooding oxilite itself is served by the CLI and tests, not the extension. See [[architecture#Connections]].

## S2 Rust language server as a separate process

The engine runs in `oxilite studio-server`, a Rust LSP server over stdio with custom `oxilite/*` requests; the TypeScript extension is a thin client owning the UI.

Rejected: `@oxilite/node` in the extension host (a panic or long materialization blocks every extension, cancellation is hard, SHACL is not bound), `oxilite serve` over HTTP (SPARQL only, no language features) and WebAssembly (cannot open the user's SQLite files; `reasonable` and rudof do not target it). The server links `oxilite-validate` directly, so SHACL needs no new binding. See [[architecture#Process model]].

## S3 Project stores are derived, attached stores are real

A connection is either a Project store rebuilt from workspace files into a git-ignored scratch SQLite, or an Attached store whose updates persist.

Files-first suits modellers (diffable, reproducible); attached stores suit app developers. Keeping the two kinds explicit prevents an update silently mutating a cache that the next reload discards, and a reload wiping a real database. Attached writes need confirmation. See [[architecture#Connections]].

## S4 Convention first, manifest optional

Any folder of RDF files works without setup; an optional `oxilite.toml` manifest, once present, fully defines graphs, roles, reasoning, rules and tests.

Convention: a file's graph is its file IRI; roles come from extension and content (`.dl` rules, `owl:Ontology` ontology, `sh:` shapes). The manifest gives stable graph IRIs, keeps shapes out of the data graph and is the input to headless `oxilite check`. See [[architecture#Project manifest]].

## S5 Inferences carry provenance and justifications

Every inferred triple can answer "why?" with a proof tree, and inferences are stored per producer (OWL 2 RL, rule file, rule) instead of one shared set.

Explaining unexpected entailments is the most frequent debugging task in modelling. This needs an oxilite core change: `quads_inf` gets a producer column, so re-running one rule set no longer replaces the others, and the server re-derives a triple on demand by running each rule body with its head bound. See [[architecture#Reasoning and provenance]].

## S6 SHACL validates asserted plus inferred data, live

Validation runs on save over asserted plus inferred triples at the store's reasoning level, and each result becomes a VS Code diagnostic at the triple's source line.

Ignoring the ontology produces false violations (`sh:class` against a subclass instance). A toggle restricts to asserted triples. Diagnostics need a source-position index built at load; without source files (attached stores) results appear only in the report view. ShEx follows later on the same pipeline. See [[architecture#Validation]].

## S7 Own parsers with a lenient completion scanner

Turtle, SPARQL, Datalog and Cypher language support is built in the one server on oxilite's own parsers, with a separate lenient scanner for completion context.

The strict parsers (`oxttl`, `spargebra`, the Datalog and Cypher parsers) match oxilite's grammar exactly, including RDF 1.2; the valuable completions come from the connected store. Rejected: Qlue-ls or Stardog language servers (a second process, version skew). See [[architecture#Language support]].

## S8 React webviews with serializable result payloads

Webviews are React + Vite with a virtualized grid, Cytoscape graphs and a plan/proof-tree view; every view renders a serializable payload, never a live server handle.

The grid, graph and plan views are where library availability saves the most effort. Serializable payloads let the same components render inside a notebook and persist outputs. See [[architecture#Views]].

## S9 Server in the oxilite monorepo, extension in this repo

`oxilite studio-server` and `oxilite check` live in the oxilite monorepo next to the core; the TypeScript extension and webviews live here.

Provenance and justification land in the same pull requests as the features they serve, and the CLI and live diagnostics share one code path. Releases are platform-specific VSIXes bundling the binary; `oxilite.server.path` overrides it for development. No download on first run: it breaks offline use. See [[architecture#Packaging]].

## S10 Per-file reload with a cancellable pipeline

Each graph is replaced as a unit: a changed file's graph is cleared and refilled from its files, then reasoning and validation rerun on what the change affects.

Without a manifest a graph is one file, so this is per-file replace; with one, graphs are small groups of files. Replacing per graph avoids tracking which quads each file contributed. Keystrokes produce parse diagnostics only; saves run the store pipeline, and a newer change makes an in-flight validation stop or be dropped. Full re-materialization after an ontology edit is accepted (oxilite rebuilds from scratch). Budget: about 1M triples, save to diagnostics in under 2 s without materialization. See [[architecture#Reload pipeline]].

## S11 Attached stores are local SQLite and D1

An attached store is a local `.sqlite` file, a local wrangler D1 file, or a remote D1 database over its HTTP API; generic SPARQL endpoints are deferred.

D1 is oxilite's distinguishing target, and the sans-IO core makes HTTP D1 another backend. Generic endpoints would support only query and update and dilute the focus. D1 connections can be read-only; writes show estimated billed rows; materialization on D1 is an explicit command behind a cost dialog, since it is not atomic across rounds. See [[architecture#Connections]].

## S12 Knowledge-graph tests in the manifest

Tests (query results, SHACL conformance or expected violations, entailments and non-entailments) are declared in the manifest, run by `oxilite check` and shown in Test Explorer.

This makes RDF projects testable in CI with the same code as the editor. Fixtures load into an isolated overlay rolled back after each test. W3C `mf:` manifests come later. See [[architecture#Testing]].

## S13 Agents through MCP tools, not an in-editor chat

The server exposes query, schema, validate and "why?" as MCP tools so any agent can use a connection; an in-editor chat UI is deferred to v2.

The operations already exist in the server, so the tools are cheap and work with every agent client. See [[architecture#Agent tools]].
